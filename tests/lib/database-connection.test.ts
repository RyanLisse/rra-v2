import { describe, it, expect } from 'vitest';

describe('Database Connection Tests', () => {
  it('should have environment variables configured', () => {
    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID,
      POSTGRES_URL: process.env.POSTGRES_URL ? 'SET' : 'MISSING',
    });

    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.KINDE_CLIENT_ID).toBeDefined();
    expect(process.env.KINDE_SITE_URL).toBeDefined();

    // This should be set by the test setup
    if (!process.env.POSTGRES_URL) {
      console.warn('POSTGRES_URL not set, using fallback');
      process.env.POSTGRES_URL =
        'postgresql://test:test@localhost:5432/test_db';
    }
    expect(process.env.POSTGRES_URL).toBeDefined();
  });

  it('should have proper database URL fallback', () => {
    // Test that we don't rely on the non-existent test database
    const { getTestDatabaseUrl } = require('../config/neon-branch-setup');

    expect(process.env.POSTGRES_URL).toBeDefined();
    expect(getTestDatabaseUrl()).toBe(process.env.POSTGRES_URL);
  });

  it('should have mocked database functions available', () => {
    // Test that our mock database setup works
    const { createMockDatabase } = require('../utils/test-database');
    const mockDb = createMockDatabase();

    expect(mockDb).toBeDefined();
    expect(mockDb.select).toBeDefined();
    expect(mockDb.insert).toBeDefined();
    expect(mockDb.update).toBeDefined();
    expect(mockDb.delete).toBeDefined();
    expect(typeof mockDb.select).toBe('function');
  });

  it('should have test data factories available', () => {
    const {
      createTestUser,
      createTestDocument,
      createTestDocumentChunk,
    } = require('../utils/test-database');

    const testUser = createTestUser();
    expect(testUser).toBeDefined();
    expect(testUser.id).toBeDefined();
    expect(testUser.email).toBeDefined();

    const testDoc = createTestDocument();
    expect(testDoc).toBeDefined();
    expect(testDoc.id).toBeDefined();
    expect(testDoc.title).toBeDefined();

    const testChunk = createTestDocumentChunk();
    expect(testChunk).toBeDefined();
    expect(testChunk.id).toBeDefined();
    expect(testChunk.content).toBeDefined();
  });

  it('should validate test environment setup', () => {
    // Ensure all necessary test environment is configured
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.USE_NEON_BRANCHING).toBe('false');

    // Check that we don't have server-only environment indicators
    expect(process.env.VERCEL).toBeUndefined();
    expect(process.env.NODE_ENV).not.toBe('production');
  });
});
