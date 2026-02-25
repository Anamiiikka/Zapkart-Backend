const request = require('supertest');
const app = require('../src/app');

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /ready', () => {
    it('should return readiness status with checks', async () => {
      const response = await request(app).get('/ready');
      
      // May be 200 or 503 depending on db/redis availability
      expect([200, 503]).toContain(response.status);
      expect(response.body.checks).toBeDefined();
      expect(response.body.checks).toHaveProperty('database');
      expect(response.body.checks).toHaveProperty('redis');
    });
  });

  describe('GET /unknown', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.body.error.statusCode).toBe(404);
      expect(response.body.error.requestId).toBeDefined();
    });
  });
});
