const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const { NotFoundError } = require('./utils/errors');
const healthRoutes = require('./routes/healthRoutes');
const { authRouter } = require('./routes/authRoutes');
const { productRouter } = require('./routes/productRoutes');
const { storeRouter } = require('./routes/storeRoutes');
const { inventoryRouter } = require('./routes/inventoryRoutes');
const { orderRouter } = require('./routes/orderRoutes');
const { agentRouter } = require('./routes/agentRoutes');
const { adminRouter } = require('./routes/adminRoutes');

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting (configurable via env for load testing)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    error: { 
      code: 'RATE_LIMIT_EXCEEDED', 
      message: 'Too many requests, please try again later.',
      statusCode: 429,
    } 
  },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Request logging
app.use(requestLogger);

// Sanitize URL: strip trailing spaces (sent as %20) and redundant slashes
// so clients that accidentally include whitespace still resolve correctly.
app.use((req, _res, next) => {
  const trimmed = req.url.replace(/%20+$/, '').replace(/\s+$/, '').replace(/\/+$/, '') || '/';
  if (trimmed !== req.url) {
    req.url = trimmed;
  }
  next();
});

// Routes
app.use('/', healthRoutes);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/stores', storeRouter);
app.use('/api/v1/stores/:storeId/inventory', inventoryRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/agents', agentRouter);
app.use('/api/v1/admin',  adminRouter);

// 404 handler - pass to error handler for unified response
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// Error handler
app.use(errorHandler);

module.exports = app;
