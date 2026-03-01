const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimit');
const {
  placeOrderHandler,
  getOrderHandler,
  listOrdersHandler,
  listAllOrdersHandler,
  updateOrderStatusHandler,
  cancelOrderHandler,
  assignAgentHandler,
  autoAssignOrderHandler,
  agentNextStatusHandler,
  agentOrderDetailsHandler,
  agentMyOrdersHandler,
  getOrderTrackHandler,
} = require('../controllers/orderController');

const router = express.Router();

const placeOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.number().int().positive().optional(),
        productName: z.string().min(1).optional(),
        quantity: z.number().int().positive(),
      }).refine(
        (item) => item.productId != null || item.productName != null,
        { message: 'Each item must have either productId or productName' }
      )
    )
    .min(1, 'Cart cannot be empty'),
  deliveryAddress: z.string().min(1).optional(),
  userLocation: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  // Also accept flat lat/lng (convenience)
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  idempotencyKey: z.string().optional(),
});

const orderIdSchema = z.object({
  id: z.string().regex(/^\d+$/),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'confirmed',
    'assigned',
    'picking',
    'out_for_delivery',
    'delivered',
    'cancelled'
  ])
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

const adminListQuerySchema = z.object({
  status: z.enum([
    'pending', 'confirmed', 'assigned', 'picking',
    'out_for_delivery', 'delivered', 'cancelled',
  ]).optional(),
  storeId: z.string().regex(/^\d+$/).optional(),
  agentId: z.string().regex(/^\d+$/).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

// Admin: list all orders (must be before /:id to avoid matching "admin")
router.get(
  '/admin/all',
  requireAuth,
  requireRole('admin'),
  validate(adminListQuerySchema, 'query'),
  listAllOrdersHandler
);

// Customer: list my orders
router.get('/', requireAuth, validate(listQuerySchema, 'query'), listOrdersHandler);

// Agent: list my assigned orders (must be before /:id)
const agentOrdersQuerySchema = z.object({
  status: z.enum([
    'assigned', 'picking', 'out_for_delivery', 'delivered',
  ]).optional(),
});

router.get(
  '/agent/my-orders',
  requireAuth,
  requireRole('agent'),
  validate(agentOrdersQuerySchema, 'query'),
  agentMyOrdersHandler
);

// Get order by ID (customer sees own, admin sees any)
router.get('/:id', requireAuth, validate(orderIdSchema, 'params'), getOrderHandler);

// Place a new order (authenticated customers) — stricter rate limit
router.post('/', requireAuth, orderLimiter, validate(placeOrderSchema), placeOrderHandler);

// Admin/agent: update order status
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('admin', 'agent'),
  validate(orderIdSchema, 'params'),
  validate(updateStatusSchema),
  updateOrderStatusHandler
);

// Customer: cancel own order
router.post(
  '/:id/cancel',
  requireAuth,
  validate(orderIdSchema, 'params'),
  cancelOrderHandler
);

// ── Agent-order integration routes ──

const assignAgentSchema = z.object({
  agentId: z.number().int().positive(),
});

// Admin: assign agent to order
router.patch(
  '/:id/assign-agent',
  requireAuth,
  requireRole('admin'),
  validate(orderIdSchema, 'params'),
  validate(assignAgentSchema),
  assignAgentHandler
);

// Admin: auto-assign best available agent to order
router.post(
  '/:id/auto-assign',
  requireAuth,
  requireRole('admin'),
  validate(orderIdSchema, 'params'),
  autoAssignOrderHandler
);

// Agent: advance own order to next status
router.patch(
  '/:id/next-status',
  requireAuth,
  requireRole('agent'),
  validate(orderIdSchema, 'params'),
  agentNextStatusHandler
);

// Admin/Agent/Customer: get order with agent details
router.get(
  '/:id/agent-details',
  requireAuth,
  validate(orderIdSchema, 'params'),
  agentOrderDetailsHandler
);

// Any authenticated user: real-time tracking snapshot
router.get(
  '/:id/track',
  requireAuth,
  validate(orderIdSchema, 'params'),
  getOrderTrackHandler
);

module.exports = { orderRouter: router };
