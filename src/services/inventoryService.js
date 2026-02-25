const { getInventoryByStore, restockProduct } = require('../models/inventoryModel');
const { NotFoundError } = require('../utils/errors');

async function getStoreInventory(storeId) {
  return getInventoryByStore(storeId);
}

async function restockProductService({ storeId, productId, quantity }) {
  const updated = await restockProduct({ storeId, productId, quantity });
  if (!updated) {
    throw new NotFoundError('Inventory item not found for this store and product');
  }
  return updated;
}

module.exports = {
  getStoreInventory,
  restockProductService
};
