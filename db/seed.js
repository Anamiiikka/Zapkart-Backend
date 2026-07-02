// db/seed.js
//
// Idempotent demo seeder for the Zapkart platform.
//
// - Uses REAL bcrypt password hashes so the seeded accounts can actually log in.
// - Seeds into the current schema (`agents` table, not the removed `delivery_agents`).
// - Links one agent account (user + agents row) so the agent dashboard works end-to-end.
// - Safe to run on every deploy: it SKIPS seeding when data already exists,
//   unless invoked with `--force` (which truncates and re-seeds from scratch).
//
// Usage:
//   node db/seed.js            # seed only if the database is empty
//   node db/seed.js --force    # wipe and re-seed

const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

const FORCE = process.argv.includes('--force');

// Shared demo password for every seeded account.
const DEMO_PASSWORD = 'password123';
const BCRYPT_ROUNDS = 12;

async function alreadySeeded() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
  return rows[0].count > 0;
}

async function clearData() {
  // TRUNCATE with RESTART IDENTITY so IDs always start at 1 after re-seed.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_status_history') THEN
        TRUNCATE order_status_history RESTART IDENTITY CASCADE;
      END IF;
    END $$;
  `);
  await pool.query(`
    TRUNCATE
      refresh_tokens,
      order_items,
      orders,
      inventory,
      agents,
      products,
      dark_stores,
      users
    RESTART IDENTITY CASCADE
  `);
  console.log('Cleared existing data (sequences reset)');
}

async function seed() {
  try {
    if (!FORCE && (await alreadySeeded())) {
      console.log('ℹ️  Database already has data — skipping seed (use --force to reseed).');
      return;
    }

    await clearData();

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

    // 1) Users — customer, admin, and one agent account.
    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, phone, role, delivery_address, latitude, longitude)
       VALUES
         ('Test Customer', 'customer@example.com', $1, '9999999999', 'customer',
          '221B Connaught Place, New Delhi', 28.6315, 77.2167),
         ('Test Admin', 'admin@example.com', $1, '8888888888', 'admin',
          'Admin HQ, New Delhi', 28.7041, 77.1025),
         ('Ravi Kumar', 'agent@example.com', $1, '7777777777', 'agent',
          'Agent Base, New Delhi', 28.6320, 77.2170)
       RETURNING id, email, role`,
      [passwordHash]
    );
    console.log('Seeded users:', userResult.rows);

    const agentUserId = userResult.rows.find((u) => u.role === 'agent').id;

    // 2) Dark stores
    const storeResult = await pool.query(
      `INSERT INTO dark_stores (name, area_name, latitude, longitude, is_active, max_orders_per_slot)
       VALUES
         ('Central Store', 'Connaught Place', 28.6315, 77.2167, TRUE, 100),
         ('West Store', 'West Delhi', 28.6460, 77.0910, TRUE, 80)
       RETURNING id, name, latitude, longitude`
    );
    console.log('Seeded dark stores:', storeResult.rows);

    const store1Id = storeResult.rows[0].id;
    const store2Id = storeResult.rows[1].id;

    // 3) Products
    const productResult = await pool.query(
      `INSERT INTO products (name, description, category, image_url, base_price, weight_grams)
       VALUES
         ('Amul Milk 500ml', 'Fresh toned milk',  'Dairy',  'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400', 30.00, 500),
         ('Bananas 1kg',     'Fresh bananas',      'Fruits', 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400', 60.00, 1000),
         ('Bread 400g',      'White bread',        'Bakery', 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400', 40.00, 400),
         ('Eggs (6 pcs)',    'Farm fresh eggs',    'Dairy',  'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400', 55.00, 300),
         ('Tomatoes 1kg',    'Ripe tomatoes',      'Vegetables', 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400', 35.00, 1000),
         ('Potato Chips',    'Salted potato chips','Snacks', 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400', 20.00, 90)
       RETURNING id, name`
    );
    console.log('Seeded products:', productResult.rows.length);

    const productIds = productResult.rows.map((r) => r.id);

    // 4) Inventory — stock every product in both stores.
    const inventoryValues = [];
    for (const pid of productIds) {
      inventoryValues.push([store1Id, pid, 50, 0, 10]);
      inventoryValues.push([store2Id, pid, 25, 0, 8]);
    }

    const valuesSql = inventoryValues
      .map((_, idx) => `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`)
      .join(', ');

    const inventoryResult = await pool.query(
      `INSERT INTO inventory (store_id, product_id, quantity, reserved_quantity, low_stock_threshold)
       VALUES ${valuesSql}
       RETURNING id`,
      inventoryValues.flat()
    );
    console.log('Seeded inventory:', inventoryResult.rows.length, 'rows');

    // 5) Delivery agents (into the current `agents` table). One is linked to the
    //    agent user account so the agent dashboard flow works after login.
    const agentResult = await pool.query(
      `INSERT INTO agents (user_id, name, phone, store_id, status, current_latitude, current_longitude)
       VALUES
         ($1,   'Ravi Kumar',   '7777777777', $2, 'available', 28.6320, 77.2170),
         (NULL, 'Priya Singh',  '6666666666', $2, 'available', 28.6300, 77.2150),
         (NULL, 'Amit Sharma',  '5555555555', $3, 'available', 28.6450, 77.0900)
       RETURNING id, name, store_id`,
      [agentUserId, store1Id, store2Id]
    );
    console.log('Seeded agents:', agentResult.rows);

    // 6) Back-link the agent user to its agents row (enables requireAgent guard).
    const linkedAgentId = agentResult.rows[0].id;
    await pool.query('UPDATE users SET agent_id = $1 WHERE id = $2', [linkedAgentId, agentUserId]);

    console.log('\n✅ Database seeded successfully!');
    console.log('\n── Demo accounts (password: %s) ──', DEMO_PASSWORD);
    console.log('  customer@example.com   (customer)');
    console.log('  admin@example.com      (admin)');
    console.log('  agent@example.com      (agent, linked to "Ravi Kumar")');
  } catch (err) {
    console.error('❌ Error seeding database:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
