const { pool } = require('../config/db');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

/**
 * Create a new user in the database.
 * @param {Object} data - User data
 * @param {string} data.name - User's full name
 * @param {string} data.email - User's email address
 * @param {string} data.passwordHash - Bcrypt hashed password
 * @param {string} [data.phone] - User's phone number
 * @param {string} [data.role] - User role (customer, vendor, admin)
 * @param {string} [data.deliveryAddress] - Delivery address
 * @param {number} [data.latitude] - Latitude for geolocation
 * @param {number} [data.longitude] - Longitude for geolocation
 * @returns {Promise<Object>} Created user (without password_hash)
 */
async function createUser(data) {
  const {
    name,
    email,
    passwordHash,
    phone = null,
    role = 'customer',
    deliveryAddress = null,
    latitude = null,
    longitude = null
  } = data;

  const result = await pool.query(
    `INSERT INTO users
      (name, email, password_hash, phone, role, delivery_address, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, email, role, delivery_address, latitude, longitude, created_at`,
    [name, email, passwordHash, phone, role, deliveryAddress, latitude, longitude]
  );

  return result.rows[0];
}

/**
 * Find a user by email address.
 * @param {string} email - Email to search for
 * @returns {Promise<Object|null>} User object with password_hash or null if not found
 */
async function findUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, name, email, password_hash, role, delivery_address, latitude, longitude, agent_id
     FROM users
     WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Find a user by ID.
 * @param {number} id - User ID
 * @returns {Promise<Object|null>} User object (without password_hash) or null if not found
 */
async function findUserById(id) {
  const result = await pool.query(
    `SELECT id, name, email, role, delivery_address, latitude, longitude, agent_id
     FROM users
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Update user profile information.
 * @param {number} id - User ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object|null>} Updated user or null if not found
 */
async function updateUser(id, data) {
  const allowedFields = ['name', 'phone', 'delivery_address', 'latitude', 'longitude'];
  const updates = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(data)) {
    const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase to snake_case
    if (allowedFields.includes(dbField) && value !== undefined) {
      updates.push(`${dbField} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return findUserById(id);
  }

  values.push(id);
  const result = await pool.query(
    `UPDATE users
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${paramIndex}
     RETURNING id, name, email, role, delivery_address, latitude, longitude, updated_at`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Create a user with role 'agent' and a linked agents row in a single transaction.
 * Sets up the bidirectional 1-1 link: users.agent_id <-> agents.user_id.
 * @param {Object} data
 * @returns {Promise<{userId: number, agentId: number}>}
 */
async function createAgentUserWithAgent({ name, email, password, phone, storeId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 1. Create user with role 'agent'
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, phone, role)
       VALUES ($1, $2, $3, $4, 'agent')
       RETURNING id`,
      [name, email, passwordHash, phone]
    );
    const userId = userResult.rows[0].id;

    // 2. Create agent row linked to user
    const agentResult = await client.query(
      `INSERT INTO agents (user_id, store_id, name, phone, status)
       VALUES ($1, $2, $3, $4, 'available')
       RETURNING id`,
      [userId, storeId, name, phone]
    );
    const agentId = agentResult.rows[0].id;

    // 3. Back-link: set users.agent_id
    await client.query(
      `UPDATE users SET agent_id = $2, updated_at = NOW() WHERE id = $1`,
      [userId, agentId]
    );

    await client.query('COMMIT');
    return { userId, agentId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Link an existing user to an existing agent (admin helper).
 * @param {number} userId
 * @param {number} agentId
 */
async function linkUserToAgent(userId, agentId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET agent_id = $2, role = $3, updated_at = NOW() WHERE id = $1', [userId, agentId, 'agent']);
    await client.query('UPDATE agents SET user_id = $2, updated_at = NOW() WHERE id = $1', [agentId, userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser,
  createAgentUserWithAgent,
  linkUserToAgent
};
