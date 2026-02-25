const Redis = require('ioredis');
const { env } = require('./env');
const logger = require('./logger');

let redis = null;

if (env.REDIS_ENABLED) {
  const redisConfig = {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
  };

  redis = new Redis(redisConfig);

  redis.on('connect', () => {
    logger.info('Redis client connected');
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Redis client error');
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });
} else {
  logger.info('Redis is disabled');
}

const healthCheck = async () => {
  if (!redis) return true; // Skip check if Redis disabled
  const result = await redis.ping();
  return result === 'PONG';
};

module.exports = {
  redis,
  healthCheck,
};
