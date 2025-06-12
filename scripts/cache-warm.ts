#!/usr/bin/env tsx

/**
 * Cache Warmup Script
 * 
 * Pre-populates cache with frequently accessed data
 * 
 * Usage: bun run cache:warm
 */

import { warmupCache } from '../lib/cache/cache-utils';
import { isRedisAvailable } from '../lib/cache/redis-client';
import { db } from '../lib/db';
import { user, chat, ragDocument } from '../lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import { setCachedResult } from '../lib/cache/redis-query-cache';
import { CacheKeys, CacheTTL } from '../lib/cache/redis-client';

async function main() {
  console.log('🔥 Cache Warmup Script\n');

  // Check Redis availability
  const isAvailable = await isRedisAvailable();
  if (!isAvailable) {
    console.error('❌ Redis is not available. Cannot warm cache.');
    console.log('Please start Redis first: redis-server');
    process.exit(1);
  }

  console.log('✅ Redis connection established\n');

  try {
    // 1. Warm up basic cache patterns
    console.log('1. Warming up cache patterns...');
    await warmupCache();
    console.log('   ✓ Cache patterns warmed\n');

    // 2. Pre-load recent users
    console.log('2. Pre-loading recent users...');
    const recentUsers = await db
      .select()
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(100);
    
    for (const u of recentUsers) {
      const cacheKey = CacheKeys.query.user.byEmail(u.email);
      await setCachedResult(cacheKey, [u], CacheTTL.query.user * 1000);
    }
    console.log(`   ✓ Loaded ${recentUsers.length} users\n`);

    // 3. Pre-load recent chats
    console.log('3. Pre-loading recent chats...');
    const recentChats = await db
      .select()
      .from(chat)
      .orderBy(desc(chat.createdAt))
      .limit(50);
    
    for (const c of recentChats) {
      const cacheKey = CacheKeys.query.chat.byId(c.id);
      await setCachedResult(cacheKey, c, CacheTTL.query.chat * 1000);
    }
    console.log(`   ✓ Loaded ${recentChats.length} chats\n`);

    // 4. Pre-load document stats
    console.log('4. Pre-loading document statistics...');
    const [docStats] = await db
      .select({
        totalDocs: sql<number>`count(*)`,
        totalUsers: sql<number>`count(distinct ${ragDocument.uploadedBy})`,
      })
      .from(ragDocument);
    
    console.log(`   ✓ Total documents: ${docStats.totalDocs}`);
    console.log(`   ✓ Total users with documents: ${docStats.totalUsers}\n`);

    // 5. Pre-load popular documents
    console.log('5. Pre-loading frequently accessed documents...');
    const popularDocs = await db
      .select({
        document: ragDocument,
        accessCount: sql<number>`count(*)`,
      })
      .from(ragDocument)
      .groupBy(ragDocument.id)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    
    for (const { document: doc } of popularDocs) {
      const cacheKey = CacheKeys.query.ragDocuments.byId(doc.id, doc.uploadedBy);
      await setCachedResult(cacheKey, doc, CacheTTL.query.user * 1000);
    }
    console.log(`   ✓ Loaded ${popularDocs.length} popular documents\n`);

    console.log('✅ Cache warmup completed successfully!');
    console.log('\nCache is now pre-populated with:');
    console.log('- Recent users');
    console.log('- Recent chats');
    console.log('- Document statistics');
    console.log('- Popular documents');

  } catch (error) {
    console.error('❌ Error during cache warmup:', error);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});