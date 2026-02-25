const { getStoreInventory, restockProductService } = require('../services/inventoryService');

async function getStoreInventoryHandler(req, res, next) {
  try {
    const storeId = Number(req.params.storeId);
    const items = await getStoreInventory(storeId);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

async function restockProductHandler(req, res, next) {
  try {
    const storeId = Number(req.params.storeId);
    const productId = Number(req.params.productId);
    const { quantity } = req.body;

    const updated = await restockProductService({ storeId, productId, quantity });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStoreInventoryHandler,
  restockProductHandler
};
