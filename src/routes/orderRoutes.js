const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { placeOrderHandler } = require('../controllers/orderController');

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

// Place a new order (authenticated customers)
router.post('/', requireAuth, validate(placeOrderSchema), placeOrderHandler);

module.exports = { orderRouter: router };
