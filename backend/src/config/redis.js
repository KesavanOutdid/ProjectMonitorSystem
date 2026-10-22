const Redis = require('ioredis');

let redisClient = null;
let isRedisConnected = false;

const initRedis = () => {
  if (process.env.REDIS_ENABLED === 'false') {
    console.log('[Redis] Disabled via environment config');
    return null;
  }

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT, 10) || 6379;
  const password = process.env.REDIS_PASSWORD || undefined;

  try {
    redisClient = new Redis({
      host,
      port,
      password,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) {
          console.warn('[Redis] Max retries reached. Running without Redis cache.');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisClient.connect().then(() => {
      isRedisConnected = true;
      console.log(`[Redis] Connected to ${host}:${port} for sub-5ms caching`);
    }).catch((err) => {
      isRedisConnected = false;
      console.warn(`[Redis Notice] Connection to ${host}:${port} skipped (${err.message}). Application will query MongoDB directly with indexed queries.`);
    });

    redisClient.on('error', (err) => {
      isRedisConnected = false;
    });

    redisClient.on('ready', () => {
      isRedisConnected = true;
    });

  } catch (error) {
    console.warn(`[Redis Initialization] Skipped: ${error.message}`);
  }

  return redisClient;
};

const getRedisClient = () => redisClient;
const isRedisReady = () => isRedisConnected && redisClient && redisClient.status === 'ready';

module.exports = {
  initRedis,
  getRedisClient,
  isRedisReady
};
