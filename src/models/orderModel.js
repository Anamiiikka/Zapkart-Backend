const { pool } = require('../config/db');

/**
 * Get a single order with items + status history.
 * Non-admins can only see their own orders.
 */
async function getOrderById(orderId, userId, isAdmin) {
  const params = [orderId];
  let userCondition = '';

  if (!isAdmin) {
    params.push(userId);
    userCondition = `AND o.user_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT
       o.id,
       o.user_id,
       o.store_id,
       o.status,
       o.total_amount,
       o.delivery_fee,
       o.surge_multiplier,
       o.delivery_address,
       o.estimated_delivery_minutes,
       o.placed_at,
       o.delivered_at,
       o.agent_id,
       (SELECT json_agg(
         json_build_object(
           'id', oi.id,
           'productId', oi.product_id,
           'quantity', oi.quantity,
           'unitPrice', oi.unit_price,
           'subtotal', oi.subtotal
         ) ORDER BY oi.id
       ) FROM order_items oi WHERE oi.order_id = o.id
       ) AS items,
       (SELECT json_agg(
         json_build_object(
           'fromStatus', sh.from_status,
           'toStatus', sh.to_status,
           'changedAt', sh.created_at,
           'changedBy', sh.changed_by
         ) ORDER BY sh.created_at
       ) FROM order_status_history sh WHERE sh.order_id = o.id
       ) AS "statusHistory"
     FROM orders o
     WHERE o.id = $1
       AND o.deleted_at IS NULL
       ${userCondition}`,
    params
  );

  return result.rows[0] || null;
}

/**
 * List orders for a specific user (paginated).
 */
async function listUserOrders(userId, limit, offset) {
  const result = await pool.query(
    `SELECT
       id, store_id, status, total_amount, delivery_fee,
       surge_multiplier, estimated_delivery_minutes,
       placed_at, delivered_at, agent_id
     FROM orders
     WHERE user_id = $1
       AND deleted_at IS NULL
     ORDER BY placed_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

/**
 * Count total orders for a user (for pagination metadata).
 */
async function countUserOrders(userId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM orders
     WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return result.rows[0].count;
}

/**
 * List all orders (admin) with optional status/store filters.
 */
async function listAllOrders({ status, storeId, agentId, limit, offset }) {
  const conditions = ['deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`status = $${idx}`);
    params.push(status);
    idx++;
  }

  if (storeId) {
    conditions.push(`store_id = $${idx}`);
    params.push(storeId);
    idx++;
  }

  if (agentId) {
    conditions.push(`agent_id = $${idx}`);
    params.push(agentId);
    idx++;
  }

  params.push(limit);
  params.push(offset);

  const result = await pool.query(
    `SELECT
       id, user_id, store_id, status, total_amount,
       delivery_fee, surge_multiplier, placed_at, delivered_at, agent_id
     FROM orders
     WHERE ${conditions.join(' AND ')}
     ORDER BY placed_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return result.rows;
}

/**
 * Count all orders (admin) with optional filters (for pagination).
 */
async function countAllOrders({ status, storeId, agentId }) {
  const conditions = ['deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  if (status) {
    conditions.push(`status = $${idx}`);
    params.push(status);
    idx++;
  }

  if (storeId) {
    conditions.push(`store_id = $${idx}`);
    params.push(storeId);
    idx++;
  }

  if (agentId) {
    conditions.push(`agent_id = $${idx}`);
    params.push(agentId);
    idx++;
  }

  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM orders
     WHERE ${conditions.join(' AND ')}`,
    params
  );

  return result.rows[0].count;
}

async function updateOrderStatus(client, orderId, newStatus) {
  const result = await client.query(
    `UPDATE orders
     SET status = $2::text,
         delivered_at = CASE WHEN $2::text = 'delivered' THEN NOW() ELSE delivered_at END
     WHERE id = $1
       AND deleted_at IS NULL
     RETURNING id, user_id, store_id, status, total_amount, delivery_fee,
              surge_multiplier, delivery_address, estimated_delivery_minutes,
              placed_at, delivered_at, agent_id`,
    [orderId, newStatus]
  );
  return result.rows[0] || null;
}

async function insertStatusHistory(client, { orderId, fromStatus, toStatus, changedBy }) {
  await client.query(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [orderId, fromStatus, toStatus, changedBy]
  );
}

async function getOrderRaw(client, orderId) {
  const result = await client.query(
    `SELECT o.*,
       json_agg(
         json_build_object(
           'productId', oi.product_id,
           'quantity', oi.quantity
         )
       ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.id = $1 AND o.deleted_at IS NULL
     GROUP BY o.id`,
    [orderId]
  );
  return result.rows[0] || null;
}

async function softDeleteOrder(orderId) {
  await pool.query(
    `UPDATE orders
     SET deleted_at = NOW()
     WHERE id = $1`,
    [orderId]
  );
}

// ── Agent-order integration ─────────────────────────────────────────

/**
 * Get order with joined agent details.
 */
async function findOrderByIdWithAgent(orderId) {
  const result = await pool.query(
    `SELECT
       o.id, o.user_id, o.store_id, o.status, o.total_amount,
       o.delivery_fee, o.surge_multiplier, o.delivery_address,
       o.estimated_delivery_minutes, o.placed_at, o.delivered_at, o.agent_id,
       a.name  AS agent_name,
       a.phone AS agent_phone,
       a.current_latitude  AS agent_latitude,
       a.current_longitude AS agent_longitude
     FROM orders o
     LEFT JOIN agents a ON a.id = o.agent_id
     WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [orderId]
  );
  return result.rows[0] || null;
}

/**
 * List orders assigned to a specific agent, optionally filtered by status.
 * Joins users and dark_stores for enriched display data.
 */
async function findAgentOrders(agentId, status, limit = 50, offset = 0) {
  const conditions = ['o.agent_id = $1', 'o.deleted_at IS NULL'];
  const params = [agentId];
  let idx = 2;

  if (status) {
    conditions.push(`o.status = $${idx}`);
    params.push(status);
    idx++;
  }

  params.push(limit, offset);

  const result = await pool.query(
    `SELECT
       o.id, o.user_id, o.store_id, o.status, o.total_amount,
       o.delivery_fee, o.delivery_address, o.estimated_delivery_minutes,
       o.placed_at, o.delivered_at, o.agent_id,
       u.name  AS customer_name,
       ds.name AS store_name
     FROM orders o
     JOIN users       u  ON u.id  = o.user_id
     JOIN dark_stores ds ON ds.id = o.store_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY o.placed_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  return result.rows;
}

/**
 * Atomically assign an agent to an order and set status = 'assigned'.
 */
async function assignAgentToOrder(client, orderId, agentId) {
  const result = await client.query(
    `UPDATE orders
     SET agent_id = $2,
         status = 'assigned'
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, user_id, store_id, status, total_amount,
              delivery_fee, agent_id, placed_at`,
    [orderId, agentId]
  );
  return result.rows[0] || null;
}

module.exports = {
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
};
