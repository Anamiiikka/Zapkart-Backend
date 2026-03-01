const { pool } = require('./src/config/db');
const bcrypt = require('bcrypt');

(async () => {
  const r = await pool.query(`SELECT password_hash FROM users WHERE email = 'admin@example.com'`);
  const hash = r.rows[0]?.password_hash;
  console.log('Hash prefix:', hash?.substring(0, 10));
  const valid = await bcrypt.compare('Admin@123', hash);
  console.log('Password "Admin@123" matches hash:', valid);
  await pool.end();
})();
