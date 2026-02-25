const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { AuthError, ForbiddenError } = require('../utils/errors');

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

module.exports = {
  requireAuth,
  authenticate: requireAuth, // Alias for common naming convention
  optionalAuth,
  requireRole,
  requireOwnerOrAdmin,
};
