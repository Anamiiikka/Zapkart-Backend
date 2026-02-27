const { pool } = require('./src/config/db');
const { signAccessToken } = require('./src/utils/jwt');
const http = require('http');

async function main() {
  // Check if agent user exists
  const r = await pool.query("SELECT id, name, email, role, agent_id, password_hash FROM users WHERE role = 'agent'");
  console.log('Agent user:', JSON.stringify({ id: r.rows[0].id, role: r.rows[0].role, agent_id: r.rows[0].agent_id }));

  // Generate token same way login does
  const user = r.rows[0];
  const token = signAccessToken({ sub: Number(user.id), role: user.role, agentId: Number(user.agent_id) });
  console.log('Token:', token);

  // Test the route with this token
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/orders/3/next-status',
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', body);
      process.exit(0);
    });
  });
  req.on('error', (e) => { console.log('Error:', e.message); process.exit(1); });
  req.write('{}');
  req.end();
}
main();
