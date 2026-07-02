const { Pool } = require('pg');
const { env } = require('./env');
const logger = require('./logger');

const poolConfig = env.DATABASE_URL
  ? {
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      // Managed Postgres (Render/Neon) can be slow to accept the first connection
      // after idle/deploy; a 2s timeout is too aggressive for a hosted DB.
      connectionTimeoutMillis: 15000,
    }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle database client');
});

pool.on('connect', () => {
  logger.debug('New database client connected');
});

const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug({ query: text, duration, rows: result.rowCount }, 'Executed query');
  return result;
};

const getClient = () => pool.connect();

const healthCheck = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  getClient,
  healthCheck,
};
