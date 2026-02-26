// Run this one-off script: scripts/resetAdminPassword.js
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');

async function resetAdminPassword() {
  const hash = await bcrypt.hash('Admin@123', 12);
  await pool.query(
    `UPDATE users SET password_hash = $1 WHERE email = 'admin@example.com'`,
    [hash]
  );
  console.log('Admin password reset to Admin@123');
  await pool.end();
}

resetAdminPassword();
