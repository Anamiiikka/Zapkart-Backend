const { listProducts, countProducts, getProductById } = require('../models/productModel');
const { NotFoundError } = require('../utils/errors');
const { cache, CACHE_TTL } = require('../utils/cache');

async function getProducts({ search, category, page = 1, pageSize = 20 }) {
  // Build cache key from query params
  const cacheKey = `products:list:${search||''}:${category||''}:${page}:${pageSize}`;
  const cached   = await cache.getJSON(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const limit  = pageSize;
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    listProducts({ search, category, limit, offset }),
    countProducts({ search, category })
  ]);

  const result = {
    items,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };

  await cache.setJSON(cacheKey, result, CACHE_TTL.products);
  return { ...result, _cached: false };
}

async function getProduct(id) {
  const cacheKey = `products:${id}`;
  const cached   = await cache.getJSON(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const product = await getProductById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }

  await cache.setJSON(cacheKey, product, CACHE_TTL.products);
  return { ...product, _cached: false };
}

module.exports = {
  getProducts,
  getProduct
};
