// db/seed.js
const { pool } = require('../src/config/db');

async function clearData() {
  // TRUNCATE with RESTART IDENTITY so IDs always start at 1 after re-seed
  // Use DO block to skip tables that don't exist yet (e.g. before latest migration)
  await pool.query(`
    DO $$
    BEGIN
      -- conditionally truncate order_status_history if it exists
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
      delivery_agents,
      products,
      dark_stores,
      users
    RESTART IDENTITY CASCADE
  `);
  console.log('Cleared existing data (sequences reset)');
}

async function seed() {
  try {
    await clearData();

    // 1) Users
    const userResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, phone, role, delivery_address, latitude, longitude)
       VALUES
         ('Test Customer', 'customer@example.com', 'FAKE_HASH_CHANGE_LATER', '9999999999', 'customer',
          'Customer Street, City', 28.6139, 77.2090),
         ('Test Admin', 'admin@example.com', 'FAKE_HASH_CHANGE_LATER', '8888888888', 'admin',
          'Admin Street, City', 28.7041, 77.1025)
       RETURNING id, email, role`
    );
    console.log('Seeded users:', userResult.rows);

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
         ('Amul Milk 500ml', 'Fresh toned milk', 'Dairy', 'https://example.com/amul-milk.jpg', 30.00, 500),
         ('Bananas 1kg', 'Fresh bananas', 'Fruits', 'https://example.com/bananas.jpg', 60.00, 1000),
         ('Bread 400g', 'White bread', 'Bakery', 'https://example.com/bread.jpg', 40.00, 400)
       RETURNING id, name`
    );
    console.log('Seeded products:', productResult.rows);

    const [milk, bananas, bread] = productResult.rows;

    // 4) Inventory for each store
    const inventoryValues = [
      [store1Id, milk.id, 50, 0, 10],
      [store1Id, bananas.id, 40, 0, 8],
      [store1Id, bread.id, 30, 0, 5],
      [store2Id, milk.id, 20, 0, 5],
      [store2Id, bananas.id, 15, 0, 5],
      [store2Id, bread.id, 10, 0, 5]
    ];

    const valuesSql = inventoryValues
      .map(
        (_, idx) =>
          `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
      )
      .join(', ');

    const flatParams = inventoryValues.flat();

    const inventoryResult = await pool.query(
      `INSERT INTO inventory (store_id, product_id, quantity, reserved_quantity, low_stock_threshold)
       VALUES ${valuesSql}
       RETURNING id`,
      flatParams
    );
    console.log('Seeded inventory:', inventoryResult.rows.length, 'rows');

    // 5) Delivery agents
    const agentResult = await pool.query(
      `INSERT INTO delivery_agents (name, phone, store_id, status, current_latitude, current_longitude)
       VALUES
         ('Agent One', '7777777777', $1, 'available', 28.6320, 77.2170),
         ('Agent Two', '6666666666', $1, 'available', 28.6300, 77.2150),
         ('Agent Three', '5555555555', $2, 'available', 28.6450, 77.0900)
       RETURNING id, name, store_id`,
      [store1Id, store2Id]
    );
    console.log('Seeded delivery agents:', agentResult.rows);

    console.log('\n✅ Database seeded successfully!');
  } catch (err) {
    console.error('❌ Error seeding database:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
