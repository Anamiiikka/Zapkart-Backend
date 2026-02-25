const { pool } = require('../config/db');

/**
 * Store a new refresh token record.
 * @param {Object} data - Token data
 * @param {number} data.userId - User ID the token belongs to
 * @param {string} data.token - The refresh token string
 * @param {Date} data.expiresAt - Token expiration date
 * @returns {Promise<Object>} Created token record
 */
async function createRefreshToken({ userId, token, expiresAt }) {
  const result = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, token, is_revoked, created_at, expires_at`,
    [userId, token, expiresAt]
  );
  return result.rows[0];
}

/**
 * Find a refresh token by its value.
 * @param {string} token - Token string to search for
 * @returns {Promise<Object|null>} Token record or null if not found
 */
async function findRefreshToken(token) {
  const result = await pool.query(
    `SELECT id, user_id, token, is_revoked, created_at, expires_at
     FROM refresh_tokens
     WHERE token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * Mark a token as revoked.
 * @param {number} id - Token record ID
 * @returns {Promise<void>}
 */
async function revokeRefreshToken(id) {
  await pool.query(
    `UPDATE refresh_tokens
     SET is_revoked = TRUE
     WHERE id = $1`,
    [id]
  );
}

/**
 * Revoke all refresh tokens for a user (e.g., on logout from all devices).
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
async function revokeAllTokensForUser(userId) {
  await pool.query(
    `UPDATE refresh_tokens
     SET is_revoked = TRUE
     WHERE user_id = $1`,
    [userId]
  );
}

/**
 * Delete expired tokens (cleanup job).
 * @returns {Promise<number>} Number of deleted tokens
 */
async function deleteExpiredTokens() {
  const result = await pool.query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < NOW()
     RETURNING id`
  );
  return result.rowCount;
}

module.exports = {
  createRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllTokensForUser,
  deleteExpiredTokens
};
