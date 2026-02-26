const {
  ValidationError,
  NotFoundError,
  OutOfStockError,
} = require('../../src/utils/errors');

// ── Mock pool (client-based tx) ─────────────────────────────────────
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPoolConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.mock('../../src/config/db', () => ({
  pool: { connect: mockPoolConnect },
}));

jest.mock('../../src/config/logger', () => {
  const noop = () => {};
  const child = () => logStub;
  const logStub = { info: noop, warn: noop, debug: noop, error: noop, child };
  return logStub;
});

// ── Mock storeMatchingService ───────────────────────────────────────
const mockFindBestStore = jest.fn();
jest.mock('../../src/services/storeMatchingService', () => ({
  findBestStore: (...args) => mockFindBestStore(...args),
}));

const {
  placeOrder,
  calculateSurgeMultiplier,
  calculateEtaMinutes,
} = require('../../src/services/orderService');

// ── Helpers ─────────────────────────────────────────────────────────
const baseUser = {
  id: 1,
  role: 'customer',
  delivery_address: '123 Main St',
  latitude: 28.6139,
  longitude: 77.209,
};

const baseItems = [
  { productId: 10, quantity: 2 },
  { productId: 20, quantity: 1 },
];

const matchedStore = {
  id: 5,
  name: 'Store Alpha',
  area_name: 'Central',
  latitude: 28.61,
  longitude: 77.21,
  max_orders_per_slot: 100,
  distance_meters: 1200,
  score: 0.85,
  loadRatio: 0.1,
  recentOrders: 10,
  canFulfill: true,
};

/** Shorthand to resolve a query result */
const qr = (rows, rowCount) => ({ rows, rowCount: rowCount ?? rows.length });

function setupHappyPath() {
  mockFindBestStore.mockResolvedValue(matchedStore);

  // The client.query calls in order:
  // 0: BEGIN
  // 1: product prices
  // 2: recent orders (surge)
  // 3: reserve item 1
  // 4: reserve item 2
  // 5: insert order
  // 6: insert order_items
  // 7: insert status_history
  // 8: COMMIT
  mockClientQuery
    .mockResolvedValueOnce(qr([])) // BEGIN
    .mockResolvedValueOnce(
      qr([
        { id: 10, name: 'Apple', base_price: '50.00' },
        { id: 20, name: 'Banana', base_price: '30.00' },
      ])
    ) // products
    .mockResolvedValueOnce(qr([{ count: 3 }])) // recent orders → surge 1.0
    .mockResolvedValueOnce(qr([{ id: 1, quantity: 100, reserved_quantity: 2 }], 1)) // reserve #1
    .mockResolvedValueOnce(qr([{ id: 2, quantity: 50, reserved_quantity: 1 }], 1)) // reserve #2
    .mockResolvedValueOnce(
      qr([
        {
          id: 99,
          user_id: 1,
          store_id: 5,
          status: 'pending',
          total_amount: '155.00',
          delivery_fee: '25.00',
          surge_multiplier: '1.00',
          delivery_address: '123 Main St',
          estimated_delivery_minutes: 19,
          placed_at: new Date('2026-02-26T12:00:00Z'),
        },
      ])
    ) // insert order
    .mockResolvedValueOnce(qr([])) // insert order_items
    .mockResolvedValueOnce(qr([])) // insert status_history
    .mockResolvedValueOnce(qr([])); // COMMIT
}

// ── Tests ───────────────────────────────────────────────────────────
describe('orderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  // ─── Pure helpers ────────────────────────────────────────────────
  describe('calculateSurgeMultiplier', () => {
    it.each([
      [0, 1.0],
      [4, 1.0],
      [5, 1.1],
      [9, 1.1],
      [10, 1.25],
      [19, 1.25],
      [20, 1.5],
      [100, 1.5],
    ])('activeOrders=%i → multiplier=%s', (orders, expected) => {
      expect(calculateSurgeMultiplier(orders)).toBe(expected);
    });
  });

  describe('calculateEtaMinutes', () => {
    it('returns base + travel + buffer', () => {
      // 10 + 2*3 + 5 = 21
      expect(calculateEtaMinutes(2)).toBe(21);
    });

    it('returns 15 for 0 km distance', () => {
      // 10 + 0 + 5
      expect(calculateEtaMinutes(0)).toBe(15);
    });

    it('rounds to nearest minute', () => {
      // 10 + 1.5*3 + 5 = 19.5 → 20
      expect(calculateEtaMinutes(1.5)).toBe(20);
    });
  });

  // ─── Input validation ───────────────────────────────────────────
  describe('placeOrder – validation', () => {
    it('throws ValidationError when items is empty', async () => {
      await expect(
        placeOrder({ user: baseUser, items: [] })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when items is undefined', async () => {
      await expect(
        placeOrder({ user: baseUser, items: undefined })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for non-integer productId', async () => {
      await expect(
        placeOrder({ user: baseUser, items: [{ productId: 1.5, quantity: 1 }] })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for zero quantity', async () => {
      await expect(
        placeOrder({ user: baseUser, items: [{ productId: 1, quantity: 0 }] })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for negative productId', async () => {
      await expect(
        placeOrder({ user: baseUser, items: [{ productId: -1, quantity: 1 }] })
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when user has no location and none provided', async () => {
      const noLocUser = { id: 1, role: 'customer', delivery_address: 'x' };
      await expect(
        placeOrder({ user: noLocUser, items: [{ productId: 1, quantity: 1 }] })
      ).rejects.toThrow(ValidationError);
    });
  });

  // ─── Happy path ─────────────────────────────────────────────────
  describe('placeOrder – happy path', () => {
    it('returns a well-shaped order object', async () => {
      setupHappyPath();

      const result = await placeOrder({ user: baseUser, items: baseItems });

      expect(result).toMatchObject({
        id: 99,
        status: 'pending',
        store: { id: 5, name: 'Store Alpha' },
      });
      expect(result.items).toHaveLength(2);
      expect(typeof result.totalAmount).toBe('number');
      expect(typeof result.deliveryFee).toBe('number');
      expect(typeof result.surgeMultiplier).toBe('number');
      expect(typeof result.estimatedDeliveryMinutes).toBe('number');
      expect(result.placedAt).toBeInstanceOf(Date);
    });

    it('calls findBestStore with correct args', async () => {
      setupHappyPath();

      await placeOrder({ user: baseUser, items: baseItems });

      expect(mockFindBestStore).toHaveBeenCalledWith(
        baseUser.id,
        baseItems,
        { latitude: baseUser.latitude, longitude: baseUser.longitude }
      );
    });

    it('uses overridden userLocation when provided', async () => {
      setupHappyPath();
      const customLoc = { latitude: 19.076, longitude: 72.877 };

      await placeOrder({ user: baseUser, items: baseItems, userLocation: customLoc });

      expect(mockFindBestStore).toHaveBeenCalledWith(
        baseUser.id,
        baseItems,
        customLoc
      );
    });

    it('begins and commits the transaction', async () => {
      setupHappyPath();

      await placeOrder({ user: baseUser, items: baseItems });

      const calls = mockClientQuery.mock.calls.map((c) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls[calls.length - 1]).toBe('COMMIT');
    });

    it('releases the client after success', async () => {
      setupHappyPath();

      await placeOrder({ user: baseUser, items: baseItems });

      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('creates order items with parameterised values (no SQL injection)', async () => {
      setupHappyPath();

      await placeOrder({ user: baseUser, items: baseItems });

      // Call index 6 = insert order_items
      const [sql, params] = mockClientQuery.mock.calls[6];
      expect(sql).toContain('INSERT INTO order_items');
      expect(sql).toContain('$1');
      expect(params.length).toBeGreaterThan(0);
    });

    it('inserts status history with from_status NULL', async () => {
      setupHappyPath();

      await placeOrder({ user: baseUser, items: baseItems });

      // Call index 7 = insert status_history
      const [sql, params] = mockClientQuery.mock.calls[7];
      expect(sql).toContain('order_status_history');
      expect(params).toEqual([99, 'pending', baseUser.id]);
    });
  });

  // ─── Pricing ────────────────────────────────────────────────────
  describe('placeOrder – pricing', () => {
    it('computes correct item subtotals', async () => {
      setupHappyPath();

      const result = await placeOrder({ user: baseUser, items: baseItems });

      // Apple: 50 × 2 = 100, Banana: 30 × 1 = 30
      const apple = result.items.find((i) => i.productId === 10);
      const banana = result.items.find((i) => i.productId === 20);
      expect(apple.subtotal).toBe(100);
      expect(banana.subtotal).toBe(30);
    });
  });

  // ─── Error & rollback ──────────────────────────────────────────
  describe('placeOrder – error handling', () => {
    it('rolls back when product is not found', async () => {
      mockFindBestStore.mockResolvedValue(matchedStore);

      mockClientQuery
        .mockResolvedValueOnce(qr([])) // BEGIN
        .mockResolvedValueOnce(
          qr([{ id: 10, name: 'Apple', base_price: '50.00' }]) // only product 10
        )
        .mockResolvedValue(qr([])); // ROLLBACK + any remaining calls

      await expect(
        placeOrder({ user: baseUser, items: baseItems })
      ).rejects.toThrow(NotFoundError);

      // ROLLBACK should have been issued
      const calls = mockClientQuery.mock.calls.map((c) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('rolls back when inventory reservation fails (out of stock)', async () => {
      mockFindBestStore.mockResolvedValue(matchedStore);

      mockClientQuery
        .mockResolvedValueOnce(qr([])) // BEGIN
        .mockResolvedValueOnce(
          qr([
            { id: 10, name: 'Apple', base_price: '50.00' },
            { id: 20, name: 'Banana', base_price: '30.00' },
          ])
        ) // products
        .mockResolvedValueOnce(qr([{ count: 0 }])) // surge
        .mockResolvedValueOnce(qr([], 0)) // reserve fails for first item
        .mockResolvedValue(qr([])); // ROLLBACK

      await expect(
        placeOrder({ user: baseUser, items: baseItems })
      ).rejects.toThrow(OutOfStockError);

      const calls = mockClientQuery.mock.calls.map((c) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('rolls back and releases client on unexpected DB error', async () => {
      mockFindBestStore.mockResolvedValue(matchedStore);

      mockClientQuery
        .mockResolvedValueOnce(qr([])) // BEGIN
        .mockRejectedValueOnce(new Error('connection lost')) // product query fails
        .mockResolvedValue(qr([])); // ROLLBACK

      await expect(
        placeOrder({ user: baseUser, items: baseItems })
      ).rejects.toThrow('connection lost');

      expect(mockClientRelease).toHaveBeenCalledTimes(1);
    });

    it('propagates store matching errors without opening a transaction', async () => {
      mockFindBestStore.mockRejectedValue(
        new NotFoundError('No active stores available near you')
      );

      await expect(
        placeOrder({ user: baseUser, items: baseItems })
      ).rejects.toThrow(NotFoundError);

      // pool.connect should not have been called
      // (store matching happens before tx)
    });
  });
});
