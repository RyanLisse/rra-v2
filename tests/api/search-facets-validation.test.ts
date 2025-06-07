import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test the validation schema from the search API
const searchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  searchType: z
    .enum(['vector', 'hybrid', 'context-aware', 'multi-step'])
    .default('hybrid'),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.3),
  documentIds: z.array(z.string().uuid()).optional(),
  useRerank: z.boolean().default(true),
  vectorWeight: z.number().min(0).max(1).default(0.7),
  textWeight: z.number().min(0).max(1).default(0.3),
  // Enhanced ADE faceted search options
  facets: z
    .object({
      documentTypes: z.array(z.string()).optional(),
      dateRange: z
        .object({
          start: z.string().datetime().optional(),
          end: z.string().datetime().optional(),
        })
        .optional(),
      sources: z.array(z.string()).optional(),
      minChunkLength: z.number().min(0).optional(),
      maxChunkLength: z.number().min(1).optional(),
      // Enhanced ADE structural metadata filters
      elementTypes: z.array(z.string()).optional(), // e.g., ['paragraph', 'title', 'table_text']
      pageNumbers: z.array(z.number()).optional(), // filter by specific page numbers
      spatialSearch: z
        .object({
          pageNumber: z.number(),
          bbox: z.array(z.number()).length(4).optional(), // [x1, y1, x2, y2] bounding box
        })
        .optional(),
    })
    .optional(),
  trackSearch: z.boolean().default(true),
  includeAnalytics: z.boolean().default(false),
  embeddingModel: z.enum(['v3.0', 'v4.0']).optional(),
  scoringAlgorithm: z.enum(['weighted', 'rrf', 'adaptive']).optional(),
});

describe('Search Facets Validation', () => {
  it('should validate valid search request with ADE facets', () => {
    const validRequest = {
      query: 'calibration process',
      searchType: 'hybrid' as const,
      facets: {
        elementTypes: ['paragraph', 'title'],
        pageNumbers: [1, 2, 3],
        spatialSearch: {
          pageNumber: 1,
          bbox: [100, 200, 300, 400],
        },
      },
    };

    const result = searchSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    
    if (result.success) {
      expect(result.data.facets?.elementTypes).toEqual(['paragraph', 'title']);
      expect(result.data.facets?.pageNumbers).toEqual([1, 2, 3]);
      expect(result.data.facets?.spatialSearch?.pageNumber).toBe(1);
      expect(result.data.facets?.spatialSearch?.bbox).toEqual([100, 200, 300, 400]);
    }
  });

  it('should validate search request without ADE facets', () => {
    const basicRequest = {
      query: 'calibration',
      facets: {
        documentTypes: ['pdf'],
        minChunkLength: 50,
      },
    };

    const result = searchSchema.safeParse(basicRequest);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.facets?.documentTypes).toEqual(['pdf']);
      expect(result.data.facets?.minChunkLength).toBe(50);
      expect(result.data.facets?.elementTypes).toBeUndefined();
      expect(result.data.facets?.pageNumbers).toBeUndefined();
    }
  });

  it('should reject invalid spatial search bbox', () => {
    const invalidRequest = {
      query: 'calibration',
      facets: {
        spatialSearch: {
          pageNumber: 1,
          bbox: [100, 200, 300], // Invalid - should have 4 coordinates
        },
      },
    };

    const result = searchSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
    
    if (!result.success) {
      const bboxError = result.error.issues.find(
        issue => issue.path.includes('bbox')
      );
      expect(bboxError).toBeDefined();
    }
  });

  it('should reject invalid element types (non-string array)', () => {
    const invalidRequest = {
      query: 'calibration',
      facets: {
        elementTypes: [123, 456], // Should be strings
      },
    };

    const result = searchSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid page numbers (non-number array)', () => {
    const invalidRequest = {
      query: 'calibration',
      facets: {
        pageNumbers: ['1', '2'], // Should be numbers
      },
    };

    const result = searchSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should allow empty facet arrays', () => {
    const requestWithEmptyArrays = {
      query: 'calibration',
      facets: {
        elementTypes: [],
        pageNumbers: [],
      },
    };

    const result = searchSchema.safeParse(requestWithEmptyArrays);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.facets?.elementTypes).toEqual([]);
      expect(result.data.facets?.pageNumbers).toEqual([]);
    }
  });

  it('should validate complex facet combinations', () => {
    const complexRequest = {
      query: 'roborail calibration troubleshooting',
      searchType: 'multi-step' as const,
      limit: 20,
      threshold: 0.4,
      useRerank: true,
      facets: {
        documentTypes: ['pdf', 'docx'],
        elementTypes: ['paragraph', 'title', 'table_text'],
        pageNumbers: [1, 2, 3, 4, 5],
        minChunkLength: 100,
        maxChunkLength: 2000,
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-12-31T23:59:59Z',
        },
      },
    };

    const result = searchSchema.safeParse(complexRequest);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.searchType).toBe('multi-step');
      expect(result.data.limit).toBe(20);
      expect(result.data.facets?.elementTypes).toContain('paragraph');
      expect(result.data.facets?.elementTypes).toContain('table_text');
      expect(result.data.facets?.pageNumbers).toHaveLength(5);
    }
  });

  it('should handle spatial search without bbox', () => {
    const spatialWithoutBbox = {
      query: 'calibration',
      facets: {
        spatialSearch: {
          pageNumber: 2,
          // No bbox - should match all elements on the page
        },
      },
    };

    const result = searchSchema.safeParse(spatialWithoutBbox);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.facets?.spatialSearch?.pageNumber).toBe(2);
      expect(result.data.facets?.spatialSearch?.bbox).toBeUndefined();
    }
  });

  it('should validate common element types', () => {
    const commonElementTypes = [
      'paragraph',
      'title',
      'figure_caption',
      'table_text',
      'list_item',
      'header',
      'footer',
    ];

    const request = {
      query: 'test',
      facets: {
        elementTypes: commonElementTypes,
      },
    };

    const result = searchSchema.safeParse(request);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.facets?.elementTypes).toEqual(commonElementTypes);
    }
  });
});

describe('Facet Filtering Logic', () => {
  it('should test element type filtering logic', () => {
    const mockResults = [
      { elementType: 'paragraph', content: 'Test paragraph' },
      { elementType: 'title', content: 'Test title' },
      { elementType: 'table_text', content: 'Test table' },
      { elementType: null, content: 'No element type' },
    ];

    const targetElementTypes = ['paragraph', 'title'];
    
    const filteredResults = mockResults.filter((result) => {
      return result.elementType && targetElementTypes.includes(result.elementType);
    });

    expect(filteredResults).toHaveLength(2);
    expect(filteredResults.map(r => r.elementType)).toEqual(['paragraph', 'title']);
  });

  it('should test page number filtering logic', () => {
    const mockResults = [
      { pageNumber: 1, content: 'Page 1 content' },
      { pageNumber: 2, content: 'Page 2 content' },
      { pageNumber: 3, content: 'Page 3 content' },
      { pageNumber: null, content: 'No page number' },
    ];

    const targetPageNumbers = [1, 3];
    
    const filteredResults = mockResults.filter((result) => {
      return result.pageNumber && targetPageNumbers.includes(result.pageNumber);
    });

    expect(filteredResults).toHaveLength(2);
    expect(filteredResults.map(r => r.pageNumber)).toEqual([1, 3]);
  });
});