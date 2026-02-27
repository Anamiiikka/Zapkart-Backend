const {
  createAgent,
  getAgentById,
  getAgentByUserId,
  listAgents,
  countAgents,
  updateAgentStatus,
  updateAgentLocation,
  getAvailableAgentsForStore
} = require('../models/agentModel');
const { createAgentUserWithAgent, findUserById, linkUserToAgent } = require('../models/userModel');
const { NotFoundError, ValidationError, AuthError, ConflictError } = require('../utils/errors');

const ALLOWED_STATUSES = ['available', 'busy', 'inactive'];

// ── Admin: create a standalone agent (optionally linked to an existing user) ──

async function createAgentService({ storeId, name, phone, userId }) {
  if (!name || !phone) {
    throw new ValidationError('Name and phone are required');
  }

  // If userId supplied, validate it exists and is not already linked
  if (userId) {
    const user = await findUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    if (user.agent_id) {
      throw new ConflictError('User is already linked to an agent');
    }
  }

  const agent = await createAgent({
    userId: userId || null,
    storeId,
    name,
    phone,
    status: 'available'
  });

  // If userId was supplied, set up the bidirectional link
  if (userId) {
    await linkUserToAgent(userId, agent.id);
  }

  return agent;
}

// ── Admin: create user + agent in one transaction ──

async function createAgentWithUserService({ storeId, name, email, password, phone }) {
  if (!email || !password) {
    throw new ValidationError('Email and password are required for agent user');
  }
  if (!name || !phone) {
    throw new ValidationError('Name and phone are required');
  }

  const { userId, agentId } = await createAgentUserWithAgent({
    name,
    email,
    password,
    phone,
    storeId
  });

  const agent = await getAgentById(agentId);
  // Return a safe user view (no password_hash)
  const user = await findUserById(userId);

  return { user, agent };
}

// ── List with pagination ──

async function listAgentsService({ storeId, status, page = 1, pageSize = 20 }) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    listAgents({ storeId, status, limit, offset }),
    countAgents({ storeId, status })
  ]);

  return {
    items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

// ── Get single agent ──

async function getAgentService(id) {
  const agent = await getAgentById(id);
  if (!agent) {
    throw new NotFoundError('Agent not found');
  }
  return agent;
}

// ── Get agent profile for the logged-in agent user ──

async function getMyAgentProfileService(userId) {
  const agent = await getAgentByUserId(userId);
  if (!agent) {
    throw new NotFoundError('No agent profile linked to this user');
  }
  return agent;
}

// ── Update status (admin any, agent self-only) ──

async function updateAgentStatusService({ id, status, actor }) {
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${ALLOWED_STATUSES.join(', ')}`);
  }

  // Agent can only change their own status
  if (actor.role === 'agent') {
    if (!actor.agentId || Number(actor.agentId) !== Number(id)) {
      throw new AuthError('Agents can only modify their own status');
    }
  }

  const updated = await updateAgentStatus(id, status);
  if (!updated) {
    throw new NotFoundError('Agent not found');
  }
  return updated;
}

// ── Update location (admin any, agent self-only) ──

async function updateAgentLocationService({ id, latitude, longitude, actor }) {
  // Agent can only update their own location
  if (actor.role === 'agent') {
    if (!actor.agentId || Number(actor.agentId) !== Number(id)) {
      throw new AuthError('Agents can only update their own location');
    }
  }

  const updated = await updateAgentLocation(id, latitude, longitude);
  if (!updated) {
    throw new NotFoundError('Agent not found');
  }
  return updated;
}

// ── Extension point for store matching ──

async function getAvailableAgentsForStoreService(storeId, limit = 10) {
  return getAvailableAgentsForStore(storeId, limit);
}

module.exports = {
  createAgentService,
  createAgentWithUserService,
  listAgentsService,
  getAgentService,
  getMyAgentProfileService,
  updateAgentStatusService,
  updateAgentLocationService,
  getAvailableAgentsForStoreService
};
