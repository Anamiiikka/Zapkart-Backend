const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createStoreHandler,
  getStoreHandler,
  listStoresHandler,
  nearestStoreHandler
} = require('../controllers/storeController');

const router = express.Router();

const createStoreSchema = z.object({
  name: z.string().min(1),
  areaName: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  isActive: z.boolean().optional(),
  maxOrdersPerSlot: z.number().int().positive().optional()
});

const idSchema = z.object({
  id: z.string().regex(/^\d+$/)
});

const nearestSchema = z.object({
  lat: z.string(),
  lng: z.string()
});

// Nearest active store
router.get('/nearest', validate(nearestSchema, 'query'), nearestStoreHandler);

// Get store by id
router.get('/:id', validate(idSchema, 'params'), getStoreHandler);

// Admin: list all stores
router.get('/', requireAuth, requireRole('admin'), listStoresHandler);

// Admin: create store
router.post('/', requireAuth, requireRole('admin'), validate(createStoreSchema), createStoreHandler);

module.exports = { storeRouter: router };
