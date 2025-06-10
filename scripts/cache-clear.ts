#!/usr/bin/env bun

/**
 * Cache Clear Script
 *
 * Provides options to clear different types of caches
 */

import { CacheUtils, CacheInvalidation, redisCacheManager } from '@/lib/cache';
import pino from 'pino';

const logger = pino({
  name: 'cache-clear',
  level: 'info',
  transport: {
    target: 'pino-pretty',
  },
});

interface ClearOptions {
  all?: boolean;
  redis?: boolean;
  embeddings?: boolean;
  cohere?: boolean;
  search?: boolean;
  documents?: boolean;
  workflows?: boolean;
  api?: boolean;
  user?: string;
  pattern?: string;
  confirm?: boolean;
}

async function clearCaches(options: ClearOptions): Promise<void> {
  try {
    console.log('🧹 Cache Clearing Operation\n');

    // Show warning for destructive operations
    if (options.all && !options.confirm) {
      console.log('⚠️  WARNING: This will clear ALL caches!');
      console.log(
        'This operation cannot be undone and may impact performance temporarily.',
      );
      console.log('Run with --confirm flag to proceed.\n');
      return;
    }

    let totalCleared = 0;

    // Clear all caches
    if (options.all && options.confirm) {
      console.log('🗑️  Clearing all caches...');
      const result = await CacheUtils.clearAllCaches();
      totalCleared = result.redis + result.embeddings + result.cohere;
      console.log(`✅ Cleared ${totalCleared} cache entries\n`);
      return;
    }

    // Clear specific cache types
    if (options.redis) {
      console.log('🗑️  Clearing Redis cache...');
      const cleared = await redisCacheManager.clear();
      totalCleared += cleared;
      console.log(`✅ Cleared ${cleared} Redis cache entries`);
    }

    if (options.embeddings) {
      console.log('🗑️  Clearing embeddings cache...');
      const cleared = await redisCacheManager.clear('*', 'embedding');
      totalCleared += cleared;
      console.log(`✅ Cleared ${cleared} embedding cache entries`);
    }

    if (options.cohere) {
      console.log('🗑️  Clearing Cohere cache...');
      const cleared = await redisCacheManager.clear('*', 'embedding');
      totalCleared += cleared;
      console.log(`✅ Cleared ${cleared} Cohere cache entries`);
    }

    if (options.search) {
      console.log('🗑️  Clearing search cache...');
      if (options.user) {
        await CacheInvalidation.invalidateSearch(options.user);
        console.log(`✅ Cleared search cache for user: ${options.user}`);
      } else {
        await CacheInvalidation.invalidateSearch();
        console.log('✅ Cleared all search caches');
      }
    }

    if (options.documents) {
      console.log('🗑️  Clearing document caches...');
      const cleared = await redisCacheManager.clear('*', 'document');
      totalCleared += cleared;
      console.log(`✅ Cleared ${cleared} document cache entries`);
    }

    if (options.workflows) {
      console.log('🗑️  Clearing workflow caches...');
      const cleared = await redisCacheManager.clear('*', 'workflow');
      totalCleared += cleared;
      console.log(`✅ Cleared ${cleared} workflow cache entries`);
    }

    if (options.api) {
      console.log('🗑️  Clearing API response caches...');
      const cleared = await redisCacheManager.clear('*', 'api');
      totalCleared += cleared;
      console.log(`✅ Cleared ${cleared} API cache entries`);
    }

    if (options.user) {
      console.log(`🗑️  Clearing caches for user: ${options.user}...`);
      await CacheInvalidation.invalidateUser(options.user);
      console.log(`✅ Cleared user-specific caches for: ${options.user}`);
    }

    if (options.pattern) {
      console.log(`🗑️  Clearing caches matching pattern: ${options.pattern}...`);
      const cleared = await redisCacheManager.clear(options.pattern);
      totalCleared += cleared;
      console.log(`✅ Cleared ${cleared} cache entries matching pattern`);
    }

    if (totalCleared === 0 && !options.search && !options.user) {
      console.log('ℹ️  No cache clearing operations specified.');
      console.log('Use --help to see available options.');
      return;
    }

    console.log(
      `\n🎉 Cache clearing completed! Total entries cleared: ${totalCleared}`,
    );
  } catch (error) {
    logger.error({ error }, 'Failed to clear caches');
    process.exit(1);
  }
}

function parseArguments(): ClearOptions {
  const args = process.argv.slice(2);
  const options: ClearOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--all':
        options.all = true;
        break;
      case '--redis':
        options.redis = true;
        break;
      case '--embeddings':
        options.embeddings = true;
        break;
      case '--cohere':
        options.cohere = true;
        break;
      case '--search':
        options.search = true;
        break;
      case '--documents':
        options.documents = true;
        break;
      case '--workflows':
        options.workflows = true;
        break;
      case '--api':
        options.api = true;
        break;
      case '--user':
        options.user = args[++i];
        break;
      case '--pattern':
        options.pattern = args[++i];
        break;
      case '--confirm':
        options.confirm = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        console.log(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Cache Clear Script - Clear various types of caches

Usage:
  bun run scripts/cache-clear.ts [options]

Options:
  --all                Clear all caches (requires --confirm)
  --redis              Clear Redis cache
  --embeddings         Clear embeddings cache
  --cohere             Clear Cohere API cache
  --search             Clear search caches
  --documents          Clear document caches
  --workflows          Clear workflow caches
  --api                Clear API response caches
  --user <userId>      Clear caches for specific user
  --pattern <pattern>  Clear caches matching pattern
  --confirm            Confirm destructive operations
  --help, -h           Show this help message

Examples:
  # Clear all search caches
  bun run scripts/cache-clear.ts --search

  # Clear caches for specific user
  bun run scripts/cache-clear.ts --user user123

  # Clear embeddings and search caches
  bun run scripts/cache-clear.ts --embeddings --search

  # Clear all caches (dangerous!)
  bun run scripts/cache-clear.ts --all --confirm

  # Clear caches matching pattern
  bun run scripts/cache-clear.ts --pattern "search:user123:*"
`);
}

// Parse arguments and run
const options = parseArguments();

// Show help if no options provided
if (Object.keys(options).length === 0) {
  showHelp();
  process.exit(0);
}

clearCaches(options).catch((error) => {
  logger.error({ error }, 'Cache clear script failed');
  process.exit(1);
});
