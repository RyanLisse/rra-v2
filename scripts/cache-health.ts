#!/usr/bin/env tsx

/**
 * Cache Health Check Script
 * 
 * Checks the health of the Redis cache system and provides diagnostics
 * 
 * Usage: bun run cache:health
 */

import { checkCacheHealth, getCacheConfig } from '../lib/cache/cache-utils';
import { isRedisAvailable } from '../lib/cache/redis-client';

async function main() {
  console.log('🔍 Redis Cache Health Check\n');

  // Check Redis availability
  console.log('1. Checking Redis connection...');
  const isAvailable = await isRedisAvailable();
  
  if (!isAvailable) {
    console.error('❌ Redis is not available!');
    console.log('\nTroubleshooting steps:');
    console.log('1. Ensure Redis is installed: brew install redis (macOS) or apt-get install redis-server (Ubuntu)');
    console.log('2. Start Redis: redis-server');
    console.log('3. Check Redis connection settings in .env:');
    console.log('   REDIS_HOST=localhost');
    console.log('   REDIS_PORT=6379');
    console.log('   REDIS_PASSWORD=<if-required>');
    console.log('   REDIS_DB=0');
    console.log('\nThe application will fall back to in-memory caching.');
  } else {
    console.log('✅ Redis connection successful!');
  }

  // Get cache health stats
  console.log('\n2. Getting cache statistics...');
  const health = await checkCacheHealth();
  
  console.log('\nCache Health Status:');
  console.log('━'.repeat(50));
  console.log(`Redis Connected: ${health.isRedisConnected ? '✅' : '❌'}`);
  console.log(`Redis Keys: ${health.redisKeys}`);
  console.log(`Redis Memory Usage: ${health.redisMemoryUsage}`);
  console.log(`Memory Cache Keys: ${health.memoryKeys}`);
  console.log('━'.repeat(50));

  // Show cache configuration
  console.log('\n3. Cache Configuration:');
  const config = getCacheConfig();
  
  console.log('\nTTL Settings (seconds):');
  Object.entries(config.ttl).forEach(([category, ttls]) => {
    console.log(`\n${category}:`);
    Object.entries(ttls as any).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}s`);
    });
  });

  console.log('\nRedis Configuration:');
  console.log(`  Host: ${config.redis.host}`);
  console.log(`  Port: ${config.redis.port}`);
  console.log(`  DB: ${config.redis.db}`);

  // Summary
  console.log('\n📊 Summary:');
  if (health.healthy) {
    console.log('✅ Cache system is healthy and operational');
  } else {
    console.log('⚠️  Cache system is using fallback mode (in-memory)');
    console.log('   Performance may be impacted in production');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Error running cache health check:', error);
  process.exit(1);
});