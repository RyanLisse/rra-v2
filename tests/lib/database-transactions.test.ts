import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  withTransaction, 
  withDeadlockRetry,
  withReadOnlyTransaction,
  withSerializableTransaction,
  logTransaction,
} from '@/lib/db/transactions';
import { db } from '@/lib/db';
import { ChatSDKError } from '@/lib/errors';

// Mock the database module
vi.mock('@/lib/db/config', () => ({
  db: {
    transaction: vi.fn(),
    execute: vi.fn(),
  },
}));

describe('Database Transaction Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('withTransaction', () => {
    it('should execute transaction successfully', async () => {
      const mockResult = { id: '123', data: 'test' };
      const mockTx = { execute: vi.fn() };
      
      vi.mocked(db.transaction).mockImplementation(async (fn) => {
        return fn(mockTx);
      });

      const result = await withTransaction(async (tx) => {
        expect(tx).toBe(mockTx);
        return mockResult;
      });

      expect(result).toBe(mockResult);
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('should rollback transaction on error', async () => {
      const mockError = new Error('Transaction failed');
      
      vi.mocked(db.transaction).mockRejectedValueOnce(mockError);

      await expect(
        withTransaction(async () => {
          throw mockError;
        }),
      ).rejects.toThrow(ChatSDKError);

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const mockResult = { success: true };
      const deadlockError = new Error('deadlock detected');
      
      vi.mocked(db.transaction)
        .mockRejectedValueOnce(deadlockError)
        .mockRejectedValueOnce(deadlockError)
        .mockImplementation(async (fn) => fn({}));

      const result = await withTransaction(
        async () => mockResult,
        { retries: 3, retryDelay: 10 },
      );

      expect(result).toBe(mockResult);
      expect(db.transaction).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const deadlockError = new Error('deadlock detected');
      
      vi.mocked(db.transaction).mockRejectedValue(deadlockError);

      await expect(
        withTransaction(
          async () => ({ data: 'test' }),
          { retries: 2, retryDelay: 10 },
        ),
      ).rejects.toThrow('Transaction failed after 3 attempts');

      expect(db.transaction).toHaveBeenCalledTimes(3);
    });

    it('should use correct isolation level', async () => {
      const mockTx = { execute: vi.fn() };
      
      vi.mocked(db.transaction).mockImplementation(async (fn, options) => {
        expect(options?.isolationLevel).toBe('serializable');
        return fn(mockTx);
      });

      await withTransaction(
        async () => ({ data: 'test' }),
        { isolationLevel: 'serializable' },
      );

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('withDeadlockRetry', () => {
    it('should retry deadlock errors with correct settings', async () => {
      const mockResult = { id: '456' };
      const deadlockError = new Error('deadlock detected');
      
      vi.mocked(db.transaction)
        .mockRejectedValueOnce(deadlockError)
        .mockImplementation(async (fn) => fn({}));

      const result = await withDeadlockRetry(async () => mockResult);

      expect(result).toBe(mockResult);
      expect(db.transaction).toHaveBeenCalledTimes(2);
    });
  });

  describe('withReadOnlyTransaction', () => {
    it('should set read-only access mode', async () => {
      const mockTx = { execute: vi.fn() };
      
      vi.mocked(db.transaction).mockImplementation(async (fn, options) => {
        expect(options?.accessMode).toBe('read only');
        expect(options?.isolationLevel).toBe('repeatable read');
        return fn(mockTx);
      });

      await withReadOnlyTransaction(async () => ({ data: 'read' }));

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('withSerializableTransaction', () => {
    it('should use serializable isolation with retries', async () => {
      const mockTx = { execute: vi.fn() };
      
      vi.mocked(db.transaction).mockImplementation(async (fn, options) => {
        expect(options?.isolationLevel).toBe('serializable');
        return fn(mockTx);
      });

      await withSerializableTransaction(async () => ({ data: 'critical' }));

      expect(db.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('logTransaction', () => {
    it('should log in development mode', () => {
      process.env.NODE_ENV = 'development';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logTransaction('testOperation', { id: '123', action: 'create' });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Transaction:testOperation]',
        expect.objectContaining({
          timestamp: expect.any(String),
          id: '123',
          action: 'create',
        }),
      );
    });

    it('should not log in production without flag', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_ENABLE_TRANSACTION_LOGGING = undefined;
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logTransaction('testOperation', { id: '123' });

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log in production with flag enabled', () => {
      process.env.NODE_ENV = 'production';
      process.env.DB_ENABLE_TRANSACTION_LOGGING = 'true';
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logTransaction('testOperation', { id: '123' });

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Error Detection', () => {
    it('should identify retryable errors correctly', async () => {
      const retryableErrors = [
        new Error('deadlock detected'),
        new Error('connection timeout'),
        new Error('could not serialize access'),
        new Error('concurrent update error'),
      ];

      for (const error of retryableErrors) {
        vi.mocked(db.transaction)
          .mockRejectedValueOnce(error)
          .mockImplementation(async (fn) => fn({}));

        await withTransaction(
          async () => ({ success: true }),
          { retries: 1, retryDelay: 10 },
        );

        expect(db.transaction).toHaveBeenCalledTimes(2);
        vi.clearAllMocks();
      }
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableErrors = [
        new Error('syntax error'),
        new Error('permission denied'),
        new Error('invalid column'),
      ];

      for (const error of nonRetryableErrors) {
        vi.mocked(db.transaction).mockRejectedValue(error);

        await expect(
          withTransaction(
            async () => ({ success: true }),
            { retries: 2, retryDelay: 10 },
          ),
        ).rejects.toThrow(ChatSDKError);

        expect(db.transaction).toHaveBeenCalledTimes(1);
        vi.clearAllMocks();
      }
    });
  });
});