#!/usr/bin/env tsx
import { getRedisClient } from '../lib/cache/redis-client';
import { getCacheStats } from '../lib/cache/redis-query-cache';

async function formatBytes(bytes: number): Promise<string> {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

async function monitorLoop() {
  console.clear();
  console.log('📊 Redis Cache Monitor - Press Ctrl+C to exit\n');
  
  const stats = await getCacheStats();
  const redis = await getRedisClient();
  
  console.log('🔸 Cache Statistics');
  console.log('━'.repeat(50));
  console.log(`Redis Status: ${stats.isRedisConnected ? '🟢 Connected' : '🔴 Disconnected'}`);
  console.log(`Redis Keys: ${stats.redisKeys.toLocaleString()}`);
  console.log(`Redis Memory: ${stats.redisMemoryUsage}`);
  console.log(`Fallback Keys: ${stats.memoryKeys.toLocaleString()}`);
  
  if (redis && stats.isRedisConnected) {
    // Get more detailed Redis info
    try {
      const info = await redis.info();
      const cpuMatch = info.match(/used_cpu_sys:(\d+\.\d+)/);
      const opsMatch = info.match(/instantaneous_ops_per_sec:(\d+)/);
      const hitRateMatch = info.match(/keyspace_hits:(\d+)/);
      const missRateMatch = info.match(/keyspace_misses:(\d+)/);
      
      console.log('\n🔸 Performance Metrics');
      console.log('━'.repeat(50));
      
      if (cpuMatch) {
        console.log(`CPU Usage: ${cpuMatch[1]}s`);
      }
      
      if (opsMatch) {
        console.log(`Operations/sec: ${opsMatch[1]}`);
      }
      
      if (hitRateMatch && missRateMatch) {
        const hits = Number.parseInt(hitRateMatch[1]);
        const misses = Number.parseInt(missRateMatch[1]);
        const total = hits + misses;
        const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0.00';
        console.log(`Cache Hit Rate: ${hitRate}%`);
        console.log(`Total Hits: ${hits.toLocaleString()}`);
        console.log(`Total Misses: ${misses.toLocaleString()}`);
      }
      
      // Get key distribution
      console.log('\n🔸 Key Distribution');
      console.log('━'.repeat(50));
      
      const patterns = [
        'query:user:*',
        'query:chat:*',
        'query:messages:*',
        'query:rag_document*',
        'rate_limit:*',
      ];
      
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        console.log(`${pattern}: ${keys.length} keys`);
      }
      
    } catch (error) {
      console.error('\nError getting detailed stats:', error);
    }
  }
  
  console.log('\n🔸 Recommendations');
  console.log('━'.repeat(50));
  
  if (!stats.isRedisConnected) {
    console.log('⚠️  Redis is not connected - using fallback cache');
    console.log('   Consider starting Redis for better performance');
  } else if (stats.redisKeys > 10000) {
    console.log('⚠️  High number of Redis keys detected');
    console.log('   Consider running cache cleanup');
  } else if (stats.memoryKeys > 1000) {
    console.log('⚠️  High number of fallback cache keys');
    console.log('   Memory usage may be high');
  } else {
    console.log('✅ Cache system operating normally');
  }
  
  console.log('\nRefreshing in 5 seconds...');
}

async function main() {
  // Initial monitoring
  await monitorLoop();
  
  // Refresh every 5 seconds
  setInterval(async () => {
    await monitorLoop();
  }, 5000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nStopping cache monitor...');
  process.exit(0);
});

main().catch((error) => {
  console.error('Error running cache monitor:', error);
  process.exit(1);
});