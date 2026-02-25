const { listProducts, countProducts, getProductById } = require('../models/productModel');
const { NotFoundError } = require('../utils/errors');

async function getProducts({ search, category, page = 1, pageSize = 20 }) {
  const limit = pageSize;
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    listProducts({ search, category, limit, offset }),
    countProducts({ search, category })
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

async function getProduct(id) {
  const product = await getProductById(id);
  if (!product) {
    throw new NotFoundError('Product not found');
  }
  return product;
}

module.exports = {
  getProducts,
  getProduct
};
