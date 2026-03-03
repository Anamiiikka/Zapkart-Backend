const express = require('express');
const { pool } = require('../config/db');
const { cache, CACHE_TTL } = require('../utils/cache');

const router = express.Router();

/**
 * GET /api/v1/categories
 * Returns distinct product categories from the products table.
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'categories:all';
    const cached = await cache.getJSON(cacheKey);

    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json({ success: true, data: cached });
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT category
       FROM products
       WHERE category IS NOT NULL AND deleted_at IS NULL
       ORDER BY category`
    );

    const categories = rows.map((r) => r.category);

    await cache.setJSON(cacheKey, categories, CACHE_TTL.products);
    res.set('X-Cache', 'MISS');
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
});

module.exports = { categoryRouter: router };
