const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  createAgentHandler,
  createAgentWithUserHandler,
  listAgentsHandler,
  getAgentHandler,
  getMyAgentProfileHandler,
  updateAgentStatusHandler,
  updateAgentLocationHandler
} = require('../controllers/agentController');

const router = express.Router();

// ── Zod schemas ──

const createAgentSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(5),
  userId: z.number().int().positive().optional()
});

const createAgentWithUserSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().min(5)
});

const listAgentsQuerySchema = z.object({
  storeId: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['available', 'busy', 'inactive']).optional(),
  page: z.string().regex(/^\d+$/).optional(),
  pageSize: z.string().regex(/^\d+$/).optional()
});

const idParamsSchema = z.object({
  id: z.string().regex(/^\d+$/)
});

const updateStatusSchema = z.object({
  status: z.enum(['available', 'busy', 'inactive'])
});

const updateLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number()
});

// ── Routes ──

// Admin: create agent (standalone, optional link to existing user)
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validate(createAgentSchema),
  createAgentHandler
);

// Admin: create agent + user account in one transaction
router.post(
  '/with-user',
  requireAuth,
  requireRole('admin'),
  validate(createAgentWithUserSchema),
  createAgentWithUserHandler
);

// Admin: list agents with filters & pagination
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  validate(listAgentsQuerySchema, 'query'),
  listAgentsHandler
);

// Agent: get own profile (must come before /:id to avoid route collision)
router.get(
  '/me',
  requireAuth,
  requireRole('agent'),
  getMyAgentProfileHandler
);

// Admin: get single agent
router.get(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate(idParamsSchema, 'params'),
  getAgentHandler
);

// Admin or Agent: update agent status
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('admin', 'agent'),
  validate(idParamsSchema, 'params'),
  validate(updateStatusSchema),
  updateAgentStatusHandler
);

// Admin or Agent: update agent location
router.patch(
  '/:id/location',
  requireAuth,
  requireRole('admin', 'agent'),
  validate(idParamsSchema, 'params'),
  validate(updateLocationSchema),
  updateAgentLocationHandler
);

module.exports = { agentRouter: router };
