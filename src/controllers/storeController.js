const {
  createStoreService,
  getStore,
  listStoresService,
  findNearestStore
} = require('../services/storeService');

async function createStoreHandler(req, res, next) {
  try {
    const store = await createStoreService(req.body);
    res.status(201).json({ success: true, data: store });
  } catch (err) {
    next(err);
  }
}

async function getStoreHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const store = await getStore(id);
    res.json({ success: true, data: store });
  } catch (err) {
    next(err);
  }
}

async function listStoresHandler(req, res, next) {
  try {
    const stores = await listStoresService();
    res.json({ success: true, data: stores });
  } catch (err) {
    next(err);
  }
}

async function nearestStoreHandler(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const latitude = Number(lat);
    const longitude = Number(lng);

    const store = await findNearestStore({ latitude, longitude });
    res.json({ success: true, data: store });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createStoreHandler,
  getStoreHandler,
  listStoresHandler,
  nearestStoreHandler
};
