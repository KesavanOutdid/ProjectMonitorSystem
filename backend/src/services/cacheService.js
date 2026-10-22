const { getRedisClient, isRedisReady } = require('../config/redis');

/**
 * High-performance Cache Service for Sub-5ms Read Operations
 */
class CacheService {
  /**
   * Get cached data or execute callback to fetch and cache
   * @param {string} key - Unique Redis cache key
   * @param {number} ttlSeconds - Time-to-live in seconds (default 300 = 5 mins)
   * @param {Function} fetchCallback - Async function returning fresh data on cache miss
   */
  static async getOrSet(key, ttlSeconds = 300, fetchCallback) {
    const redis = getRedisClient();

    if (isRedisReady()) {
      try {
        const cached = await redis.get(key);
        if (cached !== null) {
          return {
            data: JSON.parse(cached),
            isCached: true
          };
        }
      } catch (err) {
        console.warn(`[Cache Read Error] Key: ${key} - ${err.message}`);
      }
    }

    // Cache Miss -> Fetch from database
    const freshData = await fetchCallback();

    if (isRedisReady() && freshData !== undefined && freshData !== null) {
      try {
        await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
      } catch (err) {
        console.warn(`[Cache Write Error] Key: ${key} - ${err.message}`);
      }
    }

    return {
      data: freshData,
      isCached: false
    };
  }

  /**
   * Delete a specific cache key
   * @param {string} key - Specific Redis key
   */
  static async del(key) {
    if (!isRedisReady()) return;
    const redis = getRedisClient();
    try {
      await redis.del(key);
    } catch (err) {
      console.warn(`[Cache Del Error] Key: ${key} - ${err.message}`);
    }
  }

  /**
   * Delete keys matching a wildcard pattern
   * @param {string} pattern - Pattern string
   */
  static async delPattern(pattern) {
    return this.invalidatePattern(pattern);
  }

  /**
   * Invalidate specific keys or key patterns (e.g., 'tasks:proj_123:*')
   * @param {string} pattern - Key or wild pattern
   */
  static async invalidatePattern(pattern) {
    if (!isRedisReady()) return;
    const redis = getRedisClient();

    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      console.warn(`[Cache Invalidation Error] Pattern: ${pattern} - ${err.message}`);
    }
  }

  /**
   * Invalidate all cached data for a project
   * @param {string} projectId 
   */
  static async invalidateProject(projectId) {
    await this.invalidatePattern(`tasks:${projectId}:*`);
    await this.invalidatePattern(`project:${projectId}:*`);
    await this.invalidatePattern(`kanban:${projectId}:*`);
    await this.invalidatePattern(`summary:${projectId}*`);
    await this.invalidatePattern(`members:${projectId}*`);
  }
}

module.exports = CacheService;
