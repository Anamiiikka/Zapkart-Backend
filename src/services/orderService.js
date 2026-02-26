const logger = require('../config/logger');
const { pool } = require('../config/db');
const { findBestStore } = require('./storeMatchingService');
const {
  getOrderById,
  listUserOrders,
  countUserOrders,
  listAllOrders,
  countAllOrders,
} = require('../models/orderModel');
const {
  NotFoundError,
  OutOfStockError,
  ValidationError,
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
async function listAllOrdersAdmin({ status, storeId, page = 1, pageSize = 20 }) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    listAllOrders({ status, storeId, limit, offset }),
    countAllOrders({ status, storeId }),
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

module.exports = {
  placeOrder,
  getOrder,
  listOrdersForUser,
  listAllOrdersAdmin,
  calculateSurgeMultiplier,
  calculateEtaMinutes,
};
