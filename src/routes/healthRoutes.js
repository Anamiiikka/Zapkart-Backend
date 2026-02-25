const express = require('express');
const db = require('../config/db');
const { redis, healthCheck: redisHealthCheck } = require('../config/redis');

const router = express.Router();

// Basic liveness check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Readiness check - verifies all dependencies
router.get('/ready', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
  };

  try {
    checks.database = await db.healthCheck();
  } catch (err) {
    checks.database = false;
  }

  try {
    checks.redis = await redisHealthCheck();
  } catch (err) {
    checks.redis = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

module.exports = router;
