const { redis } = require('../config/redis');
const { env } = require('../config/env');
const logger = require('../config/logger');

// In-memory cache for development (when Redis is disabled)
const memoryCache = new Map();
const memoryCacheTTL = new Map();

// ── TTL presets (seconds) ──
const CACHE_TTL = {
  products:  300,  // 5 min
  stores:    120,  // 2 min
  inventory:  30,  // 30 s
  orders:     60,  // 1 min
};

/**
 * Cache wrapper - uses Redis when enabled, falls back to in-memory Map
 */
const cache = {
  /**
   * Get a raw string value from cache
   * @param {string} key 
   * @returns {Promise<string|null>}
   */
  async get(key) {
    try {
      if (env.REDIS_ENABLED && redis) {
        const val = await redis.get(key);
        if (val !== null) return val;
        return null;
      }
    } catch (err) {
      logger.error({ err, key }, 'Cache GET Redis error – falling back to memory');
    }

    // In-memory fallback (used when Redis disabled OR Redis threw)
    const expiry = memoryCacheTTL.get(key);
    if (expiry && Date.now() > expiry) {
      memoryCache.delete(key);
      memoryCacheTTL.delete(key);
      return null;
    }
    return memoryCache.get(key) || null;
  },

  /**
   * Get a parsed JSON value from cache
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async getJSON(key) {
    const raw = await cache.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },

  /**
   * Set a raw string value in cache
   * @param {string} key 
   * @param {string} value 
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds = 3600) {
    try {
      if (env.REDIS_ENABLED && redis) {
        await redis.set(key, value, 'EX', ttlSeconds);
        return;
      }
    } catch (err) {
      logger.error({ err, key }, 'Cache SET Redis error – falling back to memory');
    }

    // In-memory fallback
    memoryCache.set(key, value);
    memoryCacheTTL.set(key, Date.now() + ttlSeconds * 1000);
  },

  /**
   * Set a JSON-serialisable value in cache
   * @param {string} key
   * @param {any}    data
   * @param {number} ttlSeconds
   * @returns {Promise<void>}
   */
  async setJSON(key, data, ttlSeconds = 3600) {
    return cache.set(key, JSON.stringify(data), ttlSeconds);
  },

  /**
   * Delete a value from cache
   * @param {string} key 
   * @returns {Promise<void>}
   */
  async del(key) {
    try {
      if (env.REDIS_ENABLED && redis) {
        await redis.del(key);
      }
    } catch (err) {
      logger.error({ err, key }, 'Cache DEL Redis error');
    }

    // Always clear in-memory too (keeps both layers consistent)
    memoryCache.delete(key);
    memoryCacheTTL.delete(key);
  },

  /**
   * Delete all keys matching a prefix (e.g. 'products:*')
   * @param {string} prefix
   * @returns {Promise<number>} number of keys deleted
   */
  async delByPrefix(prefix) {
    try {
      if (env.REDIS_ENABLED && redis) {
        const keys = await redis.keys(`${prefix}*`);
        if (keys.length) await redis.del(...keys);
        return keys.length;
      }
      // In-memory fallback
      let count = 0;
      for (const key of memoryCache.keys()) {
        if (key.startsWith(prefix)) {
          memoryCache.delete(key);
          memoryCacheTTL.delete(key);
          count++;
        }
      }
      return count;
    } catch (err) {
      logger.error({ err, prefix }, 'Cache delByPrefix error');
      return 0;
    }
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

module.exports = { cache, CACHE_TTL };
