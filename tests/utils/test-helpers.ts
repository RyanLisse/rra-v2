import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import type { BetterAuthSession } from '@/lib/auth';

// Request mocking utilities
export const createMockRequest = (
  url: string,
  options?: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    formData?: FormData;
  }
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
  headers?: Record<string, string>
): NextRequest => {
  return createMockRequest(url, {
    method: 'POST',
    formData,
    headers,
  });
};

// Auth mocking utilities
export const mockAuth = (session?: BetterAuthSession | null) => {
  return vi.fn().mockImplementation((handler) => {
    return async (request: NextRequest) => {
      if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return handler(request, session);
    };
  });
};

export const mockAuthSuccess = (userId: string, userType: 'regular' | 'premium' | 'admin' = 'regular') => {
  const session: BetterAuthSession = {
    user: {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      type: userType,
    },
    session: {
      id: 'session-id',
      userId,
      token: 'session-token',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  };
  return mockAuth(session);
};

export const mockAuthFailure = () => mockAuth(null);

// Database operation mocking
export const mockDatabaseOperation = <T>(result: T) => {
  return vi.fn().mockResolvedValue(result);
};

export const mockDatabaseError = (error: Error) => {
  return vi.fn().mockRejectedValue(error);
};

// File system mocking
export const mockFileSystemSuccess = () => {
  vi.mock('node:fs/promises', () => ({
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('test content')),
    unlink: vi.fn().mockResolvedValue(undefined),
  }));
};

export const mockFileSystemError = (error: Error) => {
  vi.mock('node:fs/promises', () => ({
    writeFile: vi.fn().mockRejectedValue(error),
    mkdir: vi.fn().mockRejectedValue(error),
    readFile: vi.fn().mockRejectedValue(error),
    unlink: vi.fn().mockRejectedValue(error),
  }));
};

// AI/LLM mocking utilities
export const mockStreamTextSuccess = (responseText: string) => {
  const mockStream = {
    consumeStream: vi.fn(),
    mergeIntoDataStream: vi.fn(),
  };

  vi.mock('ai', async () => {
    const actual = await vi.importActual('ai');
    return {
      ...actual,
      streamText: vi.fn().mockReturnValue(mockStream),
      createDataStream: vi.fn().mockReturnValue(new ReadableStream()),
    };
  });

  return mockStream;
};

// Test environment helpers
export const setupTestEnvironment = () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  
  // Mock external services
  vi.mock('@vercel/functions', () => ({
    geolocation: vi.fn().mockReturnValue({
      longitude: -122.4194,
      latitude: 37.7749,
      city: 'San Francisco',
      country: 'US',
    }),
  }));
};

// Response assertion helpers
export const assertSuccessResponse = async (response: Response, expectedStatus = 200) => {
  expect(response.status).toBe(expectedStatus);
  const data = await response.json();
  expect(data).toBeDefined();
  return data;
};

export const assertErrorResponse = async (
  response: Response,
  expectedStatus: number,
  expectedError?: string
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
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const retryUntil = async <T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  maxAttempts = 10,
  delayMs = 100
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
  fn: () => Promise<T>
): Promise<{ result: T; duration: number; memoryUsage: NodeJS.MemoryUsage }> => {
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
  await Promise.allSettled(filePaths.map(path => unlink(path)));
};

export const cleanupTestDirectories = async (dirPaths: string[]) => {
  const { rmdir } = await import('node:fs/promises');
  await Promise.allSettled(dirPaths.map(path => rmdir(path, { recursive: true })));
};