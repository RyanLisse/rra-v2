import { vi } from 'vitest';

/**
 * Test mock utilities - use these in individual tests instead of global mocks
 * This allows tests to control their own mocking strategy
 */

// Database mocks
export const createDatabaseMocks = () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([]),
        }),
        execute: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
        }),
        execute: vi.fn().mockResolvedValue([{ id: 'test-id' }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          execute: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
});

// Auth mocks
export const createAuthMocks = () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: 'test-user', email: 'test@example.com' },
  }),
  useSession: vi.fn().mockReturnValue({
    data: { user: { id: 'test-user', email: 'test@example.com' } },
    status: 'authenticated',
  }),
});

// AI/Embeddings mocks
export const createEmbeddingMocks = () => ({
  cohereService: {
    generateQueryEmbedding: vi.fn().mockResolvedValue({
      embedding: Array(1024)
        .fill(0)
        .map(() => Math.random() * 0.1),
      tokens: 10,
    }),
    generateEmbedding: vi.fn().mockResolvedValue({
      embedding: Array(1024)
        .fill(0)
        .map(() => Math.random() * 0.1),
      tokens: 10,
    }),
    rerankDocuments: vi.fn().mockResolvedValue({
      results: [
        {
          index: 0,
          relevanceScore: 0.9,
          document: { text: 'test document 1' },
        },
        {
          index: 1,
          relevanceScore: 0.8,
          document: { text: 'test document 2' },
        },
      ],
    }),
  },
});

// Vector search mocks
export const createVectorSearchMocks = () => ({
  vectorSearchService: {
    hybridSearch: vi.fn().mockResolvedValue({
      results: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Test Document',
          content: 'Test content for search',
          hybridScore: 0.85,
          similarity: 0.82,
          metadata: { source: 'test' },
          chunkIndex: 0,
          elementType: 'text',
          pageNumber: 1,
          bbox: null,
          rerankScore: 0.9,
        },
      ],
      totalResults: 1,
      queryEmbeddingTokens: 10,
      searchTimeMs: 150,
      cacheHit: false,
      algorithmUsed: 'adaptive',
    }),
    vectorSearch: vi.fn().mockResolvedValue({
      results: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Test Document',
          content: 'Test content',
          similarity: 0.82,
          metadata: { source: 'test' },
          chunkIndex: 0,
          elementType: 'text',
          pageNumber: 1,
          bbox: null,
        },
      ],
      totalResults: 1,
      queryEmbeddingTokens: 10,
      searchTimeMs: 100,
      cacheHit: false,
    }),
  },
});

// Document processing mocks
export const createDocumentProcessingMocks = () => ({
  documentProcessor: {
    uploadDocument: vi.fn().mockResolvedValue({
      id: 'test-doc-id',
      title: 'Test Document',
      status: 'processed',
    }),
    extractText: vi.fn().mockResolvedValue({
      text: 'Extracted text content',
      pageCount: 1,
    }),
    chunkDocument: vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        content: 'First chunk content',
        chunkIndex: 0,
      },
    ]),
  },
});

// Utility to apply mocks to modules
export const mockModule = (modulePath: string, mocks: Record<string, any>) => {
  vi.doMock(modulePath, () => mocks);
};

// Common mock combinations
export const createBasicTestMocks = () => ({
  ...createDatabaseMocks(),
  ...createAuthMocks(),
});

export const createRAGTestMocks = () => ({
  ...createBasicTestMocks(),
  ...createEmbeddingMocks(),
  ...createVectorSearchMocks(),
  ...createDocumentProcessingMocks(),
});
