const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { env } = require('./config/env');
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
const { categoryRouter } = require('./routes/categoryRoutes');

const app = express();

// Trust the platform proxy (Render) so rate-limit / secure cookies see real IPs.
app.set('trust proxy', 1);

// Security middleware.
// CSP is disabled because this same service also serves the built React
// simulator (inline styles/scripts from Vite) and loads remote product images.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS — harmless for the same-origin simulator, but lets the API be called
// from other origins too (configurable via CORS_ORIGIN).
const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

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

// API + health routes (registered before the SPA so they always win).
// healthRoutes exposes /health and /ready; the root path is owned by the SPA.
app.use('/', healthRoutes);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/stores', storeRouter);
app.use('/api/v1/stores/:storeId/inventory', inventoryRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/agents', agentRouter);
app.use('/api/v1/admin',  adminRouter);
app.use('/api/v1/categories', categoryRouter);

// ── Serve the interactive simulator (single-service deploy) ──
// The simulator is a plain static page in /public — no build step — served from
// the same origin, so hitting the service URL lands the user directly on it.
const publicDir = path.join(__dirname, '..', 'public');
const hasClient = fs.existsSync(path.join(publicDir, 'index.html'));

if (hasClient) {
  // No long-lived cache: the simulator's files aren't content-hashed, so caching
  // would serve stale JS/CSS after a redeploy. etag lets the browser revalidate.
  app.use(express.static(publicDir, { etag: true, maxAge: 0, index: 'index.html' }));

  // Fallback: any non-API GET returns index.html (single-page simulator).
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// 404 handler - pass to error handler for unified response
app.use((req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
});

// Error handler
app.use(errorHandler);

module.exports = app;
