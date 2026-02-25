const { redis } = require('../config/redis');
const { env } = require('../config/env');
const logger = require('../config/logger');

// In-memory cache for development (when Redis is disabled)
const memoryCache = new Map();
const memoryCacheTTL = new Map();

/**
 * Cache wrapper - uses Redis when enabled, falls back to in-memory Map
 */
const cache = {
  /**
   * Get a value from cache
   * @param {string} key 
   * @returns {Promise<string|null>}
   */
  async get(key) {
    if (env.REDIS_ENABLED && redis) {
      return redis.get(key);
    }
    
    // In-memory fallback
    const expiry = memoryCacheTTL.get(key);
    if (expiry && Date.now() > expiry) {
      memoryCache.delete(key);
      memoryCacheTTL.delete(key);
      return null;
    }
    return memoryCache.get(key) || null;
  },

  /**
   * Set a value in cache
   * @param {string} key 
   * @param {string} value 
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds = 3600) {
    if (env.REDIS_ENABLED && redis) {
      await redis.set(key, value, 'EX', ttlSeconds);
      return;
    }
    
    // In-memory fallback
    memoryCache.set(key, value);
    memoryCacheTTL.set(key, Date.now() + ttlSeconds * 1000);
  },

  /**
   * Delete a value from cache
   * @param {string} key 
   * @returns {Promise<void>}
   */
  async del(key) {
    if (env.REDIS_ENABLED && redis) {
      await redis.del(key);
      return;
    }
    
    // In-memory fallback
    memoryCache.delete(key);
    memoryCacheTTL.delete(key);
  },

  /**
   * Clear all in-memory cache (useful for tests)
   */
  clear() {
    memoryCache.clear();
    memoryCacheTTL.clear();
    logger.debug('In-memory cache cleared');
  },
};

module.exports = cache;
