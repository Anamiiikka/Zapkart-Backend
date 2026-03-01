const logger = require('../config/logger');
const { pool } = require('../config/db');
const { findBestStore } = require('./storeMatchingService');
const {
  getOrderById,
  listUserOrders,
  countUserOrders,
  listAllOrders,
  countAllOrders,
  updateOrderStatus,
  insertStatusHistory,
  getOrderRaw,
  softDeleteOrder,
  findOrderByIdWithAgent,
  findAgentOrders,
  assignAgentToOrder,
} = require('../models/orderModel');
const { getAgentById, updateAgentStatus } = require('../models/agentModel');
const {
  releaseInventoryReservation,
  deductInventoryOnDelivery,
} = require('../models/inventoryModel');
const {
  NotFoundError,
  OutOfStockError,
  ValidationError,
  AuthError,
} = require('../utils/errors');

// ── Constants ───────────────────────────────────────────────────────
const BASE_DELIVERY_FEE = 25; // INR
const SURGE_THRESHOLDS = [
  { maxOrders: 5, multiplier: 1.0 },
  { maxOrders: 10, multiplier: 1.1 },
  { maxOrders: 20, multiplier: 1.25 },
  // anything above → 1.5
];
const DEFAULT_SURGE = 1.5;

const LOAD_WINDOW_MINUTES = 10;

// ETA parameters
const ETA_BASE_MINUTES = 10; // picking + packing
const ETA_PER_KM = 3; // travel time per km
const ETA_BUFFER = 5; // safety buffer

// ── Pure helpers (exported for unit-testing) ────────────────────────

/**
 * Tiered surge multiplier based on active order count.
 * @param {number} activeOrders
 * @returns {number}
 */
function calculateSurgeMultiplier(activeOrders) {
  for (const tier of SURGE_THRESHOLDS) {
    if (activeOrders < tier.maxOrders) return tier.multiplier;
  }
  return DEFAULT_SURGE;
}

/**
 * Distance-based ETA: base + travel + buffer.
 * Phase 6 will factor in agent availability / load.
 * @param {number} distanceKm
 * @returns {number} estimated minutes (rounded)
 */
function calculateEtaMinutes(distanceKm) {
  return Math.round(ETA_BASE_MINUTES + distanceKm * ETA_PER_KM + ETA_BUFFER);
}

// ── Main service ────────────────────────────────────────────────────

/**
 * Place an order with full transaction safety + optimistic locking.
 *
 * Flow: validate → store-match → price snapshot → surge → reserve inventory
 *       → create order + items + status history → COMMIT
 *
 * @param {Object}  params
 * @param {Object}  params.user           – req.user { id, role, delivery_address, latitude, longitude }
 * @param {{productId: number, quantity: number}[]} params.items – cart items
 * @param {string}  [params.deliveryAddress] – override user address
 * @param {{latitude: number, longitude: number}} [params.userLocation] – override user coords
 * @param {string}  [params.idempotencyKey]  – reserved for future payment safety
 * @returns {Promise<Object>} created order with enriched items
 */
async function placeOrder({ user, items, deliveryAddress, userLocation, idempotencyKey }) {
  const startTime = Date.now();
  const log = logger.child({ module: 'orderService', userId: user.id });

  log.info(
    { itemCount: items?.length, idempotencyKey },
    'Order placement started'
  );

  // ── 1) VALIDATE INPUTS ─────────────────────────────────────────
  if (!items?.length) {
    throw new ValidationError('Cart cannot be empty');
  }

  for (const item of items) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) {
      throw new ValidationError('Invalid product ID');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ValidationError('Invalid quantity');
    }
  }

  const location = userLocation || {
    latitude: user.latitude,
    longitude: user.longitude,
  };

  if (
    typeof location.latitude !== 'number' ||
    typeof location.longitude !== 'number'
  ) {
    throw new ValidationError(
      'User location is required — provide userLocation or ensure user profile has coordinates'
    );
  }

  const productIds = items.map((i) => i.productId);

  // ── 2) SMART STORE MATCHING (read-only, before transaction) ────
  const store = await findBestStore(user.id, items, location);

  log.debug(
    {
      storeId: store.id,
      storeName: store.name,
      score: store.score?.toFixed(3),
      distanceKm: +(store.distance_meters / 1000).toFixed(2),
    },
    'Store matched for order'
  );

  // ── 3) BEGIN TRANSACTION ───────────────────────────────────────
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── 4) FETCH PRODUCT PRICES (snapshot) ─────────────────────
    const productRows = await client.query(
      `SELECT id, name, base_price
       FROM products
       WHERE id = ANY($1::bigint[]) AND deleted_at IS NULL`,
      [productIds]
    );

    const productMap = new Map(productRows.rows.map((p) => [Number(p.id), p]));

    const enrichedItems = [];
    let totalProductsAmount = 0;

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundError(`Product ${item.productId} not found`);
      }

      const unitPrice = parseFloat(product.base_price);
      const subtotal = +(unitPrice * item.quantity).toFixed(2);
      totalProductsAmount += subtotal;

      enrichedItems.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        subtotal,
      });
    }

    totalProductsAmount = +totalProductsAmount.toFixed(2);

    // ── 5) SURGE PRICING ──────────────────────────────────────
    const recentOrdersResult = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM orders
       WHERE store_id = $1
         AND status IN ('pending','confirmed','picking','out_for_delivery')
         AND placed_at >= NOW() - ($2 || ' minutes')::interval`,
      [store.id, String(LOAD_WINDOW_MINUTES)]
    );
    const recentOrders = recentOrdersResult.rows[0].count;
    const surgeMultiplier = calculateSurgeMultiplier(recentOrders);

    // ── 6) PRICING + ETA ──────────────────────────────────────
    const deliveryFee = +(BASE_DELIVERY_FEE * surgeMultiplier).toFixed(2);
    const totalAmount = +(totalProductsAmount + deliveryFee).toFixed(2);
    const distanceKm = store.distance_meters / 1000;
    const estimatedDeliveryMinutes = calculateEtaMinutes(distanceKm);

    // ── 7) RESERVE INVENTORY (optimistic locking — CRITICAL) ──
    for (const item of enrichedItems) {
      const result = await client.query(
        `UPDATE inventory
         SET reserved_quantity = reserved_quantity + $3,
             version = version + 1,
             updated_at = NOW()
         WHERE store_id = $1
           AND product_id = $2
           AND (quantity - reserved_quantity) >= $3
         RETURNING id, quantity, reserved_quantity`,
        [store.id, item.productId, item.quantity]
      );

      if (result.rowCount === 0) {
        log.warn(
          { storeId: store.id, productId: item.productId },
          'Inventory reservation failed — rolling back'
        );
        throw new OutOfStockError(
          `Insufficient stock for product ${item.productId} at store ${store.id}`
        );
      }
    }

    log.debug(
      {
        storeId: store.id,
        totalProductsAmount,
        deliveryFee,
        surgeMultiplier,
      },
      'All inventory reserved'
    );

    // ── 8) CREATE ORDER ───────────────────────────────────────
    const orderResult = await client.query(
      `INSERT INTO orders (
         user_id, store_id, status, total_amount, delivery_fee,
         surge_multiplier, delivery_address, estimated_delivery_minutes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         id, user_id, store_id, status, total_amount, delivery_fee,
         surge_multiplier, delivery_address, estimated_delivery_minutes,
         placed_at`,
      [
        user.id,
        store.id,
        'pending',
        totalAmount,
        deliveryFee,
        surgeMultiplier,
        deliveryAddress || user.delivery_address,
        estimatedDeliveryMinutes,
      ]
    );

    const order = orderResult.rows[0];

    // ── 9) CREATE ORDER ITEMS (parameterised — no SQL injection) ─
    if (enrichedItems.length > 0) {
      const valuesClauses = [];
      const params = [];
      let idx = 1;

      for (const item of enrichedItems) {
        valuesClauses.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
        params.push(order.id, item.productId, item.quantity, item.unitPrice, item.subtotal);
        idx += 5;
      }

      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
         VALUES ${valuesClauses.join(', ')}`,
        params
      );
    }

    // ── 10) STATUS HISTORY ────────────────────────────────────
    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
       VALUES ($1, NULL, $2, $3)`,
      [order.id, 'pending', user.id]
    );

    await client.query('COMMIT');

    const durationMs = Date.now() - startTime;
    log.info(
      {
        orderId: order.id,
        storeId: store.id,
        totalAmount,
        surgeMultiplier,
        estimatedDeliveryMinutes,
        durationMs,
      },
      'Order placed successfully'
    );

    return {
      id: order.id,
      status: order.status,
      totalAmount: parseFloat(order.total_amount),
      deliveryFee: parseFloat(order.delivery_fee),
      surgeMultiplier: parseFloat(order.surge_multiplier),
      deliveryAddress: order.delivery_address,
      estimatedDeliveryMinutes: order.estimated_delivery_minutes,
      placedAt: order.placed_at,
      store: {
        id: store.id,
        name: store.name,
        areaName: store.area_name,
        distanceMeters: store.distance_meters,
      },
      items: enrichedItems,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {}); // swallow rollback errors
    log.error(
      { err: error, durationMs: Date.now() - startTime },
      'Order placement failed'
    );
    throw error;
  } finally {
    client.release();
  }
}

// ── Read operations (Phase 5.3) ─────────────────────────────────────

/**
 * Get a single order by ID.
 * Customers can only see their own; admins can see any.
 */
async function getOrder(orderId, user) {
  const isAdmin = user.role === 'admin';
  const order = await getOrderById(orderId, user.id, isAdmin);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  return order;
}

/**
 * Paginated list of orders for a specific customer.
 */
async function listOrdersForUser(userId, page = 1, pageSize = 20) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    listUserOrders(userId, limit, offset),
    countUserOrders(userId),
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Paginated list of all orders (admin only), with optional filters.
 */
async function listAllOrdersAdmin({ status, storeId, agentId, page = 1, pageSize = 20 }) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    listAllOrders({ status, storeId, agentId, limit, offset }),
    countAllOrders({ status, storeId, agentId }),
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ── Valid status transitions ────────────────────────────────────────
const VALID_TRANSITIONS = {
  pending:          ['confirmed', 'cancelled'],
  confirmed:        ['assigned', 'picking', 'cancelled'],
  assigned:         ['picking'],
  picking:          ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered:        [],  // terminal
  cancelled:        []   // terminal
};

/**
 * Change an order's status with full transition validation,
 * inventory side-effects (cancel → release, deliver → deduct),
 * and low-stock alerts.
 */
async function changeOrderStatus({ orderId, newStatus, actor }) {
  const requestId = logger.getRequestId?.() || 'no-cid';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1) Fetch order with items (inside transaction)
    const order = await getOrderRaw(client, orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    // 2) Ownership check for customer cancellation
    if (actor.role === 'customer' && Number(order.user_id) !== Number(actor.id)) {
      throw new AuthError('You can only modify your own orders');
    }

    // 3) Validate transition
    const allowed = VALID_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Cannot transition from '${order.status}' to '${newStatus}'`
      );
    }

    // 4) Customer can only cancel
    if (actor.role === 'customer' && newStatus !== 'cancelled') {
      throw new AuthError('Customers can only cancel orders');
    }

    // 5) Handle inventory side-effects
    const items = order.items.filter(Boolean); // guard against null from LEFT JOIN

    if (newStatus === 'cancelled') {
      // Release reservations
      for (const item of items) {
        await releaseInventoryReservation(
          client,
          order.store_id,
          Number(item.productId),
          item.quantity
        );
      }
      logger.info('Inventory reservations released on cancel', {
        requestId,
        orderId,
        storeId: order.store_id
      });
    }

    if (newStatus === 'delivered') {
      // Permanently deduct inventory + check low stock
      for (const item of items) {
        const updated = await deductInventoryOnDelivery(
          client,
          order.store_id,
          Number(item.productId),
          item.quantity
        );

        if (!updated) {
          throw new Error(
            `Failed to deduct inventory for product ${item.productId}`
          );
        }

        // LOW STOCK ALERT
        if (updated.quantity <= updated.low_stock_threshold) {
          logger.warn('Low stock alert', {
            requestId,
            storeId: order.store_id,
            productId: updated.product_id,
            remainingQuantity: updated.quantity,
            threshold: updated.low_stock_threshold
          });
        }
      }
    }

    // 6) Update order status
    const updatedOrder = await updateOrderStatus(client, orderId, newStatus);

    // 7) Insert status history
    await insertStatusHistory(client, {
      orderId,
      fromStatus: order.status,
      toStatus: newStatus,
      changedBy: actor.id
    });

    await client.query('COMMIT');

    logger.info('Order status changed', {
      requestId,
      orderId,
      fromStatus: order.status,
      toStatus: newStatus,
      changedBy: actor.id,
      actorRole: actor.role
    });

    return updatedOrder;

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Order status change failed', {
      requestId,
      orderId,
      newStatus,
      error: err.message
    });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  placeOrder,
  getOrder,
  listOrdersForUser,
  listAllOrdersAdmin,
  changeOrderStatus,
  calculateSurgeMultiplier,
  calculateEtaMinutes,
  assignAgentToOrderService,
  autoAssignOrder,
  agentNextStatusService,
  getAgentOrderDetails,
  listAgentOrders,
  getOrderTrack,
};

// ── Real-time order tracking ─────────────────────────────────────────

/**
 * Returns a tracking snapshot for a given order:
 *   - current status + full status history
 *   - store name + address
 *   - agent name, phone, current location (if assigned)
 *   - ETA and delivery timestamps
 * RBAC: customers see own orders only; agents see their orders; admins see all.
 */
async function getOrderTrack(orderId, actor) {
  const result = await pool.query(
    `SELECT
       o.id, o.status, o.delivery_address,
       o.estimated_delivery_minutes, o.placed_at, o.delivered_at,
       o.total_amount, o.delivery_fee,
       o.user_id, o.agent_id,
       ds.name                  AS store_name,
       ds.address               AS store_address,
       a.name                   AS agent_name,
       a.phone                  AS agent_phone,
       a.current_latitude       AS agent_latitude,
       a.current_longitude      AS agent_longitude,
       (
         SELECT json_agg(
           json_build_object(
             'from',      sh.from_status,
             'to',        sh.to_status,
             'changedAt', sh.created_at
           ) ORDER BY sh.created_at
         )
         FROM order_status_history sh
         WHERE sh.order_id = o.id
       ) AS status_history
     FROM orders o
     JOIN dark_stores ds ON ds.id = o.store_id
     LEFT JOIN agents  a  ON a.id  = o.agent_id
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orderId]
  );

  const order = result.rows[0];
  if (!order) throw new NotFoundError('Order not found');

  // RBAC
  if (actor.role === 'customer' && Number(order.user_id) !== Number(actor.id)) {
    throw new AuthError('You can only track your own orders');
  }
  if (actor.role === 'agent' && Number(order.agent_id) !== Number(actor.agentId)) {
    throw new AuthError('You can only track orders assigned to you');
  }

  // Estimate remaining time for in-progress orders
  let etaRemainingMinutes = null;
  if (!['delivered', 'cancelled'].includes(order.status)) {
    const elapsed = (Date.now() - new Date(order.placed_at).getTime()) / 60_000;
    etaRemainingMinutes = Math.max(0, Math.round(order.estimated_delivery_minutes - elapsed));
  }

  return {
    orderId:    order.id,
    status:     order.status,
    placedAt:   order.placed_at,
    deliveredAt: order.delivered_at,
    estimatedDeliveryMinutes: order.estimated_delivery_minutes,
    etaRemainingMinutes,
    deliveryAddress: order.delivery_address,
    store: {
      name:    order.store_name,
      address: order.store_address,
    },
    agent: order.agent_id ? {
      name:      order.agent_name,
      phone:     order.agent_phone,
      latitude:  order.agent_latitude,
      longitude: order.agent_longitude,
    } : null,
    statusHistory: order.status_history || [],
  };
}

// ── Agent-order integration services ────────────────────────────────

/**
 * Admin assigns an agent to a confirmed/pending order.
 * Sets order status → 'assigned' and agent status → 'busy'.
 */
async function assignAgentToOrderService(orderId, agentId, actor) {
  if (actor.role !== 'admin') {
    throw new AuthError('Only admins can assign agents');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate order exists and is in an assignable state
    const order = await getOrderRaw(client, orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new ValidationError(
        `Cannot assign agent: order is '${order.status}', must be 'pending' or 'confirmed'`
      );
    }
    if (order.agent_id) {
      throw new ValidationError('Order already has an agent assigned');
    }

    // 2. Validate agent exists and is available
    const agent = await getAgentById(agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    if (agent.status !== 'available') {
      throw new ValidationError(`Agent is currently '${agent.status}', must be 'available'`);
    }

    // 3. Assign agent to order (atomic: sets status → 'assigned')
    const updated = await assignAgentToOrder(client, orderId, agentId);

    // 4. Mark agent as busy
    await client.query(
      `UPDATE agents SET status = 'busy', updated_at = NOW() WHERE id = $1`,
      [agentId]
    );

    // 5. Record status history
    await insertStatusHistory(client, {
      orderId,
      fromStatus: order.status,
      toStatus: 'assigned',
      changedBy: actor.id,
    });

    await client.query('COMMIT');

    logger.info('Agent assigned to order', {
      orderId, agentId, fromStatus: order.status, assignedBy: actor.id,
    });

    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Agent advances their own order through the linear flow:
 *   assigned → picking → out_for_delivery → delivered
 * On delivery: marks agent back to 'available'.
 */
const AGENT_STATUS_FLOW = {
  assigned:         'picking',
  picking:          'out_for_delivery',
  out_for_delivery: 'delivered',
};

async function agentNextStatusService(orderId, actor) {
  if (!actor.agentId) {
    throw new AuthError('No agent profile linked to this user');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = await getOrderRaw(client, orderId);
    if (!order) throw new NotFoundError('Order not found');

    // Ownership: agent can only advance their own orders
    if (Number(order.agent_id) !== Number(actor.agentId)) {
      throw new AuthError('You can only advance orders assigned to you');
    }

    const nextStatus = AGENT_STATUS_FLOW[order.status];
    if (!nextStatus) {
      throw new ValidationError(
        `Cannot advance order from '${order.status}' — no next status in agent flow`
      );
    }

    // Update order status
    const updated = await updateOrderStatus(client, orderId, nextStatus);

    // Record history
    await insertStatusHistory(client, {
      orderId,
      fromStatus: order.status,
      toStatus: nextStatus,
      changedBy: actor.id,
    });

    // If delivered: handle inventory + mark agent available
    if (nextStatus === 'delivered') {
      const items = (order.items || []).filter(Boolean);
      for (const item of items) {
        const deducted = await deductInventoryOnDelivery(
          client,
          order.store_id,
          Number(item.productId),
          item.quantity
        );
        if (deducted && deducted.quantity <= deducted.low_stock_threshold) {
          logger.warn('Low stock alert', {
            storeId: order.store_id,
            productId: deducted.product_id,
            remainingQuantity: deducted.quantity,
          });
        }
      }

      // Mark agent as available again
      await client.query(
        `UPDATE agents SET status = 'available', updated_at = NOW() WHERE id = $1`,
        [actor.agentId]
      );
    }

    await client.query('COMMIT');

    logger.info('Agent advanced order status', {
      orderId, fromStatus: order.status, toStatus: nextStatus, agentId: actor.agentId,
    });

    return updated;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Auto-assign the best available agent to a confirmed/pending order.
 *
 * Strategy: agents assigned to the same store, available, within 10 km,
 * ordered by (fewest pending orders ASC, closest to store ASC).
 * Uses PostGIS ST_Distance for accurate geo calculations.
 *
 * @param {number} orderId
 * @param {Object} actor - req.user (must be admin)
 * @returns {Promise<Object>} updated order + assigned agent details
 */
const AUTO_ASSIGN_RADIUS_METERS = 10_000; // 10 km search radius

async function autoAssignOrder(orderId, actor) {
  if (actor.role !== 'admin') {
    throw new AuthError('Only admins can auto-assign agents');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Validate order
    const order = await getOrderRaw(client, orderId);
    if (!order) throw new NotFoundError('Order not found');

    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new ValidationError(
        `Cannot auto-assign: order is '${order.status}', must be 'pending' or 'confirmed'`
      );
    }
    if (order.agent_id) {
      throw new ValidationError('Order already has an agent assigned');
    }

    // 2. Find best agent via PostGIS
    //    - Must belong to the same store
    //    - Must be 'available'
    //    - Must have lat/lng set
    //    - Within search radius of the store
    //    - Sorted by fewest active orders, then closest to store
    const bestAgentResult = await client.query(
      `SELECT
         a.id            AS agent_id,
         a.name          AS agent_name,
         a.phone         AS agent_phone,
         ST_Distance(
           ST_SetSRID(ST_MakePoint(a.current_longitude, a.current_latitude), 4326)::geography,
           ds.location
         ) / 1000        AS distance_km,
         COALESCE(oc.pending_count, 0) AS pending_orders
       FROM agents a
       JOIN dark_stores ds ON ds.id = a.store_id
       LEFT JOIN (
         SELECT agent_id, COUNT(*) AS pending_count
         FROM orders
         WHERE status IN ('assigned', 'picking', 'out_for_delivery')
           AND deleted_at IS NULL
         GROUP BY agent_id
       ) oc ON oc.agent_id = a.id
       WHERE a.store_id = $1
         AND a.status = 'available'
         AND a.current_latitude  IS NOT NULL
         AND a.current_longitude IS NOT NULL
         AND ST_DWithin(
           ST_SetSRID(ST_MakePoint(a.current_longitude, a.current_latitude), 4326)::geography,
           ds.location,
           $2
         )
       ORDER BY pending_orders ASC,
                distance_km   ASC
       LIMIT 1`,
      [order.store_id, AUTO_ASSIGN_RADIUS_METERS]
    );

    if (bestAgentResult.rows.length === 0) {
      throw new NotFoundError(
        `No available agents within ${AUTO_ASSIGN_RADIUS_METERS / 1000} km of store`
      );
    }

    const bestAgent = bestAgentResult.rows[0];

    // 3. Assign agent to order
    await assignAgentToOrder(client, orderId, bestAgent.agent_id);

    // 4. Mark agent as busy
    await client.query(
      `UPDATE agents SET status = 'busy', updated_at = NOW() WHERE id = $1`,
      [bestAgent.agent_id]
    );

    // 5. Record status history
    await insertStatusHistory(client, {
      orderId,
      fromStatus: order.status,
      toStatus: 'assigned',
      changedBy: actor.id,
    });

    await client.query('COMMIT');

    logger.info('Agent auto-assigned to order', {
      orderId,
      agentId: bestAgent.agent_id,
      agentName: bestAgent.agent_name,
      distanceKm: parseFloat(bestAgent.distance_km).toFixed(2),
      pendingOrders: bestAgent.pending_orders,
      fromStatus: order.status,
    });

    // 6. Return enriched result
    const updatedOrder = await findOrderByIdWithAgent(orderId);
    return {
      ...updatedOrder,
      assignedAgent: {
        id: Number(bestAgent.agent_id),
        name: bestAgent.agent_name,
        phone: bestAgent.agent_phone,
        distanceKm: parseFloat(parseFloat(bestAgent.distance_km).toFixed(2)),
        pendingOrders: bestAgent.pending_orders,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error('Auto-assign failed', {
      orderId,
      error: err.message,
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get order details with agent info.
 * Agents see only their own; customers see their own; admins see any.
 */
async function getAgentOrderDetails(orderId, actor) {
  const order = await findOrderByIdWithAgent(orderId);
  if (!order) throw new NotFoundError('Order not found');

  // RBAC
  if (actor.role === 'customer' && Number(order.user_id) !== Number(actor.id)) {
    throw new AuthError('You can only view your own orders');
  }
  if (actor.role === 'agent' && Number(order.agent_id) !== Number(actor.agentId)) {
    throw new AuthError('You can only view orders assigned to you');
  }

  return order;
}

/**
 * List orders for the logged-in agent.
 */
async function listAgentOrders(agentId, status) {
  if (!agentId) throw new AuthError('No agent profile linked');
  return findAgentOrders(agentId, status);
}
