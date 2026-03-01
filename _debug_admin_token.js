const { pool } = require('./src/config/db');
const { signAccessToken } = require('./src/utils/jwt');

(async () => {
  const r = await pool.query(`SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1`);
  const user = r.rows[0];
  console.log('DB user:', JSON.stringify(user));

  const token = signAccessToken({ sub: Number(user.id), email: user.email, role: user.role });
  
  // Decode without verifying to show payload
  const [, payloadB64] = token.split('.');
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  console.log('JWT payload:', JSON.stringify(payload, null, 2));
  console.log('\nFresh token:', token);
  await pool.end();
})();
