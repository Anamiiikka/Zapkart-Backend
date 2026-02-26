const { NotFoundError, OutOfStockError } = require('../../src/utils/errors');

// ── Mock pool.query before requiring the service ────────────────────
const mockQuery = jest.fn();
jest.mock('../../src/config/db', () => ({
  pool: { query: mockQuery },
}));

jest.mock('../../src/config/logger', () => {
  const noop = () => {};
  const child = () => logStub;
  const logStub = { info: noop, warn: noop, debug: noop, error: noop, child };
  return logStub;
});

const { findBestStore } = require('../../src/services/storeMatchingService');

// ── Helpers ─────────────────────────────────────────────────────────
const userLocation = { latitude: 28.6139, longitude: 77.209 };

function makeCandidateRows(stores) {
  return { rows: stores };
}

function makeInventoryRows(rows) {
  return { rows };
}

function makeLoadRows(rows) {
  return { rows };
}

// ── Tests ───────────────────────────────────────────────────────────
describe('storeMatchingService – findBestStore', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ─── input validation ───────────────────────────────────────────
  it('throws when items array is empty', async () => {
    await expect(findBestStore(1, [], userLocation)).rejects.toThrow('Cart cannot be empty');
  });

  it('throws when items is undefined', async () => {
    await expect(findBestStore(1, undefined, userLocation)).rejects.toThrow('Cart cannot be empty');
  });

  it('throws when userLocation is missing latitude', async () => {
    await expect(
      findBestStore(1, [{ productId: 1, quantity: 1 }], { longitude: 77 })
    ).rejects.toThrow('Valid userLocation');
  });

  // ─── no active stores ───────────────────────────────────────────
  it('throws NotFoundError when no active stores exist', async () => {
    mockQuery.mockResolvedValueOnce(makeCandidateRows([])); // KNN returns nothing

    await expect(
      findBestStore(1, [{ productId: 1, quantity: 1 }], userLocation)
    ).rejects.toThrow(NotFoundError);
  });

  // ─── no store can fulfil ────────────────────────────────────────
  it('throws OutOfStockError when no candidate has sufficient inventory', async () => {
    mockQuery
      // KNN candidates
      .mockResolvedValueOnce(
        makeCandidateRows([
          { id: 10, name: 'Store A', area_name: 'Area1', latitude: 28.6, longitude: 77.2, max_orders_per_slot: 100, distance_meters: 500 },
        ])
      )
      // Inventory – product exists but quantity is 0
      .mockResolvedValueOnce(
        makeInventoryRows([
          { store_id: 10, product_id: 1, quantity: 2, reserved_quantity: 2 },
        ])
      )
      // Load
      .mockResolvedValueOnce(makeLoadRows([]));

    await expect(
      findBestStore(1, [{ productId: 1, quantity: 1 }], userLocation)
    ).rejects.toThrow(OutOfStockError);
  });

  // ─── single store happy path ────────────────────────────────────
  it('returns the only fulfilling store with correct score shape', async () => {
    mockQuery
      .mockResolvedValueOnce(
        makeCandidateRows([
          { id: 10, name: 'Store A', area_name: 'Delhi', latitude: 28.6, longitude: 77.2, max_orders_per_slot: 100, distance_meters: 1000 },
        ])
      )
      .mockResolvedValueOnce(
        makeInventoryRows([
          { store_id: 10, product_id: 5, quantity: 20, reserved_quantity: 0 },
        ])
      )
      .mockResolvedValueOnce(makeLoadRows([]));

    const result = await findBestStore(1, [{ productId: 5, quantity: 2 }], userLocation);

    expect(result).toMatchObject({
      id: 10,
      name: 'Store A',
      canFulfill: true,
    });
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThan(0);
    expect(result.loadRatio).toBe(0);
    expect(result.recentOrders).toBe(0);
  });

  // ─── picks closer store when both fulfil ────────────────────────
  it('prefers the closer store when load is equal', async () => {
    mockQuery
      .mockResolvedValueOnce(
        makeCandidateRows([
          { id: 1, name: 'Close', area_name: 'A', latitude: 28.6, longitude: 77.2, max_orders_per_slot: 100, distance_meters: 200 },
          { id: 2, name: 'Far',   area_name: 'B', latitude: 28.7, longitude: 77.3, max_orders_per_slot: 100, distance_meters: 5000 },
        ])
      )
      .mockResolvedValueOnce(
        makeInventoryRows([
          { store_id: 1, product_id: 1, quantity: 10, reserved_quantity: 0 },
          { store_id: 2, product_id: 1, quantity: 10, reserved_quantity: 0 },
        ])
      )
      .mockResolvedValueOnce(makeLoadRows([]));

    const result = await findBestStore(1, [{ productId: 1, quantity: 1 }], userLocation);

    expect(result.id).toBe(1);
  });

  // ─── load factor shifts preference ─────────────────────────────
  it('picks a farther store if the closer one is overloaded', async () => {
    // Store A: 200m away, load 100/100          → fDist=0.833  fLoad=0.0 → 0.7×0.833 + 0.3×0.0 = 0.583
    // Store B: 800m away, load 0/100             → fDist=0.556  fLoad=1.0 → 0.7×0.556 + 0.3×1.0 = 0.689
    mockQuery
      .mockResolvedValueOnce(
        makeCandidateRows([
          { id: 1, name: 'Close-Busy', area_name: 'A', latitude: 28.6, longitude: 77.2, max_orders_per_slot: 100, distance_meters: 200 },
          { id: 2, name: 'Far-Idle',   area_name: 'B', latitude: 28.7, longitude: 77.3, max_orders_per_slot: 100, distance_meters: 800 },
        ])
      )
      .mockResolvedValueOnce(
        makeInventoryRows([
          { store_id: 1, product_id: 1, quantity: 10, reserved_quantity: 0 },
          { store_id: 2, product_id: 1, quantity: 10, reserved_quantity: 0 },
        ])
      )
      .mockResolvedValueOnce(
        makeLoadRows([
          { store_id: 1, active_count: 100 }, // fully loaded
        ])
      );

    const result = await findBestStore(1, [{ productId: 1, quantity: 1 }], userLocation);

    expect(result.id).toBe(2);
    expect(result.name).toBe('Far-Idle');
  });

  // ─── multi-item cart ────────────────────────────────────────────
  it('rejects stores that only have some products in the cart', async () => {
    mockQuery
      .mockResolvedValueOnce(
        makeCandidateRows([
          { id: 1, name: 'Partial', area_name: 'A', latitude: 28.6, longitude: 77.2, max_orders_per_slot: 100, distance_meters: 100 },
          { id: 2, name: 'Full',    area_name: 'B', latitude: 28.7, longitude: 77.3, max_orders_per_slot: 100, distance_meters: 300 },
        ])
      )
      .mockResolvedValueOnce(
        makeInventoryRows([
          // Store 1 only has product 1
          { store_id: 1, product_id: 1, quantity: 50, reserved_quantity: 0 },
          // Store 2 has both
          { store_id: 2, product_id: 1, quantity: 50, reserved_quantity: 0 },
          { store_id: 2, product_id: 2, quantity: 50, reserved_quantity: 0 },
        ])
      )
      .mockResolvedValueOnce(makeLoadRows([]));

    const result = await findBestStore(
      1,
      [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
      ],
      userLocation
    );

    expect(result.id).toBe(2);
    expect(result.name).toBe('Full');
  });

  // ─── reserved_quantity respected ────────────────────────────────
  it('accounts for reserved_quantity when checking availability', async () => {
    mockQuery
      .mockResolvedValueOnce(
        makeCandidateRows([
          { id: 1, name: 'Almost-Empty', area_name: 'A', latitude: 28.6, longitude: 77.2, max_orders_per_slot: 100, distance_meters: 100 },
          { id: 2, name: 'Has-Stock',    area_name: 'B', latitude: 28.7, longitude: 77.3, max_orders_per_slot: 100, distance_meters: 300 },
        ])
      )
      .mockResolvedValueOnce(
        makeInventoryRows([
          // Store 1: quantity 10, reserved 8 → available 2 (need 5)
          { store_id: 1, product_id: 1, quantity: 10, reserved_quantity: 8 },
          // Store 2: quantity 10, reserved 0 → available 10
          { store_id: 2, product_id: 1, quantity: 10, reserved_quantity: 0 },
        ])
      )
      .mockResolvedValueOnce(makeLoadRows([]));

    const result = await findBestStore(1, [{ productId: 1, quantity: 5 }], userLocation);

    expect(result.id).toBe(2);
  });

  // ─── query parameter correctness ───────────────────────────────
  it('passes longitude first to ST_MakePoint', async () => {
    mockQuery
      .mockResolvedValueOnce(makeCandidateRows([]))

    await expect(
      findBestStore(1, [{ productId: 1, quantity: 1 }], { latitude: 28.5, longitude: 77.1 })
    ).rejects.toThrow(NotFoundError);

    // First call = KNN query
    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe(77.1);  // longitude first
    expect(params[1]).toBe(28.5);  // latitude second
  });
});
