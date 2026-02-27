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

const app = express();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
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

// Routes
app.use('/', healthRoutes);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/stores', storeRouter);
app.use('/api/v1/stores/:storeId/inventory', inventoryRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/agents', agentRouter);

// 404 handler - pass to error handler for unified response
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// Error handler
app.use(errorHandler);

module.exports = app;
