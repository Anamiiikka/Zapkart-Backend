const express = require('express');
const { z }   = require('zod');
const { validate }    = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getOrdersHandler,
  getAgentsHandler,
  getLowInventoryHandler,
  getAnalyticsHandler,
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(requireAuth, requireRole('admin'));

// ── Zod query schemas ──

const ordersQuerySchema = z.object({
  status: z.enum([
    'pending', 'confirmed', 'assigned', 'picking',
    'out_for_delivery', 'delivered', 'cancelled',
  ]).optional(),
  store_id: z.string().regex(/^\d+$/).optional(),
  page:     z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional(),
});

const storeQuerySchema = z.object({
  store_id: z.string().regex(/^\d+$/).optional(),
});

const analyticsQuerySchema = z.object({
  since: z.string().datetime({ offset: true }).optional(),
});

// ── Routes ──

// GET /api/v1/admin/orders
router.get('/orders',         validate(ordersQuerySchema,    'query'), getOrdersHandler);

// GET /api/v1/admin/agents
router.get('/agents',         getAgentsHandler);

// GET /api/v1/admin/inventory/low
router.get('/inventory/low',  validate(storeQuerySchema,     'query'), getLowInventoryHandler);

// GET /api/v1/admin/analytics
router.get('/analytics',      validate(analyticsQuerySchema, 'query'), getAnalyticsHandler);

module.exports = { adminRouter: router };
