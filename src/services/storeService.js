const { createStore, getStoreById, listStores, findNearestActiveStore } = require('../models/storeModel');
const { NotFoundError } = require('../utils/errors');
const { cache, CACHE_TTL } = require('../utils/cache');

async function createStoreService(data) {
  await cache.delByPrefix('stores:');   // bust cached lists
  return createStore(data);
}

async function getStore(id) {
  const cacheKey = `stores:${id}`;
  const cached   = await cache.getJSON(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const store = await getStoreById(id);
  if (!store) throw new NotFoundError('Store not found');

  await cache.setJSON(cacheKey, store, CACHE_TTL.stores);
  return { ...store, _cached: false };
}

async function listStoresService() {
  const cacheKey = 'stores:list';
  const cached   = await cache.getJSON(cacheKey);
  if (cached) return { data: cached, _cached: true };

  const stores = await listStores();
  await cache.setJSON(cacheKey, stores, CACHE_TTL.stores);
  return { data: stores, _cached: false };
}

async function findNearestStore({ latitude, longitude }) {
  // Round coords to ~100 m precision for a meaningful cache hit rate
  const lat = Number(latitude).toFixed(3);
  const lng = Number(longitude).toFixed(3);
  const cacheKey = `stores:nearest:${lat},${lng}`;
  const cached   = await cache.getJSON(cacheKey);
  if (cached) return { ...cached, _cached: true };

  const stores = await findNearestActiveStore({ latitude, longitude, limit: 1 });
  if (stores.length === 0) {
    throw new NotFoundError('No active stores available');
  }

  await cache.setJSON(cacheKey, stores[0], CACHE_TTL.stores);
  return { ...stores[0], _cached: false };
}

module.exports = {
  createStoreService,
  getStore,
  listStoresService,
  findNearestStore
};
