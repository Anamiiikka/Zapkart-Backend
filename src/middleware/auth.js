const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AuthError, ForbiddenError } = require('../utils/errors');
const { pool } = require('../config/db');

/**
 * Middleware to require authentication.
 * Attaches req.user if Authorization bearer token is valid.
 * Throws AuthError if token is missing or invalid.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new AuthError('Missing or invalid Authorization header'));
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      agentId: payload.agentId || null,
    };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AuthError('Token has expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AuthError('Invalid token'));
    }
    return next(new AuthError('Authentication failed'));
  }
}

/**
 * Optional auth middleware - attaches user if token present, but doesn't fail if missing.
 * Useful for routes that behave differently for authenticated vs anonymous users.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = header.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = {
      sub: payload.sub,
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      agentId: payload.agentId || null,
    };
  } catch {
    req.user = null;
  }

  return next();
}

/**
 * Role-based access control middleware.
 * Must be used after requireAuth.
 * @param {...string} roles - Allowed roles (e.g., 'admin', 'customer')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthError('Not authenticated'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    return next();
  };
}

/**
 * Middleware to check if user owns the resource or is admin
 * @param {Function} getResourceOwnerId - Function that returns owner ID from req
 */
function requireOwnerOrAdmin(getResourceOwnerId) {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new AuthError('Not authenticated'));
    }

    if (req.user.role === 'admin') {
      return next();
    }

    try {
      const ownerId = await getResourceOwnerId(req);
      if (String(req.user.id) !== String(ownerId)) {
        return next(new ForbiddenError('Access denied'));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * DB-verified agent guard.
 * Must be used after requireAuth.
 * - Confirms the user's row exists and has role 'agent' (or 'delivery')
 *   AND is linked to an agents record.
 * - Attaches req.agent = { id, user_id, role } for downstream handlers.
 */
async function requireAgent(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return next(new AuthError('No user ID in token'));
    }

    const result = await pool.query(
      `SELECT u.role, a.id AS agent_id
       FROM users u
       LEFT JOIN agents a ON u.id = a.user_id
       WHERE u.id = $1`,
      [userId]
    );

    const row = result.rows[0];

    if (!row || (row.role !== 'agent' && row.role !== 'delivery') || !row.agent_id) {
      return next(new ForbiddenError('Agent access required'));
    }

    // Attach for use in controllers (supplements req.user.agentId from JWT)
    req.agent = { id: row.agent_id, user_id: userId, role: row.role };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireAuth,
  authenticate: requireAuth, // Alias for common naming convention
  optionalAuth,
  requireRole,
  requireOwnerOrAdmin,
  requireAgent,
};
