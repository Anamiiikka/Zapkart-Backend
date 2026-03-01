const { pool } = require('./src/config/db');
(async () => {
  const r = await pool.query(`SELECT id, name, email, role FROM users WHERE role = 'admin'`);
  console.log('Admin accounts:', JSON.stringify(r.rows, null, 2));
  await pool.end();
})();
