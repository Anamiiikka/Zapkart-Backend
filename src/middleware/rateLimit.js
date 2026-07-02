const rateLimit = require('express-rate-limit');

// Limits are env-configurable so the interactive simulator (which fires bursts
// of orders and logins) can run freely, while production keeps sensible defaults.
const ORDER_MAX = parseInt(process.env.ORDER_RATE_LIMIT_MAX, 10) || 5;
const AUTH_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 15;

// ── Stricter limiter for order placement (default 5 orders / minute / IP) ──
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: ORDER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Order limit exceeded — max ${ORDER_MAX} orders per minute.`,
      statusCode: 429,
    },
  },
});

// ── Auth limiter (brute-force protection: default 15 attempts / 15 min / IP) ──
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again later.',
      statusCode: 429,
    },
  },
});

module.exports = { orderLimiter, authLimiter };
