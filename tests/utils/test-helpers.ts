import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import type { KindeUser } from '@/lib/auth';

// Request mocking utilities
export const createMockRequest = (
  url: string,
  options?: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    formData?: FormData;
  },
): NextRequest => {
  const { method = 'GET', body, headers = {}, formData } = options || {};

  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (formData) {
    requestInit.body = formData;
    requestInit.headers['Content-Type'] = undefined; // Let browser set multipart boundary
  } else if (body) {
    requestInit.body = JSON.stringify(body);
  }

  return new NextRequest(url, requestInit);
};

export const createMockFormDataRequest = (
  url: string,
  formData: FormData,
  headers?: Record<string, string>,
): NextRequest => {
  return createMockRequest(url, {
    method: 'POST',
    formData,
    headers,
  });
};

// Auth mocking utilities for Kinde
export const mockKindeAuth = (user?: KindeUser | null) => {
  return vi.fn().mockImplementation((handler) => {
    return async (request: NextRequest) => {
      if (!user) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return handler(request, user);
    };
  });
};

export const mockKindeAuthSuccess = (
  userId: string,
  userType: 'guest' | 'regular' | 'admin' = 'regular',
) => {
  const user: KindeUser = {
    id: userId,
    email: 'test@example.com',
    given_name: 'Test',
    family_name: 'User',
    picture: null,
    type: userType,
  };
  return mockKindeAuth(user);
};

export const mockKindeAuthFailure = () => mockKindeAuth(null);

// Legacy alias for backward compatibility
export const mockAuthFailure = mockKindeAuthFailure;
export const mockAuthSuccess = mockKindeAuthSuccess;

// Database operation mocking
export const mockDatabaseOperation = <T>(result: T) => {
  return vi.fn().mockResolvedValue(result);
};

export const mockDatabaseError = (error: Error) => {
  return vi.fn().mockRejectedValue(error);
};

// File system mocking (mock setup handled globally in test-setup.ts)

// Comprehensive test environment setup
export const setupTestEnvironment = () => {
  // Set environment variables for testing
  process.env.POSTGRES_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.NODE_ENV = 'test';
  process.env.KINDE_CLIENT_ID = 'test-client-id';
  process.env.KINDE_CLIENT_SECRET = 'test-client-secret';
  process.env.KINDE_ISSUER_URL = 'https://test.kinde.com';
  process.env.KINDE_SITE_URL = 'http://localhost:3000';
  process.env.KINDE_POST_LOGOUT_REDIRECT_URL = 'http://localhost:3000';
  process.env.KINDE_POST_LOGIN_REDIRECT_URL = 'http://localhost:3000';
  
  // Note: Mock setup is handled globally in test-setup.ts
  // vi.mock calls must be at module level, not inside functions
};

// File system error mocking (removed - mock setup handled globally in test-setup.ts)

// AI/LLM mocking utilities (removed - mock setup handled globally in test-setup.ts)

// Test environment helpers - removed duplicate, using the comprehensive one above

// Response assertion helpers
export const assertSuccessResponse = async (
  response: Response,
  expectedStatus = 200,
) => {
  expect(response.status).toBe(expectedStatus);
  const data = await response.json();
  expect(data).toBeDefined();
  return data;
};

export const assertErrorResponse = async (
  response: Response,
  expectedStatus: number,
  expectedError?: string,
) => {
  expect(response.status).toBe(expectedStatus);
  const data = await response.json();
  expect(data.error).toBeDefined();
  if (expectedError) {
    expect(data.error).toContain(expectedError);
  }
  return data;
};

// Async test helpers
export const waitFor = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const retryUntil = async <T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  maxAttempts = 10,
  delayMs = 100,
): Promise<T> => {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn();
    if (condition(result)) {
      return result;
    }
    if (i < maxAttempts - 1) {
      await waitFor(delayMs);
    }
  }
  throw new Error(`Condition not met after ${maxAttempts} attempts`);
};

// Performance testing helpers
export const measurePerformance = async <T>(
  fn: () => Promise<T>,
): Promise<{
  result: T;
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
}> => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();

  const result = await fn();

  const endTime = process.hrtime.bigint();
  const endMemory = process.memoryUsage();

  const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

  return {
    result,
    duration,
    memoryUsage: {
      rss: endMemory.rss - startMemory.rss,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      external: endMemory.external - startMemory.external,
      arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
    },
  };
};

// Test data cleanup helpers
export const cleanupTestFiles = async (filePaths: string[]) => {
  const { unlink } = await import('node:fs/promises');
  await Promise.allSettled(filePaths.map((path) => unlink(path)));
};

export const cleanupTestDirectories = async (dirPaths: string[]) => {
  const { rmdir } = await import('node:fs/promises');
  await Promise.allSettled(
    dirPaths.map((path) => rmdir(path, { recursive: true })),
  );
};
