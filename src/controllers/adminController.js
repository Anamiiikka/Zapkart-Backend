const { pool } = require('../config/db');
const { restockProductService } = require('../services/inventoryService');
const { ValidationError } = require('../utils/errors');

// ── 1. GET /admin/orders ─────────────────────────────────────────────
// All orders with optional status / store_id filters + pagination.

async function getOrdersHandler(req, res, next) {
  try {
    const { status, store_id, page = '1', pageSize = '50' } = req.query;
    const limit  = Math.min(Number(pageSize), 100);
    const offset = (Number(page) - 1) * limit;

    const conditions = ['o.deleted_at IS NULL'];
    const params     = [];
    let   idx        = 1;

    if (status) {
      conditions.push(`o.status = $${idx++}`);
      params.push(status);
    }
    if (store_id) {
      conditions.push(`o.store_id = $${idx++}`);
      params.push(Number(store_id));
    }

    params.push(limit, offset);

    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT
           o.id, o.status, o.total_amount, o.delivery_fee,
           o.delivery_address, o.estimated_delivery_minutes,
           o.placed_at, o.delivered_at,
           o.user_id, o.store_id, o.agent_id,
           u.name   AS customer_name,
           ds.name  AS store_name,
           a.name   AS agent_name
         FROM orders o
         JOIN users       u  ON u.id  = o.user_id
         JOIN dark_stores ds ON ds.id = o.store_id
         LEFT JOIN agents a  ON a.id  = o.agent_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY o.placed_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM orders o
         WHERE ${conditions.join(' AND ')}`,
        params.slice(0, idx - 1)   // exclude limit/offset
      ),
    ]);

    res.json({
      success: true,
      data:    rows.rows,
      count:   rows.rows.length,
      pagination: {
        total:      countRow.rows[0].count,
        page:       Number(page),
        pageSize:   limit,
        totalPages: Math.ceil(countRow.rows[0].count / limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── 2. GET /admin/agents ─────────────────────────────────────────────
// All agents with live performance stats.

async function getAgentsHandler(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT
         a.id, a.name, a.phone, a.status,
         a.current_latitude, a.current_longitude,
         a.store_id,
         ds.name                                                     AS store_name,
         COUNT(o.id)::int                                            AS total_orders,
         COUNT(o.id) FILTER (WHERE o.status = 'delivered')::int      AS delivered_orders,
         COUNT(o.id) FILTER (WHERE o.status IN ('assigned','picking','out_for_delivery'))::int
                                                                     AS active_orders,
         ROUND(
           CASE WHEN COUNT(o.id) > 0
                THEN COUNT(o.id) FILTER (WHERE o.status = 'delivered')::numeric
                     / COUNT(o.id) * 100
                ELSE 0 END, 1
         )                                                           AS delivery_rate_pct,
         ROUND(
           AVG(
             EXTRACT(EPOCH FROM (o.delivered_at - o.placed_at)) / 60
           ) FILTER (WHERE o.status = 'delivered' AND o.delivered_at IS NOT NULL),
           1
         )                                                           AS avg_delivery_minutes,
         COALESCE(
           SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0
         )::numeric(12,2)                                            AS total_revenue
       FROM agents a
       JOIN dark_stores ds ON ds.id = a.store_id
       LEFT JOIN orders  o  ON o.agent_id = a.id AND o.deleted_at IS NULL
       GROUP BY a.id, ds.name
       ORDER BY active_orders DESC, total_orders DESC`
    );

    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

// ── 3. GET /admin/inventory/low ──────────────────────────────────────
// Items at or below low_stock_threshold across all stores.

async function getLowInventoryHandler(req, res, next) {
  try {
    const { store_id } = req.query;
    const conditions   = ['i.quantity <= i.low_stock_threshold'];
    const params       = [];
    let   idx          = 1;

    if (store_id) {
      conditions.push(`i.store_id = $${idx++}`);
      params.push(Number(store_id));
    }

    const result = await pool.query(
      `SELECT
         i.id, i.store_id, i.product_id,
         i.quantity, i.reserved_quantity, i.low_stock_threshold,
         (i.quantity - i.reserved_quantity) AS available_stock,
         i.updated_at,
         p.name     AS product_name,
         p.category AS product_category,
         p.base_price,
         ds.name    AS store_name
       FROM inventory i
       JOIN products    p  ON p.id  = i.product_id
       JOIN dark_stores ds ON ds.id = i.store_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY available_stock ASC`,
      params
    );

    res.json({ success: true, data: result.rows, critical_count: result.rows.length });
  } catch (err) {
    next(err);
  }
}

// ── 4. GET /admin/analytics ──────────────────────────────────────────
// Revenue, order counts, hourly throughput, agent utilisation.

async function getAnalyticsHandler(req, res, next) {
  try {
    // Support both `since`/`until` and `from`/`to` param names
    const { since, until, from, to } = req.query;
    const fromDate = from  || since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const toDate   = to    || until || new Date().toISOString();

    const [summary, byStatus, hourly, topStores] = await Promise.all([
      // Overall numbers
      pool.query(
        `SELECT
           COUNT(*)::int                                                   AS total_orders,
           COUNT(CASE WHEN status = 'delivered' THEN 1 END)::int           AS delivered_orders,
           COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int           AS cancelled,
           COUNT(CASE WHEN status IN ('pending','confirmed','assigned',
                                     'picking','out_for_delivery') THEN 1 END)::int AS in_progress,
           COALESCE(SUM(CASE WHEN status = 'delivered'
                             THEN total_amount END), 0)::numeric(12,2)     AS total_revenue,
           COALESCE(SUM(CASE WHEN status = 'delivered'
                             THEN delivery_fee END), 0)::numeric(12,2)     AS total_delivery_fees,
           COALESCE(AVG(CASE WHEN status = 'delivered'
                             THEN total_amount END), 0)::numeric(10,2)     AS avg_order_value,
           COALESCE(AVG(CASE WHEN delivered_at IS NOT NULL
                             THEN EXTRACT(EPOCH FROM (delivered_at - placed_at))/60
                             END), 0)::numeric(8,1)                        AS avg_delivery_minutes,
           AVG(estimated_delivery_minutes)::numeric(8,1)                   AS avg_eta,
           COUNT(DISTINCT agent_id)::int                                   AS active_agents
         FROM orders
         WHERE placed_at BETWEEN $1 AND $2 AND deleted_at IS NULL`,
        [fromDate, toDate]
      ),

      // Breakdown by status
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM orders
         WHERE placed_at BETWEEN $1 AND $2 AND deleted_at IS NULL
         GROUP BY status
         ORDER BY count DESC`,
        [fromDate, toDate]
      ),

      // Orders + revenue per hour (last 24 h)
      pool.query(
        `SELECT
           DATE_TRUNC('hour', placed_at)                AS hour,
           COUNT(*)::int                                AS orders,
           COALESCE(SUM(total_amount),0)::numeric(12,2) AS revenue
         FROM orders
         WHERE placed_at >= NOW() - INTERVAL '24 hours'
           AND deleted_at IS NULL
         GROUP BY hour
         ORDER BY hour DESC
         LIMIT 24`
      ),

      // Top stores by revenue
      pool.query(
        `SELECT
           ds.id, ds.name AS store_name,
           COUNT(o.id)::int                                        AS orders,
           COALESCE(SUM(o.total_amount),0)::numeric(12,2)          AS revenue
         FROM dark_stores ds
         LEFT JOIN orders o ON o.store_id = ds.id
           AND o.status = 'delivered'
           AND o.placed_at BETWEEN $1 AND $2
           AND o.deleted_at IS NULL
         GROUP BY ds.id
         ORDER BY revenue DESC
         LIMIT 10`,
        [fromDate, toDate]
      ),
    ]);

    res.json({
      success: true,
      data: {
        period:        { since: fromDate, until: toDate },
        summary:       summary.rows[0],
        byStatus:      byStatus.rows,
        ordersPerHour: hourly.rows,
        topStores:     topStores.rows,
        timestamp:     new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── 5. POST /admin/inventory/restock ───────────────────────────────────────
// Convenience wrapper so admins don’t need to know the storeId path.

async function restockHandler(req, res, next) {
  try {
    const { storeId, productId, quantity } = req.body;
    const updated = await restockProductService({
      storeId:   Number(storeId),
      productId: Number(productId),
      quantity:  Number(quantity),
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOrdersHandler,
  getAgentsHandler,
  getLowInventoryHandler,
  getAnalyticsHandler,
  restockHandler,
};
