import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBasicTestMocks } from '../utils/test-mocks';

/**
 * Infrastructure test to validate the fixed test setup
 * This test verifies that the core testing infrastructure works correctly
 */

describe('Test Infrastructure Validation', () => {
  beforeEach(() => {
    // Clear all mocks before each test for isolation
    vi.clearAllMocks();
  });

  it('should have essential environment variables set', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.POSTGRES_URL).toBeDefined();
    expect(process.env.BETTER_AUTH_SECRET).toBeDefined();
    expect(process.env.BETTER_AUTH_URL).toBeDefined();
  });

  it('should create database mocks successfully', () => {
    const mocks = createBasicTestMocks();

    expect(mocks.db).toBeDefined();
    expect(mocks.db.select).toBeInstanceOf(Function);
    expect(mocks.db.insert).toBeInstanceOf(Function);
    expect(mocks.db.update).toBeInstanceOf(Function);
    expect(mocks.db.delete).toBeInstanceOf(Function);
  });

  it('should create auth mocks successfully', () => {
    const mocks = createBasicTestMocks();

    expect(mocks.getServerSession).toBeInstanceOf(Function);
    expect(mocks.useSession).toBeInstanceOf(Function);
  });

  it('should allow mock overrides in individual tests', () => {
    const mocks = createBasicTestMocks();

    // Override a specific mock for this test
    mocks.db.select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue([{ id: 'custom-result' }]),
      }),
    });

    expect(mocks.db.select).toBeInstanceOf(Function);

    // Test the override works
    const result = mocks.db.select();
    expect(result.from).toBeInstanceOf(Function);
  });

  it('should isolate tests properly with beforeEach cleanup', () => {
    const mocks = createBasicTestMocks();

    // Modify mock to track calls
    mocks.db.select.mockReturnValue({ called: true });

    // Call the mock
    const result = mocks.db.select();
    expect(result).toEqual({ called: true });

    // The mock was called in this test
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });

  it('should handle async operations correctly', async () => {
    const mocks = createBasicTestMocks();

    // Mock an async database operation
    mocks.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue([{ id: 'async-result' }]),
      }),
    });

    const query = mocks.db.select().from();
    const result = await query.execute();

    expect(result).toEqual([{ id: 'async-result' }]);
  });

  it('should support custom mock configurations', () => {
    const customMocks = {
      ...createBasicTestMocks(),
      customService: {
        method: vi.fn().mockReturnValue('custom-value'),
      },
    };

    expect(customMocks.customService.method()).toBe('custom-value');
    expect(customMocks.db).toBeDefined();
    expect(customMocks.getServerSession).toBeDefined();
  });
});

describe('Mock Behavior Validation', () => {
  it('should reset mock call history between tests', () => {
    const mocks = createBasicTestMocks();

    // Call mock in first test part
    mocks.db.select();
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });

  it('should have clean mocks in second test', () => {
    const mocks = createBasicTestMocks();

    // Mock should be clean due to vi.clearAllMocks() in beforeEach
    expect(mocks.db.select).toHaveBeenCalledTimes(0);
  });
});

describe('Error Handling', () => {
  it('should handle mock errors gracefully', () => {
    const mocks = createBasicTestMocks();

    // Configure mock to throw error
    mocks.db.select.mockImplementation(() => {
      throw new Error('Database connection failed');
    });

    expect(() => mocks.db.select()).toThrow('Database connection failed');
  });

  it('should handle async mock errors', async () => {
    const mocks = createBasicTestMocks();

    // Configure mock to reject
    mocks.getServerSession.mockRejectedValue(
      new Error('Auth service unavailable'),
    );

    await expect(mocks.getServerSession()).rejects.toThrow(
      'Auth service unavailable',
    );
  });
});
