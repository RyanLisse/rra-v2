/**
 * Enhanced Vector Search Service Tests
 * 
 * Tests for the enhanced search service with provider fallback capabilities.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnhancedVectorSearchService } from '@/lib/search/enhanced-search-service';
import type { VectorSearchProvider, SearchResponse, HybridSearchResponse } from '@/lib/search/types';

// Mock vector search factory
vi.mock('@/lib/search/providers/factory', () => ({
  vectorSearchFactory: {
    createProvider: vi.fn(),
  },
}));

describe('EnhancedVectorSearchService', () => {
  let service: EnhancedVectorSearchService;
  let mockPrimaryProvider: VectorSearchProvider;
  let mockFallbackProvider: VectorSearchProvider;

  const mockSuccessResponse: SearchResponse = {
    results: [
      {
        chunkId: 'chunk1',
        documentId: 'doc1',
        documentTitle: 'Test Document',
        content: 'Test content about RoboRail calibration',
        similarity: 0.85,
        metadata: {},
        chunkIndex: 0,
        elementType: 'paragraph',
        pageNumber: 1,
        bbox: null,
      },
    ],
    totalResults: 1,
    queryEmbeddingTokens: 50,
    searchTimeMs: 150,
    cacheHit: false,
  };

  const mockHybridResponse: HybridSearchResponse = {
    results: [
      {
        chunkId: 'chunk1',
        documentId: 'doc1',
        documentTitle: 'Test Document',
        content: 'Test content about RoboRail calibration',
        similarity: 0.85,
        metadata: {},
        chunkIndex: 0,
        elementType: 'paragraph',
        pageNumber: 1,
        bbox: null,
        textScore: 0.7,
        vectorScore: 0.85,
        hybridScore: 0.8,
      },
    ],
    totalResults: 1,
    queryEmbeddingTokens: 50,
    searchTimeMs: 150,
    cacheHit: false,
    algorithmUsed: 'adaptive',
  };

  beforeEach(() => {
    // Create mock providers
    mockPrimaryProvider = {
      vectorSearch: vi.fn(),
      hybridSearch: vi.fn(),
      contextAwareSearch: vi.fn(),
      multiStepSearch: vi.fn(),
      indexDocument: vi.fn(),
      updateDocumentIndex: vi.fn(),
      deleteDocumentIndex: vi.fn(),
      getSearchAnalytics: vi.fn(),
      clearCache: vi.fn(),
      getCacheStats: vi.fn(),
      getStatus: vi.fn(),
      validateConfiguration: vi.fn(),
    };

    mockFallbackProvider = {
      vectorSearch: vi.fn(),
      hybridSearch: vi.fn(),
      contextAwareSearch: vi.fn(),
      multiStepSearch: vi.fn(),
      indexDocument: vi.fn(),
      updateDocumentIndex: vi.fn(),
      deleteDocumentIndex: vi.fn(),
      getSearchAnalytics: vi.fn(),
      clearCache: vi.fn(),
      getCacheStats: vi.fn(),
      getStatus: vi.fn(),
      validateConfiguration: vi.fn(),
    };

    // Mock factory to return our mock providers
    const { vectorSearchFactory } = require('@/lib/search/providers/factory');
    vectorSearchFactory.createProvider
      .mockReturnValueOnce(mockPrimaryProvider)
      .mockReturnValueOnce(mockFallbackProvider);

    // Create service with both providers
    service = new EnhancedVectorSearchService({
      primary: {
        type: 'neondb',
        config: {
          type: 'neondb',
          connectionString: 'postgres://test',
          embeddingModel: 'embed-english-v3.0',
          dimensions: 1024,
        },
      },
      fallback: {
        type: 'openai',
        config: {
          type: 'openai',
          apiKey: 'sk-test',
          indexName: 'test-index',
          embeddingModel: 'text-embedding-3-large',
          dimensions: 3072,
        },
      },
      fallbackThreshold: 0.3,
      retryAttempts: 2,
      retryDelayMs: 100,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Vector Search with Fallback', () => {
    it('should use primary provider when it succeeds', async () => {
      (mockPrimaryProvider.vectorSearch as any).mockResolvedValue(mockSuccessResponse);

      const result = await service.vectorSearch(
        'calibration procedure',
        'user123',
        { limit: 5 }
      );

      expect(mockPrimaryProvider.vectorSearch).toHaveBeenCalledWith(
        'calibration procedure',
        'user123',
        { limit: 5 }
      );
      expect(mockFallbackProvider.vectorSearch).not.toHaveBeenCalled();
      expect(result).toEqual(mockSuccessResponse);
    });

    it('should fallback to secondary provider when primary fails', async () => {
      (mockPrimaryProvider.vectorSearch as any).mockRejectedValue(new Error('Primary failed'));
      (mockFallbackProvider.vectorSearch as any).mockResolvedValue(mockSuccessResponse);

      const result = await service.vectorSearch(
        'calibration procedure',
        'user123',
        { limit: 5 }
      );

      expect(mockPrimaryProvider.vectorSearch).toHaveBeenCalled();
      expect(mockFallbackProvider.vectorSearch).toHaveBeenCalledWith(
        'calibration procedure',
        'user123',
        { limit: 5 }
      );
      expect(result).toEqual(mockSuccessResponse);
    });

    it('should retry operations before falling back', async () => {
      (mockPrimaryProvider.vectorSearch as any)
        .mockRejectedValueOnce(new Error('Retry 1'))
        .mockRejectedValueOnce(new Error('Retry 2'))
        .mockResolvedValueOnce(mockSuccessResponse);

      const result = await service.vectorSearch(
        'calibration procedure',
        'user123'
      );

      expect(mockPrimaryProvider.vectorSearch).toHaveBeenCalledTimes(3);
      expect(mockFallbackProvider.vectorSearch).not.toHaveBeenCalled();
      expect(result).toEqual(mockSuccessResponse);
    });

    it('should throw error when both providers fail', async () => {
      (mockPrimaryProvider.vectorSearch as any).mockRejectedValue(new Error('Primary failed'));
      (mockFallbackProvider.vectorSearch as any).mockRejectedValue(new Error('Fallback failed'));

      await expect(
        service.vectorSearch('calibration procedure', 'user123')
      ).rejects.toThrow('Fallback failed');

      expect(mockPrimaryProvider.vectorSearch).toHaveBeenCalled();
      expect(mockFallbackProvider.vectorSearch).toHaveBeenCalled();
    });
  });

  describe('Hybrid Search with Fallback', () => {
    it('should use primary provider for hybrid search', async () => {
      (mockPrimaryProvider.hybridSearch as any).mockResolvedValue(mockHybridResponse);

      const result = await service.hybridSearch(
        'troubleshooting PMAC',
        'user123',
        { useRerank: true }
      );

      expect(mockPrimaryProvider.hybridSearch).toHaveBeenCalledWith(
        'troubleshooting PMAC',
        'user123',
        { useRerank: true }
      );
      expect(result).toEqual(mockHybridResponse);
    });

    it('should fallback for hybrid search', async () => {
      (mockPrimaryProvider.hybridSearch as any).mockRejectedValue(new Error('Primary failed'));
      (mockFallbackProvider.hybridSearch as any).mockResolvedValue(mockHybridResponse);

      const result = await service.hybridSearch(
        'troubleshooting PMAC',
        'user123',
        { useRerank: true }
      );

      expect(mockFallbackProvider.hybridSearch).toHaveBeenCalled();
      expect(result).toEqual(mockHybridResponse);
    });
  });

  describe('Context-Aware Search', () => {
    const conversationContext = [
      { role: 'user' as const, content: 'How do I start the system?' },
      { role: 'assistant' as const, content: 'Follow the startup procedure...' },
    ];

    it('should use primary provider for context-aware search', async () => {
      (mockPrimaryProvider.contextAwareSearch as any).mockResolvedValue(mockHybridResponse);

      const result = await service.contextAwareSearch(
        'calibration steps',
        'user123',
        conversationContext,
        { contextWeight: 0.3 }
      );

      expect(mockPrimaryProvider.contextAwareSearch).toHaveBeenCalledWith(
        'calibration steps',
        'user123',
        conversationContext,
        { contextWeight: 0.3 }
      );
      expect(result).toEqual(mockHybridResponse);
    });
  });

  describe('Document Indexing with Dual Provider Support', () => {
    const sampleChunks = [
      {
        id: 'chunk1',
        content: 'Test content',
        chunkIndex: 0,
        metadata: {},
        elementType: 'paragraph' as const,
        pageNumber: 1,
        bbox: null,
      },
    ];

    const indexResult = {
      success: true,
      documentId: 'doc123',
      chunksIndexed: 1,
      errorCount: 0,
      timeMs: 100,
    };

    it('should index on primary provider only by default', async () => {
      (mockPrimaryProvider.indexDocument as any).mockResolvedValue(indexResult);

      const result = await service.indexDocument(
        'doc123',
        sampleChunks,
        'user123'
      );

      expect(mockPrimaryProvider.indexDocument).toHaveBeenCalledWith(
        'doc123',
        sampleChunks,
        'user123'
      );
      expect(mockFallbackProvider.indexDocument).not.toHaveBeenCalled();
      expect(result).toEqual(indexResult);
    });

    it('should index on both providers when requested', async () => {
      (mockPrimaryProvider.indexDocument as any).mockResolvedValue(indexResult);
      (mockFallbackProvider.indexDocument as any).mockResolvedValue(indexResult);

      const result = await service.indexDocument(
        'doc123',
        sampleChunks,
        'user123',
        true // useBothProviders
      );

      expect(mockPrimaryProvider.indexDocument).toHaveBeenCalled();
      expect(mockFallbackProvider.indexDocument).toHaveBeenCalled();
      expect(result).toEqual(indexResult);
    });

    it('should fallback for indexing when primary fails', async () => {
      (mockPrimaryProvider.indexDocument as any).mockRejectedValue(new Error('Primary failed'));
      (mockFallbackProvider.indexDocument as any).mockResolvedValue(indexResult);

      const result = await service.indexDocument(
        'doc123',
        sampleChunks,
        'user123'
      );

      expect(mockFallbackProvider.indexDocument).toHaveBeenCalled();
      expect(result).toEqual(indexResult);
    });
  });

  describe('Document Deletion with Cleanup', () => {
    it('should delete from primary provider only by default', async () => {
      (mockPrimaryProvider.deleteDocumentIndex as any).mockResolvedValue(true);

      const result = await service.deleteDocumentIndex('doc123', 'user123', false);

      expect(mockPrimaryProvider.deleteDocumentIndex).toHaveBeenCalledWith('doc123', 'user123');
      expect(mockFallbackProvider.deleteDocumentIndex).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should delete from both providers when cleanup requested', async () => {
      (mockPrimaryProvider.deleteDocumentIndex as any).mockResolvedValue(true);
      (mockFallbackProvider.deleteDocumentIndex as any).mockResolvedValue(true);

      const result = await service.deleteDocumentIndex('doc123', 'user123', true);

      expect(mockPrimaryProvider.deleteDocumentIndex).toHaveBeenCalled();
      expect(mockFallbackProvider.deleteDocumentIndex).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return true if either provider succeeds in deletion', async () => {
      (mockPrimaryProvider.deleteDocumentIndex as any).mockResolvedValue(false);
      (mockFallbackProvider.deleteDocumentIndex as any).mockResolvedValue(true);

      const result = await service.deleteDocumentIndex('doc123', 'user123', true);

      expect(result).toBe(true);
    });
  });

  describe('Provider Status and Health', () => {
    const mockStatus = {
      isHealthy: true,
      lastSuccessfulQuery: new Date(),
      errorCount: 0,
      avgResponseTime: 150,
      cacheStatus: 'connected' as const,
      dbStatus: 'connected' as const,
    };

    it('should return comprehensive status', async () => {
      (mockPrimaryProvider.getStatus as any).mockResolvedValue(mockStatus);
      (mockFallbackProvider.getStatus as any).mockResolvedValue(mockStatus);

      const status = await service.getStatus();

      expect(status.primary).toEqual(mockStatus);
      expect(status.fallback).toEqual(mockStatus);
      expect(status.metrics).toBeDefined();
      expect(status.shouldUseFallback).toBe(false);
    });

    it('should handle fallback status failure gracefully', async () => {
      (mockPrimaryProvider.getStatus as any).mockResolvedValue(mockStatus);
      (mockFallbackProvider.getStatus as any).mockRejectedValue(new Error('Fallback status failed'));

      const status = await service.getStatus();

      expect(status.primary).toEqual(mockStatus);
      expect(status.fallback).toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    const mockValidation = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    it('should validate both provider configurations', async () => {
      (mockPrimaryProvider.validateConfiguration as any).mockResolvedValue(mockValidation);
      (mockFallbackProvider.validateConfiguration as any).mockResolvedValue(mockValidation);

      const validation = await service.validateConfiguration();

      expect(validation.primary).toEqual(mockValidation);
      expect(validation.fallback).toEqual(mockValidation);
      expect(validation.overall.isValid).toBe(true);
    });

    it('should handle fallback validation failure', async () => {
      const primaryValidation = { isValid: true, errors: [], warnings: [] };
      const fallbackValidation = { isValid: false, errors: ['Fallback error'], warnings: [] };

      (mockPrimaryProvider.validateConfiguration as any).mockResolvedValue(primaryValidation);
      (mockFallbackProvider.validateConfiguration as any).mockResolvedValue(fallbackValidation);

      const validation = await service.validateConfiguration();

      expect(validation.overall.isValid).toBe(true); // Primary is valid
      expect(validation.overall.errors).toContain('Fallback error');
    });
  });

  describe('Cache Management', () => {
    it('should clear cache on all providers', async () => {
      (mockPrimaryProvider.clearCache as any).mockResolvedValue(true);
      (mockFallbackProvider.clearCache as any).mockResolvedValue(true);

      const result = await service.clearCache('user123');

      expect(mockPrimaryProvider.clearCache).toHaveBeenCalledWith('user123');
      expect(mockFallbackProvider.clearCache).toHaveBeenCalledWith('user123');
      expect(result).toBe(true);
    });

    it('should return true if any provider clears cache successfully', async () => {
      (mockPrimaryProvider.clearCache as any).mockResolvedValue(false);
      (mockFallbackProvider.clearCache as any).mockResolvedValue(true);

      const result = await service.clearCache('user123');

      expect(result).toBe(true);
    });

    it('should get cache stats from all providers', async () => {
      const primaryStats = { totalKeys: 100, memoryUsage: '10MB', hitRate: 0.8 };
      const fallbackStats = { totalKeys: 50, memoryUsage: '5MB', hitRate: 0.7 };

      (mockPrimaryProvider.getCacheStats as any).mockResolvedValue(primaryStats);
      (mockFallbackProvider.getCacheStats as any).mockResolvedValue(fallbackStats);

      const stats = await service.getCacheStats();

      expect(stats.primary).toEqual(primaryStats);
      expect(stats.fallback).toEqual(fallbackStats);
    });
  });

  describe('Provider Switching', () => {
    it('should switch primary and fallback providers', async () => {
      const originalPrimary = mockPrimaryProvider;
      const originalFallback = mockFallbackProvider;

      await service.switchProviders();

      // Verify metrics are reset
      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.primarySuccess).toBe(0);
      expect(metrics.fallbackUsed).toBe(0);
    });

    it('should throw error when no fallback provider exists', async () => {
      // Create service without fallback
      const serviceWithoutFallback = new EnhancedVectorSearchService({
        primary: {
          type: 'neondb',
          config: {
            type: 'neondb',
            connectionString: 'postgres://test',
            embeddingModel: 'embed-english-v3.0',
            dimensions: 1024,
          },
        },
      });

      await expect(serviceWithoutFallback.switchProviders()).rejects.toThrow(
        'No fallback provider configured'
      );
    });
  });

  describe('Metrics and Analytics', () => {
    it('should track successful operations', async () => {
      (mockPrimaryProvider.vectorSearch as any).mockResolvedValue(mockSuccessResponse);

      await service.vectorSearch('test query', 'user123');

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.primarySuccess).toBe(1);
      expect(metrics.fallbackUsed).toBe(0);
      expect(metrics.failures).toBe(0);
    });

    it('should track fallback usage', async () => {
      (mockPrimaryProvider.vectorSearch as any).mockRejectedValue(new Error('Primary failed'));
      (mockFallbackProvider.vectorSearch as any).mockResolvedValue(mockSuccessResponse);

      await service.vectorSearch('test query', 'user123');

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.primarySuccess).toBe(0);
      expect(metrics.fallbackUsed).toBe(1);
      expect(metrics.failures).toBe(0);
    });

    it('should track failures', async () => {
      (mockPrimaryProvider.vectorSearch as any).mockRejectedValue(new Error('Primary failed'));
      (mockFallbackProvider.vectorSearch as any).mockRejectedValue(new Error('Fallback failed'));

      try {
        await service.vectorSearch('test query', 'user123');
      } catch (error) {
        // Expected to fail
      }

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.failures).toBe(1);
    });

    it('should reset metrics', () => {
      // First, generate some metrics
      service.resetMetrics();

      const metrics = service.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.primarySuccess).toBe(0);
      expect(metrics.fallbackUsed).toBe(0);
      expect(metrics.failures).toBe(0);
    });
  });

  describe('Error Threshold and Fallback Logic', () => {
    it('should use fallback when error rate exceeds threshold', async () => {
      // Generate enough requests to trigger threshold logic
      for (let i = 0; i < 10; i++) {
        (mockPrimaryProvider.vectorSearch as any).mockRejectedValueOnce(new Error('Primary failed'));
        (mockFallbackProvider.vectorSearch as any).mockResolvedValueOnce(mockSuccessResponse);

        try {
          await service.vectorSearch(`test query ${i}`, 'user123');
        } catch (error) {
          // Some may fail
        }
      }

      // Now the service should prefer fallback
      (mockFallbackProvider.vectorSearch as any).mockResolvedValue(mockSuccessResponse);

      await service.vectorSearch('test query after threshold', 'user123');

      // Verify fallback was used directly (not after primary failure)
      const metrics = service.getMetrics();
      expect(metrics.fallbackUsed).toBeGreaterThan(0);
    });
  });
});