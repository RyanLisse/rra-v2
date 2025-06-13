/**
 * Database Transaction Utilities
 *
 * Provides robust transaction handling with automatic rollback,
 * retry logic, and comprehensive error handling for multi-step
 * database operations.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';
import { db } from './config';
import { ChatSDKError } from '../errors';

/**
 * Transaction wrapper with automatic rollback on error
 * Provides consistent error handling and logging for database transactions
 */
export async function withTransaction<T>(
  fn: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>,
  options?: {
    isolationLevel?:
      | 'read uncommitted'
      | 'read committed'
      | 'repeatable read'
      | 'serializable';
    accessMode?: 'read write' | 'read only';
    retries?: number;
    retryDelay?: number;
  },
): Promise<T> {
  const maxRetries = options?.retries ?? 0;
  const retryDelay = options?.retryDelay ?? 100;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await db.transaction(
        async (tx) => {
          // Log transaction start in development
          if (process.env.NODE_ENV === 'development') {
            console.log(
              `[Transaction] Starting transaction (attempt ${attempt + 1}/${maxRetries + 1})`,
            );
          }

          const result = await fn(tx);

          // Log transaction success in development
          if (process.env.NODE_ENV === 'development') {
            console.log('[Transaction] Transaction completed successfully');
          }

          return result;
        },
        {
          isolationLevel: options?.isolationLevel,
          accessMode: options?.accessMode,
          deferrable: false,
        },
      );
    } catch (error) {
      lastError = error as Error;

      // Log transaction failure
      if (process.env.NODE_ENV === 'development') {
        console.error(
          `[Transaction] Transaction failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
          error,
        );
      }

      // Check if error is retryable
      if (attempt < maxRetries && isRetryableError(error)) {
        // Wait before retry with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // If not retryable or max retries reached, throw the error
      break;
    }
  }

  // Wrap the error with more context
  throw new ChatSDKError(
    'bad_request:database',
    `Transaction failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
  );
}

/**
 * Check if an error is retryable (e.g., deadlock, connection error)
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'deadlock',
    'timeout',
    'connection',
    'could not serialize',
    'concurrent update',
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

/**
 * Execute multiple queries in parallel within a transaction
 * Useful for operations that can be executed independently
 */
export async function withParallelTransaction<T extends readonly unknown[]>(
  fns: {
    [K in keyof T]: (tx: PostgresJsDatabase<typeof schema>) => Promise<T[K]>;
  },
  options?: Parameters<typeof withTransaction>[1],
): Promise<T> {
  return withTransaction(async (tx) => {
    const results = await Promise.all(fns.map((fn) => fn(tx)));
    return results as T;
  }, options);
}

/**
 * Transaction logging utility for debugging
 */
export function logTransaction(
  operation: string,
  details?: Record<string, unknown>,
): void {
  if (
    process.env.NODE_ENV === 'development' ||
    process.env.DB_ENABLE_TRANSACTION_LOGGING === 'true'
  ) {
    console.log(`[Transaction:${operation}]`, {
      timestamp: new Date().toISOString(),
      ...details,
    });
  }
}

/**
 * Create a transaction savepoint for nested transactions
 */
export async function withSavepoint<T>(
  tx: PostgresJsDatabase<typeof schema>,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    // Create savepoint
    await tx.execute(`SAVEPOINT ${name}`);

    const result = await fn();

    // Release savepoint on success
    await tx.execute(`RELEASE SAVEPOINT ${name}`);

    return result;
  } catch (error) {
    // Rollback to savepoint on error
    await tx.execute(`ROLLBACK TO SAVEPOINT ${name}`);
    throw error;
  }
}

/**
 * Execute operations with deadlock retry logic
 * Specifically designed for operations prone to deadlocks
 */
export async function withDeadlockRetry<T>(
  fn: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  return withTransaction(fn, {
    retries: maxRetries,
    retryDelay: 50, // Start with 50ms delay
    isolationLevel: 'read committed', // Less strict isolation to reduce deadlocks
  });
}

/**
 * Execute read-only operations in a transaction
 * Optimized for read operations with appropriate isolation level
 */
export async function withReadOnlyTransaction<T>(
  fn: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  return withTransaction(fn, {
    accessMode: 'read only',
    isolationLevel: 'repeatable read', // Consistent reads
  });
}

/**
 * Execute critical operations with serializable isolation
 * Use for operations requiring the highest level of consistency
 */
export async function withSerializableTransaction<T>(
  fn: (tx: PostgresJsDatabase<typeof schema>) => Promise<T>,
): Promise<T> {
  return withTransaction(fn, {
    isolationLevel: 'serializable',
    retries: 3, // Serializable transactions are more prone to conflicts
    retryDelay: 100,
  });
}
