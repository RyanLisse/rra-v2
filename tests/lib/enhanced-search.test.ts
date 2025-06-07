import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { vectorSearchService } from '@/lib/search/vector-search';
import { ragDocument, documentChunk, documentEmbedding, user } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('Enhanced Search with ADE Metadata', () => {
  let testUserId: string;
  let testDocumentId: string;
  let testChunkIds: string[] = [];

  beforeAll(async () => {
    // Create test user
    const [testUser] = await db
      .insert(user)
      .values({
        email: 'test-enhanced-search@example.com',
        name: 'Test Enhanced Search User',
        type: 'regular',
      })
      .returning();

    testUserId = testUser.id;

    // Create test document
    const [document] = await db
      .insert(ragDocument)
      .values({
        fileName: 'test-enhanced-doc.pdf',
        originalName: 'Enhanced Test Document.pdf',
        filePath: '/test/enhanced-doc.pdf',
        mimeType: 'application/pdf',
        fileSize: '1024',
        status: 'embedded',
        uploadedBy: testUserId,
      })
      .returning();

    testDocumentId = document.id;

    // Create test chunks with ADE metadata
    const chunks = await db
      .insert(documentChunk)
      .values([
        {
          documentId: testDocumentId,
          chunkIndex: '0',
          content: 'This is a title section about robotics calibration',
          elementType: 'title',
          pageNumber: 1,
          bbox: [100, 200, 300, 220], // [x1, y1, x2, y2]
          tokenCount: '10',
        },
        {
          documentId: testDocumentId,
          chunkIndex: '1',
          content: 'This paragraph explains the calibration process for RoboRail systems',
          elementType: 'paragraph',
          pageNumber: 1,
          bbox: [100, 250, 400, 300],
          tokenCount: '15',
        },
        {
          documentId: testDocumentId,
          chunkIndex: '2',
          content: 'Table showing calibration values: X=10, Y=20, Z=30',
          elementType: 'table_text',
          pageNumber: 2,
          bbox: [150, 300, 450, 400],
          tokenCount: '12',
        },
        {
          documentId: testDocumentId,
          chunkIndex: '3',
          content: 'Another paragraph on page 2 discussing troubleshooting',
          elementType: 'paragraph',
          pageNumber: 2,
          bbox: [100, 450, 400, 500],
          tokenCount: '11',
        },
      ])
      .returning();

    testChunkIds = chunks.map(chunk => chunk.id);

    // Create mock embeddings for each chunk
    const embeddings = testChunkIds.map(chunkId => ({
      chunkId,
      embedding: JSON.stringify(Array.from({ length: 1024 }, () => Math.random())),
      model: 'test-embed-model',
    }));

    await db.insert(documentEmbedding).values(embeddings);
  });

  afterAll(async () => {
    // Clean up test data in reverse order
    if (testChunkIds.length > 0) {
      for (const chunkId of testChunkIds) {
        await db.delete(documentEmbedding).where(eq(documentEmbedding.chunkId, chunkId));
      }
    }
    if (testDocumentId) {
      await db.delete(documentChunk).where(eq(documentChunk.documentId, testDocumentId));
      await db.delete(ragDocument).where(eq(ragDocument.id, testDocumentId));
    }
    if (testUserId) {
      await db.delete(user).where(eq(user.id, testUserId));
    }
  });

  it('should filter search results by element type', async () => {
    const results = await vectorSearchService.vectorSearch(
      'calibration',
      testUserId,
      {
        limit: 10,
        threshold: 0.0, // Low threshold to get all results
        elementTypes: ['title'], // Only title elements
      }
    );

    expect(results.results).toHaveLength(1);
    expect(results.results[0].elementType).toBe('title');
    expect(results.results[0].content).toContain('title section');
  });

  it('should filter search results by page number', async () => {
    const results = await vectorSearchService.vectorSearch(
      'calibration',
      testUserId,
      {
        limit: 10,
        threshold: 0.0, // Low threshold to get all results
        pageNumbers: [2], // Only page 2
      }
    );

    expect(results.results).toHaveLength(2);
    results.results.forEach(result => {
      expect(result.pageNumber).toBe(2);
    });
  });

  it('should filter by both element type and page number', async () => {
    const results = await vectorSearchService.vectorSearch(
      'calibration',
      testUserId,
      {
        limit: 10,
        threshold: 0.0,
        elementTypes: ['paragraph'],
        pageNumbers: [2],
      }
    );

    expect(results.results).toHaveLength(1);
    expect(results.results[0].elementType).toBe('paragraph');
    expect(results.results[0].pageNumber).toBe(2);
    expect(results.results[0].content).toContain('troubleshooting');
  });

  it('should include ADE metadata in search results', async () => {
    const results = await vectorSearchService.vectorSearch(
      'calibration',
      testUserId,
      {
        limit: 10,
        threshold: 0.0,
      }
    );

    expect(results.results.length).toBeGreaterThan(0);
    
    const firstResult = results.results[0];
    expect(firstResult).toHaveProperty('elementType');
    expect(firstResult).toHaveProperty('pageNumber');
    expect(firstResult).toHaveProperty('bbox');
    
    // Verify bbox is an array with coordinates
    expect(Array.isArray(firstResult.bbox)).toBe(true);
    expect(firstResult.bbox).toHaveLength(4);
  });

  it('should work with hybrid search filtering', async () => {
    const results = await vectorSearchService.hybridSearch(
      'calibration process',
      testUserId,
      {
        limit: 10,
        threshold: 0.0,
        elementTypes: ['paragraph'],
      }
    );

    expect(results.results.length).toBeGreaterThan(0);
    results.results.forEach(result => {
      expect(result.elementType).toBe('paragraph');
    });
  });

  it('should handle spatial search within API facets', async () => {
    // This would be tested via the API endpoint with spatialSearch facets
    const facets = {
      spatialSearch: {
        pageNumber: 1,
        bbox: [90, 190, 410, 310], // Overlaps with title and first paragraph
      }
    };

    // Simulate the spatial filtering logic from applyResultFacets
    const allResults = await vectorSearchService.vectorSearch(
      'calibration',
      testUserId,
      {
        limit: 10,
        threshold: 0.0,
        pageNumbers: [facets.spatialSearch.pageNumber],
      }
    );

    const spatiallyFilteredResults = allResults.results.filter(result => {
      if (result.pageNumber !== facets.spatialSearch.pageNumber) {
        return false;
      }

      if (facets.spatialSearch.bbox && result.bbox) {
        const [searchX1, searchY1, searchX2, searchY2] = facets.spatialSearch.bbox;
        const [resultX1, resultY1, resultX2, resultY2] = result.bbox;

        // Check if bounding boxes intersect
        const intersects = !(
          searchX2 < resultX1 ||
          searchX1 > resultX2 ||
          searchY2 < resultY1 ||
          searchY1 > resultY2
        );

        return intersects;
      }

      return true;
    });

    expect(spatiallyFilteredResults.length).toBe(2); // Title and first paragraph should intersect
  });

  it('should return empty results for non-existent element types', async () => {
    const results = await vectorSearchService.vectorSearch(
      'calibration',
      testUserId,
      {
        limit: 10,
        threshold: 0.0,
        elementTypes: ['header'], // Non-existent element type
      }
    );

    expect(results.results).toHaveLength(0);
  });

  it('should handle empty filtering arrays gracefully', async () => {
    const results = await vectorSearchService.vectorSearch(
      'calibration',
      testUserId,
      {
        limit: 10,
        threshold: 0.0,
        elementTypes: [], // Empty array should not filter
        pageNumbers: [], // Empty array should not filter
      }
    );

    expect(results.results.length).toBeGreaterThan(0);
  });
});