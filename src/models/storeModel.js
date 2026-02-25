const { pool } = require('../config/db');

async function createStore({ name, areaName, latitude, longitude, isActive, maxOrdersPerSlot }) {
  const result = await pool.query(
    `INSERT INTO dark_stores
      (name, area_name, latitude, longitude, is_active, max_orders_per_slot)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, area_name, latitude, longitude, is_active, max_orders_per_slot, created_at`,
    [name, areaName, latitude, longitude, isActive ?? true, maxOrdersPerSlot ?? 100]
  );
  return result.rows[0];
}

async function getStoreById(id) {
  const result = await pool.query(
    `SELECT id, name, area_name, latitude, longitude, is_active, max_orders_per_slot, created_at
     FROM dark_stores
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function listStores() {
  const result = await pool.query(
    `SELECT id, name, area_name, latitude, longitude, is_active, max_orders_per_slot, created_at
     FROM dark_stores
     ORDER BY created_at DESC`
  );
  return result.rows;
}

/**
 * Find nearest active store to given lat/lng using PostGIS.
 */
async function findNearestActiveStore({ latitude, longitude, limit = 5 }) {
  const result = await pool.query(
    `SELECT
       id, name, area_name, latitude, longitude, is_active, max_orders_per_slot, created_at,
       ST_Distance(
         location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) AS distance_meters
     FROM dark_stores
     WHERE is_active = TRUE
     ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
     LIMIT $3`,
    [longitude, latitude, limit] // note: lon, lat order in ST_MakePoint
  );

  return result.rows;
}

module.exports = {
  createStore,
  getStoreById,
  listStores,
  findNearestActiveStore
};
