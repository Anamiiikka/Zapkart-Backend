const { pool } = require('./src/config/db');
const bcrypt = require('bcrypt');

const NEW_PASSWORD = 'Agent@123';
const AGENT_EMAIL  = 'agent1@test.com';

(async () => {
  try {
    const hash = await bcrypt.hash(NEW_PASSWORD, 12);
    const r = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email`,
      [hash, AGENT_EMAIL]
    );
    if (r.rowCount === 0) {
      console.error('User not found:', AGENT_EMAIL);
      process.exitCode = 1;
    } else {
      console.log('Password reset successfully for:', r.rows[0].email, '(id:', r.rows[0].id + ')');
      console.log('New password:', NEW_PASSWORD);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
