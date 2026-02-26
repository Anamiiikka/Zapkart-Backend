const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  placeOrderHandler,
  getOrderHandler,
  listOrdersHandler,
  listAllOrdersHandler,
  updateOrderStatusHandler,
  cancelOrderHandler,
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
    'pending', 'confirmed', 'picking',
    'out_for_delivery', 'delivered', 'cancelled',
  ]).optional(),
  storeId: z.string().regex(/^\d+$/).optional(),
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

// Get order by ID (customer sees own, admin sees any)
router.get('/:id', requireAuth, validate(orderIdSchema, 'params'), getOrderHandler);

// Place a new order (authenticated customers)
router.post('/', requireAuth, validate(placeOrderSchema), placeOrderHandler);

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

module.exports = { orderRouter: router };
