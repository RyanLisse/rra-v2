import type { FullConfig } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';

/**
 * Playwright global setup and teardown
 * Handles test environment initialization and cleanup
 */

async function globalSetup(config: FullConfig) {
  // Load environment variables
  const envPath = path.resolve(process.cwd(), '.env.test');
  const envLocalPath = path.resolve(process.cwd(), '.env.test.local');

  dotenvConfig({ path: envLocalPath });
  dotenvConfig({ path: envPath });

  // Set up test environment
  process.env.NODE_ENV = 'test';

  // Ensure required environment variables are set
  if (!process.env.POSTGRES_URL) {
    console.warn('POSTGRES_URL not set, using default test database');
    process.env.POSTGRES_URL = 'postgresql://test:test@localhost:5432/test';
  }

  if (!process.env.BETTER_AUTH_SECRET) {
    process.env.BETTER_AUTH_SECRET = `test-secret-${Math.random().toString(36)}`;
  }

  if (!process.env.BETTER_AUTH_URL) {
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  }

  console.log('Playwright global setup completed');
}

async function globalTeardown() {
  // Cleanup logic if needed
  console.log('Playwright global teardown completed');
}

export default globalSetup;
export { globalTeardown };
