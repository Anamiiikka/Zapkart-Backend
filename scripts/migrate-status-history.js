const { pool } = require('../src/config/db');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id            BIGSERIAL PRIMARY KEY,
        order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        from_status   VARCHAR(30),
        to_status     VARCHAR(30) NOT NULL,
        changed_by    BIGINT REFERENCES users(id),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id
        ON order_status_history (order_id, created_at)
    `);
    console.log('✅ order_status_history table created');
  } catch (e) {
    console.error('❌', e.message);
  } finally {
    await pool.end();
  }
}

migrate();
