const { getInventoryByStore, restockProduct } = require('../models/inventoryModel');
const { NotFoundError } = require('../utils/errors');
const { cache, CACHE_TTL } = require('../utils/cache');

async function getStoreInventory(storeId) {
  const cacheKey = `inventory:store:${storeId}`;
  const cached   = await cache.getJSON(cacheKey);
  if (cached) return { data: cached, _cached: true };

  const items = await getInventoryByStore(storeId);
  await cache.setJSON(cacheKey, items, CACHE_TTL.inventory);
  return { data: items, _cached: false };
}

async function restockProductService({ storeId, productId, quantity }) {
  const updated = await restockProduct({ storeId, productId, quantity });
  if (!updated) {
    throw new NotFoundError('Inventory item not found for this store and product');
  }
  // Bust inventory cache for this store
  await cache.del(`inventory:store:${storeId}`);
  return updated;
}

module.exports = {
  getStoreInventory,
  restockProductService
};
