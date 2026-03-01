const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

(async () => {
  const hash = await bcrypt.hash('Test@123', 12);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = 1', [hash]);
  console.log('Customer (id=1) password reset to Test@123');
  await pool.end();
})();
