const { getProducts, getProduct } = require('../services/productService');

async function listProductsHandler(req, res, next) {
  try {
    const { search, category, page = '1', pageSize = '20' } = req.query;

    const result = await getProducts({
      search: search || undefined,
      category: category || undefined,
      page: Number(page),
      pageSize: Number(pageSize)
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getProductHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const product = await getProduct(id);
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProductsHandler,
  getProductHandler
};
