const { pool } = require('../config/db');

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
    `SELECT id, name, email, password_hash, role, delivery_address, latitude, longitude
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
    `SELECT id, name, email, role, delivery_address, latitude, longitude
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

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUser
};
