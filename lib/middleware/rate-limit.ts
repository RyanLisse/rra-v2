import 'server-only';

// Re-export everything from the Redis-backed implementation
export {
  type RateLimitConfig,
  createRedisRateLimit as createRateLimit,
  chatRateLimit,
  authRateLimit,
  uploadRateLimit,
  searchRateLimit,
  clearRateLimit,
  getRateLimitStatus,
} from '../cache/redis-rate-limiter';
