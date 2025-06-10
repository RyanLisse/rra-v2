import { vi } from 'vitest';

/**
 * Database testing utilities
 * Use these for tests that need database operations
 */

// Mock database query builders
export const createMockQueryBuilder = () => ({
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  execute: vi.fn().mockResolvedValue([]),
  returning: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
});

// Mock Drizzle database connection
export const createMockDatabase = () => ({
  select: vi.fn().mockImplementation(() => createMockQueryBuilder()),
  insert: vi.fn().mockImplementation(() => createMockQueryBuilder()),
  update: vi.fn().mockImplementation(() => createMockQueryBuilder()),
  delete: vi.fn().mockImplementation(() => createMockQueryBuilder()),
  query: {
    users: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    documents: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    documentChunks: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
  transaction: vi.fn().mockImplementation((callback) => {
    // Mock transaction - just call the callback with the mock db
    return callback(createMockDatabase());
  }),
});

// Test data factories for common database entities
export const createTestUser = (overrides = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestDocument = (overrides = {}) => ({
  id: 'test-doc-id',
  title: 'Test Document',
  userId: 'test-user-id',
  filename: 'test.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  status: 'processed',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createTestDocumentChunk = (overrides = {}) => ({
  id: 'test-chunk-id',
  documentId: 'test-doc-id',
  content: 'Test chunk content',
  chunkIndex: 0,
  elementType: 'paragraph',
  pageNumber: 1,
  bbox: null,
  confidence: 0.95,
  createdAt: new Date(),
  ...overrides,
});

export const createTestEmbedding = (overrides = {}) => ({
  id: 'test-embedding-id',
  chunkId: 'test-chunk-id',
  embedding: Array(1024)
    .fill(0)
    .map(() => Math.random()),
  model: 'cohere-embed-v4.0',
  createdAt: new Date(),
  ...overrides,
});

// Setup function for database-dependent tests
export const setupDatabaseTest = () => {
  const mockDb = createMockDatabase();

  // Mock the database module
  vi.doMock('@/lib/db', () => ({
    db: mockDb,
  }));

  return { mockDb };
};

// Utility to set up specific query results
export const mockQueryResult = (
  mockDb: any,
  table: string,
  method: string,
  result: any,
) => {
  if (mockDb.query[table]?.[method]) {
    mockDb.query[table][method].mockResolvedValue(result);
  }
};
