/**
 * Test Database Configuration
 *
 * This file provides a test-specific database configuration that avoids
 * server-only imports and uses the production database for testing.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Test Database Connection Configuration
 * Uses minimal settings optimized for test environment
 */
export const TEST_DB_CONNECTION_CONFIG = {
  max: 2, // Minimal connections for testing
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
  transform: {
    undefined: null,
  },
} as const;

/**
 * Get the database URL for tests
 * Uses the same production database but with test-optimized settings
 */
function getTestDatabaseUrl(): string {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required for tests');
  }
  return process.env.POSTGRES_URL;
}

/**
 * Create a test database instance
 * This avoids server-only imports while maintaining compatibility
 */
function createTestDatabaseInstance() {
  const connectionString = getTestDatabaseUrl();
  
  // Create postgres client with test-optimized configuration
  const client = postgres(connectionString, {
    ...TEST_DB_CONNECTION_CONFIG,
    // Disable logging in tests unless explicitly enabled
    debug: process.env.TEST_DB_DEBUG === 'true' ? console.log : undefined,
  });

  // Create drizzle instance with schema
  const db = drizzle(client, {
    schema,
    logger: process.env.TEST_DB_DEBUG === 'true',
  });

  return { db, client };
}

// Export test database instance
const { db: testDb, client: testClient } = createTestDatabaseInstance();

export { testDb as db, testClient };

/**
 * Utility to cleanup test database connection
 */
export async function closeTestDatabase() {
  try {
    await testClient.end();
  } catch (error) {
    console.warn('Error closing test database connection:', error);
  }
}

/**
 * Utility to validate test database connection
 */
export async function validateTestDatabaseConnection() {
  try {
    await testDb.execute('SELECT 1');
    return true;
  } catch (error) {
    console.error('Test database connection failed:', error);
    return false;
  }
}