const { pool } = require('../config/db');

async function getInventoryByStore(storeId) {
  const result = await pool.query(
    `SELECT
       i.id,
       i.store_id,
       i.product_id,
       i.quantity,
       i.reserved_quantity,
       i.low_stock_threshold,
       i.updated_at,
       p.name AS product_name,
       p.category,
       p.base_price
     FROM inventory i
     JOIN products p ON p.id = i.product_id
     WHERE i.store_id = $1`,
    [storeId]
  );
  return result.rows;
}

async function restockProduct({ storeId, productId, quantity }) {
  const result = await pool.query(
    `UPDATE inventory
     SET quantity = quantity + $3,
         updated_at = NOW(),
         version = version + 1
     WHERE store_id = $1 AND product_id = $2
     RETURNING id, store_id, product_id, quantity, reserved_quantity, low_stock_threshold, updated_at`,
    [storeId, productId, quantity]
  );
  return result.rows[0] || null;
}

module.exports = {
  getInventoryByStore,
  restockProduct
};
