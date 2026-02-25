const { createStore, getStoreById, listStores, findNearestActiveStore } = require('../models/storeModel');
const { NotFoundError } = require('../utils/errors');

async function createStoreService(data) {
  return createStore(data);
}

async function getStore(id) {
  const store = await getStoreById(id);
  if (!store) throw new NotFoundError('Store not found');
  return store;
}

async function listStoresService() {
  return listStores();
}

async function findNearestStore({ latitude, longitude }) {
  const stores = await findNearestActiveStore({ latitude, longitude, limit: 1 });
  if (stores.length === 0) {
    throw new NotFoundError('No active stores available');
  }
  return stores[0];
}

module.exports = {
  createStoreService,
  getStore,
  listStoresService,
  findNearestStore
};
