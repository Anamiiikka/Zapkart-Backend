const { randomUUID } = require('crypto');
const logger = require('../config/logger');

/**
 * Request logging middleware
 * Attaches requestId and logs request details on completion
 */
function requestLogger(req, res, next) {
  // Attach unique request ID for tracing
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;

    // Skip logging for health checks to reduce noise
    if (req.originalUrl === '/health') {
      return;
    }

    logger.info({
      msg: 'http_request',
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id || null,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
}

module.exports = { requestLogger };
