const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getStoreInventoryHandler,
  restockProductHandler
} = require('../controllers/inventoryController');

const router = express.Router({ mergeParams: true });

const storeIdParamsSchema = z.object({
  storeId: z.string().regex(/^\d+$/)
});

const restockParamsSchema = z.object({
  storeId: z.string().regex(/^\d+$/),
  productId: z.string().regex(/^\d+$/)
});

const restockBodySchema = z.object({
  quantity: z.number().int().positive()
});

// Get inventory for a store
router.get(
  '/',
  validate(storeIdParamsSchema, 'params'),
  getStoreInventoryHandler
);

// Admin restock
router.patch(
  '/:productId',
  requireAuth,
  requireRole('admin'),
  validate(restockParamsSchema, 'params'),
  validate(restockBodySchema),
  restockProductHandler
);

module.exports = { inventoryRouter: router };
