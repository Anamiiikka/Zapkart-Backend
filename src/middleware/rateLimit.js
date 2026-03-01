const rateLimit = require('express-rate-limit');

// ── Stricter limiter for order placement (5 orders / minute / IP) ───
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Order limit exceeded — max 5 orders per minute.',
      statusCode: 429,
    },
  },
});

// ── Auth limiter (brute-force protection: 15 attempts / 15 min / IP) ─
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
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
