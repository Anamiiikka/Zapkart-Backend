const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { env } = require('../config/env');

/**
 * Generate a unique JWT ID
 */
function generateJti() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Sign an access token.
 * For now we use the single JWT_SECRET and JWT_EXPIRES_IN from env.
 * Payload should contain at least { sub: userId, role }.
 */
function signAccessToken(payload) {
  return jwt.sign({ ...payload, jti: generateJti() }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN
  });
}

/**
 * Sign a refresh token (longer-lived).
 * For now you can reuse JWT_SECRET; later you can split secrets if desired.
 */
function signRefreshToken(payload) {
  // 7 days for refresh token, per assignment
  return jwt.sign({ ...payload, jti: generateJti() }, env.JWT_SECRET, {
    expiresIn: '7d'
  });
}

/**
 * Verify and decode a token.
 * @param {string} token - JWT token to verify
 * @returns {object} Decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError} If token is invalid or expired
 */
function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken
};
