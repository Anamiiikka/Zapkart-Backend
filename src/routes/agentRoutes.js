const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { requireAuth, requireRole, requireAgent } = require('../middleware/auth');
const {
  createAgentHandler,
  createAgentWithUserHandler,
  listAgentsHandler,
  getAgentHandler,
  getMyAgentProfileHandler,
  updateAgentStatusHandler,
  updateAgentLocationHandler,
  getAgentOrdersHandler,
  getAgentOrderHandler,
  updateAgentOrderStatusHandler,
  toggleAvailabilityHandler
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
  requireAgent,
  getMyAgentProfileHandler
);

// ── Agent Dashboard Routes (agent-only) ──
// IMPORTANT: all /orders* and /availability routes must be defined BEFORE /:id
// to prevent Express matching them as the admin /:id route.

const agentOrdersQuerySchema = z.object({
  status: z.enum(['assigned', 'picking', 'out_for_delivery', 'delivered']).optional(),
});

// Agent: list my assigned orders
router.get(
  '/orders',
  requireAuth,
  requireRole('agent'),
  requireAgent,
  validate(agentOrdersQuerySchema, 'query'),
  getAgentOrdersHandler
);

// Agent: get single order detail + navigation data
router.get(
  '/orders/:id',
  requireAuth,
  requireRole('agent'),
  requireAgent,
  validate(idParamsSchema, 'params'),
  getAgentOrderHandler
);

// Agent: advance order to next status (picking → out_for_delivery → delivered)
router.patch(
  '/orders/:id/next-status',
  requireAuth,
  requireRole('agent'),
  requireAgent,
  validate(idParamsSchema, 'params'),
  updateAgentOrderStatusHandler
);

// Agent: toggle availability (available ↔ busy)
router.post(
  '/availability',
  requireAuth,
  requireRole('agent'),
  requireAgent,
  toggleAvailabilityHandler
);

// ── Admin routes with /:id param (must come AFTER all named routes) ──

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
