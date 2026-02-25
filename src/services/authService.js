const bcrypt = require('bcrypt');
const { ValidationError, AuthError } = require('../utils/errors');
const { createUser, findUserByEmail, findUserById } = require('../models/userModel');
const {
  createRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeAllTokensForUser
} = require('../models/refreshTokenModel');
const { signAccessToken, signRefreshToken, verifyToken } = require('../utils/jwt');

const BCRYPT_ROUNDS = 12;

/**
 * Register a new user.
 * @param {Object} data - Registration data
 * @param {string} data.name - User's full name
 * @param {string} data.email - User's email
 * @param {string} data.password - Plain text password (will be hashed)
 * @param {string} [data.phone] - User's phone number
 * @returns {Promise<Object>} User object and tokens
 */
async function register({ name, email, password, phone }) {
  // Check for existing user
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new ValidationError('Email is already in use');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Create user
  const user = await createUser({
    name,
    email,
    passwordHash,
    phone,
    role: 'customer'
  });

  // Issue tokens
  const tokens = await issueTokensForUser(user);

  return { user, ...tokens };
}

/**
 * Authenticate a user with email and password.
 * @param {Object} data - Login credentials
 * @param {string} data.email - User's email
 * @param {string} data.password - User's password
 * @returns {Promise<Object>} User object (without password) and tokens
 */
async function login({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new AuthError('Invalid email or password');
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw new AuthError('Invalid email or password');
  }

  // Remove password_hash from returned user
  const { password_hash, ...safeUser } = user;
  const tokens = await issueTokensForUser(user);

  return { user: safeUser, ...tokens };
}

/**
 * Issue access and refresh tokens for a user.
 * @param {Object} user - User object with id and role
 * @returns {Promise<Object>} Access and refresh tokens
 */
async function issueTokensForUser(user) {
  const payload = {
    sub: user.id,
    role: user.role
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Decode to get expiration time
  const decoded = verifyToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  // Store refresh token in database
  await createRefreshToken({
    userId: user.id,
    token: refreshToken,
    expiresAt
  });

  return { accessToken, refreshToken };
}

/**
 * Refresh access token using a valid refresh token.
 * Implements token rotation - old token is revoked and new one issued.
 * @param {Object} data - Refresh data
 * @param {string} data.token - Refresh token
 * @returns {Promise<Object>} New access and refresh tokens
 */
async function refresh({ token }) {
  // Find token in database
  const stored = await findRefreshToken(token);
  if (!stored || stored.is_revoked) {
    throw new AuthError('Invalid refresh token');
  }

  // Verify signature and expiry
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    throw new AuthError('Invalid or expired refresh token');
  }

  // Token rotation: revoke the old token
  await revokeRefreshToken(stored.id);

  // Issue new tokens
  const payload = { sub: decoded.sub, role: decoded.role };
  const accessToken = signAccessToken(payload);
  const newRefreshToken = signRefreshToken(payload);

  // Store new refresh token
  const newDecoded = verifyToken(newRefreshToken);
  const expiresAt = new Date(newDecoded.exp * 1000);

  await createRefreshToken({
    userId: decoded.sub,
    token: newRefreshToken,
    expiresAt
  });

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Logout by revoking the refresh token.
 * Idempotent - doesn't throw if token doesn't exist or is already revoked.
 * @param {Object} data - Logout data
 * @param {string} data.token - Refresh token to revoke
 * @returns {Promise<void>}
 */
async function logout({ token }) {
  const stored = await findRefreshToken(token);
  if (!stored || stored.is_revoked) {
    // Idempotent logout: no error
    return;
  }
  await revokeRefreshToken(stored.id);
}

/**
 * Logout from all devices by revoking all refresh tokens for a user.
 * @param {number} userId - User ID
 * @returns {Promise<void>}
 */
async function logoutAll(userId) {
  await revokeAllTokensForUser(userId);
}

/**
 * Get current user profile by ID.
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} User profile or null
 */
async function getProfile(userId) {
  return findUserById(userId);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getProfile,
  issueTokensForUser
};
