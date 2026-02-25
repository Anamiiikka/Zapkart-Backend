const { pool } = require('../config/db');

async function listProducts({ search, category, limit, offset }) {
  const conditions = ['deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (category) {
    conditions.push(`category = $${idx}`);
    params.push(category);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  params.push(offset);

  const sql = `
    SELECT id, name, description, category, image_url, base_price, weight_grams, created_at
    FROM products
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}

async function countProducts({ search, category }) {
  const conditions = ['deleted_at IS NULL'];
  const params = [];
  let idx = 1;

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  if (category) {
    conditions.push(`category = $${idx}`);
    params.push(category);
    idx++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT COUNT(*)::int AS count
    FROM products
    ${whereClause}
  `;

  const result = await pool.query(sql, params);
  return result.rows[0].count;
}

async function getProductById(id) {
  const result = await pool.query(
    `SELECT id, name, description, category, image_url, base_price, weight_grams, created_at
     FROM products
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = {
  listProducts,
  countProducts,
  getProductById
};
