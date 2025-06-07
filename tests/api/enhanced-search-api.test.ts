import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/search/route';
import { NextRequest } from 'next/server';

// Mock the authentication and database
vi.mock('@/lib/auth', () => ({
  withAuth: (handler: any) => async (req: any) => {
    // Mock authenticated user
    const mockSession = {
      user: { id: 'test-user-search-api' },
    };
    return handler(req, mockSession);
  },
}));

vi.mock('@/lib/search/vector-search', () => ({
  vectorSearchService: {
    vectorSearch: vi.fn().mockResolvedValue({
      results: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Test Document',
          content: 'This is a test paragraph about calibration',
          similarity: 0.8,
          metadata: {},
          chunkIndex: 0,
          elementType: 'paragraph',
          pageNumber: 1,
          bbox: [100, 200, 300, 250],
        },
        {
          chunkId: 'chunk-2',
          documentId: 'doc-1',
          documentTitle: 'Test Document',
          content: 'Test table with calibration values',
          similarity: 0.7,
          metadata: {},
          chunkIndex: 1,
          elementType: 'table_text',
          pageNumber: 1,
          bbox: [100, 300, 400, 350],
        },
      ],
      totalResults: 2,
      queryEmbeddingTokens: 5,
      searchTimeMs: 150,
    }),
    hybridSearch: vi.fn().mockResolvedValue({
      results: [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          documentTitle: 'Test Document',
          content: 'This is a test paragraph about calibration',
          similarity: 0.8,
          metadata: {},
          chunkIndex: 0,
          elementType: 'paragraph',
          pageNumber: 1,
          bbox: [100, 200, 300, 250],
          vectorScore: 0.8,
          textScore: 0.7,
          hybridScore: 0.75,
        },
      ],
      totalResults: 1,
      queryEmbeddingTokens: 5,
      searchTimeMs: 200,
      algorithmUsed: 'adaptive',
    }),
    contextAwareSearch: vi.fn(),
    multiStepSearch: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  ragDocument: {
    uploadedBy: 'uploadedBy',
    originalName: 'originalName',
    createdAt: 'createdAt',
    id: 'id',
  },
  documentChunk: {
    elementType: 'elementType',
    pageNumber: 'pageNumber',
    documentId: 'documentId',
  },
}));

describe('Enhanced Search API', () => {
  it('should accept element type filters in facets', async () => {
    const searchRequest = {
      query: 'calibration',
      searchType: 'vector',
      facets: {
        elementTypes: ['paragraph', 'title'],
      },
    };

    const request = new NextRequest('http://localhost:3000/api/search', {
      method: 'POST',
      body: JSON.stringify(searchRequest),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeDefined();
    expect(data.facets.applied.elementTypes).toEqual(['paragraph', 'title']);
  });

  it('should accept page number filters in facets', async () => {
    const searchRequest = {
      query: 'calibration',
      searchType: 'vector',
      facets: {
        pageNumbers: [1, 2],
      },
    };

    const request = new NextRequest('http://localhost:3000/api/search', {
      method: 'POST',
      body: JSON.stringify(searchRequest),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeDefined();
    expect(data.facets.applied.pageNumbers).toEqual([1, 2]);
  });

  it('should accept spatial search facets', async () => {
    const searchRequest = {
      query: 'calibration',
      searchType: 'hybrid',
      facets: {
        spatialSearch: {
          pageNumber: 1,
          bbox: [100, 200, 400, 350],
        },
      },
    };

    const request = new NextRequest('http://localhost:3000/api/search', {
      method: 'POST',
      body: JSON.stringify(searchRequest),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeDefined();
    expect(data.facets.applied.spatialSearch).toEqual({
      pageNumber: 1,
      bbox: [100, 200, 400, 350],
    });
  });

  it('should include ADE metadata in search response', async () => {
    const searchRequest = {
      query: 'calibration',
      searchType: 'vector',
    };

    const request = new NextRequest('http://localhost:3000/api/search', {
      method: 'POST',
      body: JSON.stringify(searchRequest),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeDefined();

    if (data.results.length > 0) {
      const firstResult = data.results[0];
      expect(firstResult).toHaveProperty('elementType');
      expect(firstResult).toHaveProperty('pageNumber');
      expect(firstResult).toHaveProperty('bbox');
    }
  });

  it('should validate facet parameters correctly', async () => {
    const invalidRequest = {
      query: 'calibration',
      searchType: 'vector',
      facets: {
        spatialSearch: {
          pageNumber: 1,
          bbox: [100, 200, 400], // Invalid bbox - should have 4 coordinates
        },
      },
    };

    const request = new NextRequest('http://localhost:3000/api/search', {
      method: 'POST',
      body: JSON.stringify(invalidRequest),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid search parameters');
  });

  it('should combine traditional and ADE facets', async () => {
    const searchRequest = {
      query: 'calibration',
      searchType: 'hybrid',
      facets: {
        documentTypes: ['pdf'],
        elementTypes: ['paragraph'],
        pageNumbers: [1],
        minChunkLength: 10,
      },
    };

    const request = new NextRequest('http://localhost:3000/api/search', {
      method: 'POST',
      body: JSON.stringify(searchRequest),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.results).toBeDefined();
    expect(data.facets.applied).toEqual({
      documentTypes: ['pdf'],
      elementTypes: ['paragraph'],
      pageNumbers: [1],
      minChunkLength: 10,
    });
  });
});
