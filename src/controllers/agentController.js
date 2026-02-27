const {
  createAgentService,
  createAgentWithUserService,
  listAgentsService,
  getAgentService,
  getMyAgentProfileService,
  updateAgentStatusService,
  updateAgentLocationService
} = require('../services/agentService');

// ── Admin: create agent (standalone, optional userId link) ──

async function createAgentHandler(req, res, next) {
  try {
    const { storeId, name, phone, userId } = req.body;
    const agent = await createAgentService({ storeId, name, phone, userId });
    res.status(201).json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

// ── Admin: create agent + user in one shot ──

async function createAgentWithUserHandler(req, res, next) {
  try {
    const { storeId, name, email, password, phone } = req.body;
    const result = await createAgentWithUserService({ storeId, name, email, password, phone });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Admin: list agents (paginated, filterable) ──

async function listAgentsHandler(req, res, next) {
  try {
    const { storeId, status, page = '1', pageSize = '20' } = req.query;
    const result = await listAgentsService({
      storeId: storeId ? Number(storeId) : undefined,
      status: status || undefined,
      page: Number(page),
      pageSize: Number(pageSize)
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Admin: get single agent by id ──

async function getAgentHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const agent = await getAgentService(id);
    res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

// ── Agent: get own profile ──

async function getMyAgentProfileHandler(req, res, next) {
  try {
    const agent = await getMyAgentProfileService(req.user.id);
    res.json({ success: true, data: agent });
  } catch (err) {
    next(err);
  }
}

// ── Admin/Agent: update status ──

async function updateAgentStatusHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const updated = await updateAgentStatusService({ id, status, actor: req.user });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ── Admin/Agent: update location ──

async function updateAgentLocationHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { latitude, longitude } = req.body;
    const updated = await updateAgentLocationService({ id, latitude, longitude, actor: req.user });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createAgentHandler,
  createAgentWithUserHandler,
  listAgentsHandler,
  getAgentHandler,
  getMyAgentProfileHandler,
  updateAgentStatusHandler,
  updateAgentLocationHandler
};
