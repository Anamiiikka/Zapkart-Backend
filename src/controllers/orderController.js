const {
  placeOrder,
  getOrder,
  listOrdersForUser,
  listAllOrdersAdmin,
  changeOrderStatus,
  assignAgentToOrderService,
  autoAssignOrder,
  agentNextStatusService,
  getAgentOrderDetails,
  listAgentOrders,
  getOrderTrack,
} = require('../services/orderService');
const { findUserById } = require('../models/userModel');
const { pool } = require('../config/db');
const { NotFoundError, ValidationError } = require('../utils/errors');

async function placeOrderHandler(req, res, next) {
  try {
    // req.user from JWT only has { id, email, role } — fetch full profile
    const userProfile = await findUserById(req.user.id);
    if (!userProfile) {
      throw new NotFoundError('User profile not found');
    }

    const { items, deliveryAddress, userLocation, latitude, longitude, idempotencyKey } = req.body;

    // Resolve productName → productId for items that only have a name
    const namesToResolve = items
      .filter((i) => !i.productId && i.productName)
      .map((i) => i.productName);

    let nameToIdMap = new Map();
    if (namesToResolve.length > 0) {
      const result = await pool.query(
        `SELECT id, name FROM products
         WHERE LOWER(name) = ANY($1::text[]) AND deleted_at IS NULL`,
        [namesToResolve.map((n) => n.toLowerCase())]
      );
      nameToIdMap = new Map(result.rows.map((r) => [r.name.toLowerCase(), Number(r.id)]));
    }

    const resolvedItems = items.map((item) => {
      if (item.productId) {
        return { productId: Number(item.productId), quantity: item.quantity };
      }
      const id = nameToIdMap.get(item.productName.toLowerCase());
      if (!id) {
        throw new NotFoundError(`Product "${item.productName}" not found`);
      }
      return { productId: id, quantity: item.quantity };
    });

    // Support both nested { userLocation: { lat, lng } } and flat { latitude, longitude }
    const resolvedLocation =
      userLocation ||
      (latitude != null && longitude != null ? { latitude, longitude } : undefined);

    const order = await placeOrder({
      user: userProfile,
      items: resolvedItems,
      deliveryAddress,
      userLocation: resolvedLocation,
      idempotencyKey,
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

async function updateOrderStatusHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const { status } = req.body;

    const updated = await changeOrderStatus({
      orderId,
      newStatus: status,
      actor: req.user
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function cancelOrderHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);

    const updated = await changeOrderStatus({
      orderId,
      newStatus: 'cancelled',
      actor: req.user
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
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
};

async function getOrderTrackHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const result  = await getOrderTrack(orderId, req.user);
    res.set('X-Cache', result._cached ? 'HIT' : 'MISS');
    delete result._cached;
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Agent-order handlers ────────────────────────────────────────────

async function autoAssignOrderHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const result = await autoAssignOrder(orderId, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function assignAgentHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const { agentId } = req.body;
    const result = await assignAgentToOrderService(orderId, agentId, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function agentNextStatusHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const result = await agentNextStatusService(orderId, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function agentOrderDetailsHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const result = await getAgentOrderDetails(orderId, req.user);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function agentMyOrdersHandler(req, res, next) {
  try {
    const status = req.query.status || undefined;
    const orders = await listAgentOrders(req.user.agentId, status);
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
}

async function getOrderHandler(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const order = await getOrder(orderId, req.user);
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

async function listOrdersHandler(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;

    const result = await listOrdersForUser(req.user.id, page, pageSize);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function listAllOrdersHandler(req, res, next) {
  try {
    const { status, storeId, agentId, page = '1', pageSize = '20' } = req.query;

    const result = await listAllOrdersAdmin({
      status: status || undefined,
      storeId: storeId ? Number(storeId) : undefined,
      agentId: agentId ? Number(agentId) : undefined,
      page: Number(page),
      pageSize: Number(pageSize),
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
