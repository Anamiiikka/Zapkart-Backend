const { pool } = require('../config/db');

/**
 * Create a new agent row.
 * @param {Object} data
 * @returns {Promise<Object>} Created agent
 */
async function createAgent({ userId = null, storeId, name, phone, status = 'available', latitude = null, longitude = null }) {
  const result = await pool.query(
    `INSERT INTO agents (user_id, store_id, name, phone, status, current_latitude, current_longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, store_id, name, phone, status,
               current_latitude, current_longitude, created_at, updated_at`,
    [userId, storeId, name, phone, status, latitude, longitude]
  );
  return result.rows[0];
}

/**
 * Find an agent by primary key.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getAgentById(id) {
  const result = await pool.query(
    `SELECT id, user_id, store_id, name, phone, status,
            current_latitude, current_longitude,
            created_at, updated_at
     FROM agents
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Find an agent by its linked user_id.
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
async function getAgentByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id, store_id, name, phone, status,
            current_latitude, current_longitude,
            created_at, updated_at
     FROM agents
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * List agents with optional filters and pagination.
 * @param {Object} filters
 * @returns {Promise<Object[]>}
 */
async function listAgents({ storeId, status, limit, offset }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (storeId) {
    conditions.push(`store_id = $${idx++}`);
    params.push(storeId);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT id, user_id, store_id, name, phone, status,
           current_latitude, current_longitude, created_at, updated_at
    FROM agents
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  params.push(limit, offset);

  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Count agents matching filters (for pagination metadata).
 * @param {Object} filters
 * @returns {Promise<number>}
 */
async function countAgents({ storeId, status }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (storeId) {
    conditions.push(`store_id = $${idx++}`);
    params.push(storeId);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    params.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM agents ${whereClause}`,
    params
  );
  return result.rows[0].count;
}

/**
 * Update agent status.
 * @param {number} id
 * @param {string} status - 'available' | 'busy' | 'inactive'
 * @returns {Promise<Object|null>}
 */
async function updateAgentStatus(id, status) {
  const result = await pool.query(
    `UPDATE agents
     SET status = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, user_id, store_id, name, phone, status,
               current_latitude, current_longitude, created_at, updated_at`,
    [id, status]
  );
  return result.rows[0] || null;
}

/**
 * Update agent's current location.
 * @param {number} id
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object|null>}
 */
async function updateAgentLocation(id, latitude, longitude) {
  const result = await pool.query(
    `UPDATE agents
     SET current_latitude = $2, current_longitude = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING id, user_id, store_id, name, phone, status,
               current_latitude, current_longitude, created_at, updated_at`,
    [id, latitude, longitude]
  );
  return result.rows[0] || null;
}

/**
 * Get available agents for a specific store (for matching / assignment).
 * Ordered by most-recently-updated so freshest availability comes first.
 * @param {number} storeId
 * @param {number} [limit=10]
 * @returns {Promise<Object[]>}
 */
async function getAvailableAgentsForStore(storeId, limit = 10) {
  const result = await pool.query(
    `SELECT id, user_id, store_id, name, phone, status,
            current_latitude, current_longitude
     FROM agents
     WHERE store_id = $1 AND status = 'available'
     ORDER BY updated_at DESC
     LIMIT $2`,
    [storeId, limit]
  );
  return result.rows;
}

module.exports = {
  createAgent,
  getAgentById,
  getAgentByUserId,
  listAgents,
  countAgents,
  updateAgentStatus,
  updateAgentLocation,
  getAvailableAgentsForStore
};
