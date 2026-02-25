const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/db');

describe('Auth integration', () => {
  const testEmail = `testuser${Date.now()}@example.com`;
  let accessToken;
  let refreshToken;

  beforeAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['testuser%@example.com']);
    await pool.query("DELETE FROM users WHERE email LIKE $1", ['testuser%@example.com']);
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', ['testuser%@example.com']);
    await pool.query("DELETE FROM users WHERE email LIKE $1", ['testuser%@example.com']);
    await pool.end();
  });

  describe('POST /api/v1/auth/register', () => {
    it('registers a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: testEmail,
          password: 'password123'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.user.name).toBe('Test User');
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Password should not be returned
      expect(res.body.data.user.password_hash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();
    });

    it('rejects duplicate email registration', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Another User',
          email: testEmail,
          password: 'password456'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test'
          // missing email and password
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('validates email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          password: 'password123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('validates password minimum length', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Test User',
          email: 'new@example.com',
          password: '123' // too short
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // Password should not be returned
      expect(res.body.data.user.password_hash).toBeUndefined();

      // Save tokens for subsequent tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('rejects invalid password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTH_ERROR');
    });

    it('rejects non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    let localRefreshToken;

    beforeAll(async () => {
      // Get fresh tokens for this test suite
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'password123'
        });
      localRefreshToken = loginRes.body.data.refreshToken;
    });

    it('refreshes tokens with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: localRefreshToken
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // New refresh token should be different (rotation)
      expect(res.body.data.refreshToken).not.toBe(localRefreshToken);

      // Update refresh token for subsequent tests
      localRefreshToken = res.body.data.refreshToken;
    });

    it('rejects already-used refresh token (rotation)', async () => {
      // Use the current refresh token
      const oldToken = localRefreshToken;
      
      // First refresh should work
      const res1 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldToken });
      
      expect(res1.statusCode).toBe(200);
      localRefreshToken = res1.body.data.refreshToken;

      // Second use of same token should fail
      const res2 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldToken });

      expect(res2.statusCode).toBe(401);
      expect(res2.body.success).toBe(false);
    });

    it('rejects invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: 'invalid-refresh-token'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let localAccessToken;

    beforeAll(async () => {
      // Get a fresh token for this test suite
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'password123'
        });
      localAccessToken = loginRes.body.data.accessToken;
    });

    it('returns current user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${localAccessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
    });

    it('rejects request without token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects request with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let localRefreshToken;

    beforeAll(async () => {
      // Get fresh tokens for this test suite
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'password123'
        });
      localRefreshToken = loginRes.body.data.refreshToken;
    });

    it('logs out successfully with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({
          refreshToken: localRefreshToken
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('subsequent refresh with revoked token should fail', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: localRefreshToken
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('logout is idempotent (does not error on already-revoked token)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({
          refreshToken: localRefreshToken
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/auth/logout-all', () => {
    let localAccessToken;
    let localRefreshToken;

    beforeAll(async () => {
      // Get fresh tokens for this test suite
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testEmail,
          password: 'password123'
        });
      localAccessToken = loginRes.body.data.accessToken;
      localRefreshToken = loginRes.body.data.refreshToken;
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout-all');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('logs out from all devices', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${localAccessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('all refresh tokens should be revoked after logout-all', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refreshToken: localRefreshToken
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
