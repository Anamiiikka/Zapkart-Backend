const logger = require('../config/logger');
const { pool } = require('../config/db');
const { NotFoundError, OutOfStockError } = require('../utils/errors');

// Scoring weights (easily tunable)
const WEIGHT_CUSTOMER_DISTANCE = 0.7;
const WEIGHT_STORE_LOAD = 0.3;
// Phase 6: add WEIGHT_AGENT_DISTANCE, reduce others proportionally

// Maximum candidates fetched via PostGIS KNN — small constant keeps scoring O(k)
const K_CANDIDATES = 10;

// Recent-orders window for load calculation
const LOAD_WINDOW_MINUTES = 10;

/**
 * Smart store matching: PostGIS KNN → inventory filter → composite scoring.
 *
 * Complexity: O(log n + k) where k = K_CANDIDATES (10), n = total stores.
 *
 * @param {number}  userId       – customer id (for future personalisation / history)
 * @param {{productId: number, quantity: number}[]} items – cart items
 * @param {{latitude: number, longitude: number}}   userLocation – customer coords
 * @returns {Promise<{id, name, area_name, distance_meters, score, loadRatio, recentOrders, max_orders_per_slot}>}
 * @throws {NotFoundError}    – no active stores nearby
 * @throws {OutOfStockError}  – stores found but none can fulfil the cart
 */
async function findBestStore(userId, items, userLocation) {
  const startTime = Date.now();
  const log = logger.child({ module: 'storeMatching', userId });

  // ── Validate inputs ───────────────────────────────────────────────
  if (!items?.length) {
    throw new Error('Cart cannot be empty');
  }
  if (
    !userLocation ||
    typeof userLocation.latitude !== 'number' ||
    typeof userLocation.longitude !== 'number'
  ) {
    throw new Error('Valid userLocation { latitude, longitude } is required');
  }

  const productIds = items.map((i) => i.productId);

  log.info(
    { itemCount: items.length, productIds, userLocation, k: K_CANDIDATES },
    'Starting store matching'
  );

  try {
    // ── STEP 1: PostGIS KNN – k nearest active stores  O(log n) ───
    const candidateResult = await pool.query(
      `SELECT
         id, name, area_name, latitude, longitude,
         max_orders_per_slot,
         ST_Distance(
           location,
           ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
         ) AS distance_meters
       FROM dark_stores
       WHERE is_active = TRUE
       ORDER BY location <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       LIMIT $3`,
      [userLocation.longitude, userLocation.latitude, K_CANDIDATES]
    );

    const candidates = candidateResult.rows;

    if (!candidates.length) {
      log.warn('No active stores found');
      throw new NotFoundError('No active stores available near you');
    }

    log.debug(
      { candidateCount: candidates.length, nearestDistance: candidates[0].distance_meters },
      'KNN candidates fetched'
    );

    // ── STEP 2: Score each candidate  O(k) ─────────────────────────
    let bestStore = null;
    let bestScore = -Infinity;
    const candidateIds = candidates.map((s) => s.id);

    // 2a) Batch-fetch inventory for ALL candidates × requested products in one query
    const inventoryResult = await pool.query(
      `SELECT store_id, product_id, quantity, reserved_quantity
       FROM inventory
       WHERE store_id = ANY($1::bigint[])
         AND product_id = ANY($2::bigint[])`,
      [candidateIds, productIds]
    );

    // Build nested map: storeId → productId → row  (coerce IDs to numbers)
    const inventoryByStore = new Map();
    for (const row of inventoryResult.rows) {
      const sid = Number(row.store_id);
      const pid = Number(row.product_id);
      if (!inventoryByStore.has(sid)) {
        inventoryByStore.set(sid, new Map());
      }
      inventoryByStore.get(sid).set(pid, row);
    }

    // 2b) Batch-fetch recent order counts for all candidates in one query
    const loadResult = await pool.query(
      `SELECT store_id, COUNT(*)::int AS active_count
       FROM orders
       WHERE store_id = ANY($1::bigint[])
         AND status IN ('pending','confirmed','picking','out_for_delivery')
         AND placed_at >= NOW() - ($2 || ' minutes')::interval
       GROUP BY store_id`,
      [candidateIds, String(LOAD_WINDOW_MINUTES)]
    );

    const loadByStore = new Map(loadResult.rows.map((r) => [Number(r.store_id), r.active_count]));

    // 2c) Iterate candidates, filter by inventory, compute composite score
    for (const store of candidates) {
      const storeId = Number(store.id);
      const storeInv = inventoryByStore.get(storeId);

      // Inventory fulfilment check
      let canFulfill = true;
      for (const item of items) {
        const inv = storeInv?.get(item.productId);
        if (!inv) {
          canFulfill = false;
          break;
        }
        const available = inv.quantity - inv.reserved_quantity;
        if (available < item.quantity) {
          canFulfill = false;
          break;
        }
      }

      if (!canFulfill) {
        log.debug({ storeId: store.id, storeName: store.name }, 'Rejected – insufficient inventory');
        continue;
      }

      // Load factor
      const recentOrders = loadByStore.get(storeId) || 0;
      const loadRatio =
        store.max_orders_per_slot > 0 ? recentOrders / store.max_orders_per_slot : 0;
      const cappedLoad = Math.min(loadRatio, 1.0);

      // Distance (already computed by PostGIS)
      const distanceKm = store.distance_meters / 1000;

      // Normalised features (higher = better)
      const fCustomerDistance = 1 / (1 + distanceKm); // 0.2 km → 0.83, 5 km → 0.17
      const fLoad = 1 - cappedLoad; //   0 load → 1.0, full → 0.0

      // Composite score
      const score =
        WEIGHT_CUSTOMER_DISTANCE * fCustomerDistance + WEIGHT_STORE_LOAD * fLoad;

      log.debug(
        {
          storeId: store.id,
          storeName: store.name,
          distanceKm: +distanceKm.toFixed(2),
          recentOrders,
          loadRatio: +loadRatio.toFixed(2),
          fCustomerDistance: +fCustomerDistance.toFixed(3),
          fLoad: +fLoad.toFixed(3),
          score: +score.toFixed(3),
        },
        'Store scored'
      );

      if (score > bestScore) {
        bestScore = score;
        bestStore = {
          ...store,
          loadRatio: cappedLoad,
          score,
          recentOrders,
          canFulfill: true,
        };
      }
    }

    // ── STEP 3: Return result or throw ──────────────────────────────
    if (!bestStore) {
      log.warn(
        { checkedCandidates: candidates.length },
        'No stores can fulfil order after scoring'
      );
      throw new OutOfStockError('Requested items are out of stock at nearby stores');
    }

    const durationMs = Date.now() - startTime;
    log.info(
      {
        storeId: bestStore.id,
        storeName: bestStore.name,
        score: +bestScore.toFixed(3),
        distanceKm: +(bestStore.distance_meters / 1000).toFixed(2),
        loadRatio: +bestStore.loadRatio.toFixed(2),
        durationMs,
      },
      'Store matching completed'
    );

    return bestStore;
  } catch (error) {
    // Re-throw known application errors
    if (error instanceof NotFoundError || error instanceof OutOfStockError) {
      throw error;
    }
    log.error({ err: error, durationMs: Date.now() - startTime }, 'Store matching failed');
    throw error;
  }
}

module.exports = {
  findBestStore,
};
