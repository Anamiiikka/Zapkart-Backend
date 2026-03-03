/**
 * Node.js migration runner – executes SQL migration files against the database.
 * Uses DATABASE_URL (Railway) or individual DB_* env vars.
 *
 * Usage:
 *   node db/migrate.js          # run all migrations
 *   node db/migrate.js --seed   # run migrations + seed data
 *
 * The script is idempotent: it tracks which files have already been applied
 * in a `schema_migrations` table so re-running is safe.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// ── Build pool from env (same logic as src/config/db.js) ──
const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'zapkart',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      connectionTimeoutMillis: 10000,
    };

const pool = new Pool(poolConfig);

// ── Ordered list of migration files ──
const MIGRATION_FILES = [
  'init.sql',
  'add_indexes.sql',
  'agents.sql',
  'add_agent_to_orders.sql',
  'postgis_agents.sql',
];

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query('SELECT filename FROM schema_migrations ORDER BY applied_at');
  return new Set(rows.map((r) => r.filename));
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    await ensureTrackingTable(client);
    const applied = await getAppliedMigrations(client);

    for (const file of MIGRATION_FILES) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      if (!fs.existsSync(filePath)) {
        console.warn(`  ⚠ ${file} not found — skipping`);
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf-8');
      console.log(`  ▶ Applying ${file} …`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${file} applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${file} failed:`, err.message);
        throw err;
      }
    }

    console.log('✅ All migrations applied');
  } finally {
    client.release();
  }
}

async function main() {
  console.log('── Running database migrations ──');
  try {
    await runMigrations();
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Allow importing as a module OR running directly
if (require.main === module) {
  main();
} else {
  module.exports = { runMigrations };
}
