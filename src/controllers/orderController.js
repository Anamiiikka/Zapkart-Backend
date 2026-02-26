const { placeOrder } = require('../services/orderService');
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

module.exports = {
  placeOrderHandler,
};
