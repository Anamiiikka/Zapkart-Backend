const { pool } = require('./src/config/db');

(async () => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, a.id AS agent_id, a.name AS agent_name, a.status
      FROM users u
      JOIN agents a ON a.user_id = u.id
      WHERE u.role = 'agent'
      ORDER BY u.id
    `);

    if (r.rows.length === 0) {
      console.log('No agent users found in the database.');
    } else {
      console.log('Agent accounts found:');
      r.rows.forEach(row => {
        console.log(JSON.stringify(row, null, 2));
      });
    }
  } catch (e) {
    console.error('DB error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
