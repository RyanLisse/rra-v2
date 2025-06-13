/**
 * OpenAI Vector Search Provider Tests
 * 
 * Comprehensive test suite for the OpenAI Vector Store provider implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  OpenAIProviderConfig,
  SearchCacheConfig,
  QueryExpansionConfig,
  SimilarityConfig,
  DocumentChunk,
} from '@/lib/search/types';

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  setEx: vi.fn(),
  del: vi.fn(),
  keys: vi.fn(),
  info: vi.fn(),
};

describe('OpenAIVectorSearchProvider', () => {
  let provider: any;
  let mockOpenAI: any;
  let config: OpenAIProviderConfig;
  let cacheConfig: SearchCacheConfig;
  let queryExpansionConfig: QueryExpansionConfig;
  let similarityConfig: SimilarityConfig;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock OpenAI SDK
    vi.doMock('openai', () => {
      return {
        default: vi.fn().mockImplementation(() => ({
          beta: {
            vectorStores: {
              list: vi.fn(),
              create: vi.fn(),
              retrieve: vi.fn(),
              files: {
                create: vi.fn(),
                list: vi.fn(),
                del: vi.fn(),
              },
            },
            assistants: {
              list: vi.fn(),
              create: vi.fn(),
              retrieve: vi.fn(),
            },
            threads: {
              create: vi.fn(),
              del: vi.fn(),
              messages: {
                create: vi.fn(),
                list: vi.fn(),
              },
              runs: {
                createAndPoll: vi.fn(),
              },
            },
          },
          files: {
            create: vi.fn(),
            retrieve: vi.fn(),
            del: vi.fn(),
          },
          models: {
            list: vi.fn(),
          },
        })),
      };
    });

    // Setup test configuration
    config = {
      type: 'openai',
      apiKey: 'sk-test-key',
      indexName: 'test-index',
      embeddingModel: 'text-embedding-3-large',
      dimensions: 3072,
    };

    cacheConfig = {
      enabled: true,
      ttlSeconds: 3600,
      keyPrefix: 'test_cache:',
    };

    queryExpansionConfig = {
      enabled: true,
      maxExpansions: 3,
      synonyms: { error: ['problem', 'issue'] },
      domainTerms: { calibration: ['setup', 'configuration'] },
    };

    similarityConfig = {
      algorithm: 'cosine',
      adaptiveThreshold: true,
      contextAwareScoring: true,
    };

    // Setup OpenAI mocks
    const { default: OpenAI } = await import('openai');
    mockOpenAI = new OpenAI();

    // Mock vector store operations
    mockOpenAI.beta.vectorStores.list.mockResolvedValue({
      data: [],
    });

    mockOpenAI.beta.vectorStores.create.mockResolvedValue({
      id: 'vs_test123',
      name: 'test-index',
    });

    mockOpenAI.beta.vectorStores.retrieve.mockResolvedValue({
      id: 'vs_test123',
      name: 'test-index',
    });

    // Mock assistant operations
    mockOpenAI.beta.assistants.list.mockResolvedValue({
      data: [],
    });

    mockOpenAI.beta.assistants.create.mockResolvedValue({
      id: 'asst_test456',
      name: 'test-index_search_assistant',
    });

    mockOpenAI.beta.assistants.retrieve.mockResolvedValue({
      id: 'asst_test456',
      name: 'test-index_search_assistant',
    });

    // Mock models list for connectivity test
    mockOpenAI.models.list.mockResolvedValue({
      data: [{ id: 'gpt-4o' }],
    });

    // Dynamically import the provider to get the latest mocked version
    const { OpenAIVectorSearchProvider } = await import('@/lib/search/providers/openai-provider');
    
    // Create provider instance
    provider = new OpenAIVectorSearchProvider(
      config,
      cacheConfig,
      queryExpansionConfig,
      similarityConfig,
      mockRedis as any
    );

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration and Initialization', () => {
    it('should validate configuration correctly', async () => {
      const validation = await provider.validateConfiguration();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.warnings).toHaveLength(0);
    });

    it('should handle missing API key', async () => {
      const { OpenAIVectorSearchProvider } = await import('@/lib/search/providers/openai-provider');
      const invalidConfig = { ...config, apiKey: '' };
      const invalidProvider = new OpenAIVectorSearchProvider(
        invalidConfig,
        cacheConfig,
        queryExpansionConfig,
        similarityConfig
      );

      const validation = await invalidProvider.validateConfiguration();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('OpenAI API key is required');
    });

    it('should warn about invalid API key format', async () => {
      const { OpenAIVectorSearchProvider } = await import('@/lib/search/providers/openai-provider');
      const invalidConfig = { ...config, apiKey: 'invalid-key' };
      const invalidProvider = new OpenAIVectorSearchProvider(
        invalidConfig,
        cacheConfig,
        queryExpansionConfig,
        similarityConfig
      );

      const validation = await invalidProvider.validateConfiguration();

      expect(validation.warnings).toContain('OpenAI API key should start with sk-');
    });
  });

  describe('Vector Store Management', () => {
    it('should create vector store if it does not exist', async () => {
      expect(mockOpenAI.beta.vectorStores.list).toHaveBeenCalled();
      expect(mockOpenAI.beta.vectorStores.create).toHaveBeenCalledWith({
        name: 'test-index',
        metadata: {
          purpose: 'document_search',
          created_by: 'roborail_rag_system',
          embedding_model: 'text-embedding-3-large',
        },
      });
    });

    it('should use existing vector store if found', async () => {
      // Mock existing vector store
      mockOpenAI.beta.vectorStores.list.mockResolvedValueOnce({
        data: [{ id: 'vs_existing', name: 'test-index' }],
      });

      const { OpenAIVectorSearchProvider } = await import('@/lib/search/providers/openai-provider');
      const newProvider = new OpenAIVectorSearchProvider(
        config,
        cacheConfig,
        queryExpansionConfig,
        similarityConfig
      );

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockOpenAI.beta.vectorStores.create).not.toHaveBeenCalled();
    });

    it('should create assistant with correct configuration', async () => {
      expect(mockOpenAI.beta.assistants.create).toHaveBeenCalledWith({
        name: 'test-index_search_assistant',
        instructions: expect.stringContaining('RoboRail documentation'),
        model: 'gpt-4o',
        tools: [{ type: 'file_search' }],
        tool_resources: {
          file_search: {
            vector_store_ids: ['vs_test123'],
          },
        },
        metadata: {
          purpose: 'document_search',
          vector_store_id: 'vs_test123',
          embedding_model: 'text-embedding-3-large',
        },
      });
    });
  });

  describe('Document Indexing', () => {
    const sampleChunks: DocumentChunk[] = [
      {
        id: 'chunk1',
        content: 'RoboRail calibration procedure step 1',
        chunkIndex: 0,
        metadata: { type: 'procedure' },
        elementType: 'paragraph',
        pageNumber: 1,
        bbox: null,
      },
      {
        id: 'chunk2',
        content: 'Connect the PMAC controller to the system',
        chunkIndex: 1,
        metadata: { type: 'instruction' },
        elementType: 'step',
        pageNumber: 2,
        bbox: null,
      },
    ];

    it('should index document successfully', async () => {
      // Mock file creation
      mockOpenAI.files.create.mockResolvedValue({
        id: 'file_test789',
        filename: 'document.txt',
      });

      // Mock vector store file addition
      mockOpenAI.beta.vectorStores.files.create.mockResolvedValue({
        id: 'file_test789',
        vector_store_id: 'vs_test123',
      });

      const result = await provider.indexDocument(
        'doc123',
        sampleChunks,
        'user456'
      );

      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc123');
      expect(result.chunksIndexed).toBe(2);
      expect(result.errorCount).toBe(0);

      expect(mockOpenAI.files.create).toHaveBeenCalledWith({
        file: expect.any(Blob),
        purpose: 'assistants',
      });

      expect(mockOpenAI.beta.vectorStores.files.create).toHaveBeenCalledWith(
        'vs_test123',
        { file_id: 'file_test789' }
      );
    });

    it('should handle indexing errors gracefully', async () => {
      // Mock file creation failure
      mockOpenAI.files.create.mockRejectedValue(new Error('File creation failed'));

      const result = await provider.indexDocument(
        'doc123',
        sampleChunks,
        'user456'
      );

      expect(result.success).toBe(false);
      expect(result.documentId).toBe('doc123');
      expect(result.chunksIndexed).toBe(0);
      expect(result.errorCount).toBe(1);
      expect(result.errors).toContain('File creation failed');
    });
  });

  describe('Vector Search', () => {
    const mockSearchResponse = {
      id: 'thread_test',
    };

    const mockMessages = {
      data: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: {
                value: 'Here are the calibration steps for RoboRail...',
                annotations: [
                  {
                    type: 'file_citation',
                    file_citation: {
                      file_id: 'file_test789',
                      quote: 'Calibration procedure step 1',
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    beforeEach(() => {
      // Mock thread operations
      mockOpenAI.beta.threads.create.mockResolvedValue(mockSearchResponse);
      mockOpenAI.beta.threads.del.mockResolvedValue({ deleted: true });
      mockOpenAI.beta.threads.messages.create.mockResolvedValue({});
      mockOpenAI.beta.threads.messages.list.mockResolvedValue(mockMessages);

      // Mock run completion
      mockOpenAI.beta.threads.runs.createAndPoll.mockResolvedValue({
        status: 'completed',
      });

      // Mock file retrieval
      mockOpenAI.files.retrieve.mockResolvedValue({
        id: 'file_test789',
        filename: 'roborail_manual.pdf',
      });

      // Mock cache miss
      mockRedis.get.mockResolvedValue(null);
    });

    it('should perform vector search successfully', async () => {
      const result = await provider.vectorSearch(
        'calibration procedure',
        'user456',
        { limit: 5 }
      );

      expect(result.results).toBeDefined();
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
      expect(result.queryEmbeddingTokens).toBeGreaterThan(0);
      expect(result.searchTimeMs).toBeGreaterThan(0);
      expect(result.cacheHit).toBe(false);

      // Verify thread operations
      expect(mockOpenAI.beta.threads.create).toHaveBeenCalled();
      expect(mockOpenAI.beta.threads.messages.create).toHaveBeenCalled();
      expect(mockOpenAI.beta.threads.runs.createAndPoll).toHaveBeenCalled();
      expect(mockOpenAI.beta.threads.del).toHaveBeenCalled();
    });

    it('should use cache when available', async () => {
      const cachedResult = {
        results: [
          {
            chunkId: 'cached_chunk',
            documentId: 'cached_doc',
            documentTitle: 'Cached Document',
            content: 'Cached content',
            similarity: 0.95,
            metadata: {},
            chunkIndex: 0,
          },
        ],
        totalResults: 1,
        queryEmbeddingTokens: 100,
        queryExpansions: [],
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await provider.vectorSearch(
        'calibration procedure',
        'user456',
        { useCache: true }
      );

      expect(result.cacheHit).toBe(true);
      expect(result.results).toEqual(cachedResult.results);
      expect(mockOpenAI.beta.threads.create).not.toHaveBeenCalled();
    });

    it('should handle search options correctly', async () => {
      await provider.vectorSearch(
        'calibration procedure',
        'user456',
        {
          limit: 10,
          threshold: 0.5,
          documentIds: ['doc1', 'doc2'],
          elementTypes: ['procedure', 'step'],
          pageNumbers: [1, 2, 3],
          expandQuery: true,
        }
      );

      const createMessageCall = mockOpenAI.beta.threads.messages.create.mock.calls[0];
      const messageContent = createMessageCall[1].content;

      expect(messageContent).toContain('calibration procedure');
      expect(messageContent).toContain('doc1, doc2');
      expect(messageContent).toContain('procedure, step');
      expect(messageContent).toContain('pages: 1, 2, 3');
      expect(messageContent).toContain('up to 10 relevant results');
    });

    it('should handle search failures gracefully', async () => {
      mockOpenAI.beta.threads.runs.createAndPoll.mockResolvedValue({
        status: 'failed',
      });

      await expect(
        provider.vectorSearch('test query', 'user456')
      ).rejects.toThrow('Search run failed with status: failed');
    });
  });

  describe('Hybrid Search', () => {
    it('should delegate to vector search', async () => {
      const vectorSearchSpy = vi.spyOn(provider, 'vectorSearch');
      vectorSearchSpy.mockResolvedValue({
        results: [
          {
            chunkId: 'chunk1',
            documentId: 'doc1',
            documentTitle: 'Test Doc',
            content: 'Test content',
            similarity: 0.8,
            metadata: {},
            chunkIndex: 0,
            elementType: 'paragraph',
            pageNumber: 1,
            bbox: null,
          },
        ],
        totalResults: 1,
        queryEmbeddingTokens: 50,
        searchTimeMs: 100,
        cacheHit: false,
      });

      const result = await provider.hybridSearch(
        'test query',
        'user456',
        { useRerank: true }
      );

      expect(vectorSearchSpy).toHaveBeenCalledWith(
        'test query',
        'user456',
        { useRerank: true }
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        chunkId: 'chunk1',
        textScore: expect.any(Number),
        vectorScore: 0.8,
        hybridScore: 0.8,
        rerankScore: expect.any(Number),
      });
      expect(result.algorithmUsed).toBe('adaptive');
    });
  });

  describe('Document Management', () => {
    it('should update document index by re-indexing', async () => {
      const deleteIndexSpy = vi.spyOn(provider, 'deleteDocumentIndex');
      const indexDocumentSpy = vi.spyOn(provider, 'indexDocument');

      deleteIndexSpy.mockResolvedValue(true);
      indexDocumentSpy.mockResolvedValue({
        success: true,
        documentId: 'doc123',
        chunksIndexed: 2,
        errorCount: 0,
        timeMs: 100,
      });

      const chunks: DocumentChunk[] = [
        {
          id: 'chunk1',
          content: 'Updated content',
          chunkIndex: 0,
          metadata: {},
          elementType: 'paragraph',
          pageNumber: 1,
          bbox: null,
        },
      ];

      const result = await provider.updateDocumentIndex(
        'doc123',
        chunks,
        'user456'
      );

      expect(deleteIndexSpy).toHaveBeenCalledWith('doc123', 'user456');
      expect(indexDocumentSpy).toHaveBeenCalledWith('doc123', chunks, 'user456');
      expect(result.success).toBe(true);
    });

    it('should delete document index', async () => {
      // Mock file listing
      mockOpenAI.beta.vectorStores.files.list.mockResolvedValue({
        data: [
          { id: 'file1', metadata: { document_id: 'doc123' } },
          { id: 'file2' },
        ],
      });

      // Mock file deletion
      mockOpenAI.beta.vectorStores.files.del.mockResolvedValue({ deleted: true });
      mockOpenAI.files.del.mockResolvedValue({ deleted: true });

      const result = await provider.deleteDocumentIndex('doc123', 'user456');

      expect(result).toBe(true);
      expect(mockOpenAI.beta.vectorStores.files.list).toHaveBeenCalled();
      expect(mockOpenAI.beta.vectorStores.files.del).toHaveBeenCalledWith(
        'vs_test123',
        'file1'
      );
      expect(mockOpenAI.files.del).toHaveBeenCalledWith('file1');
    });
  });

  describe('Provider Status', () => {
    it('should return healthy status when all components work', async () => {
      const status = await provider.getStatus();

      expect(status.isHealthy).toBe(true);
      expect(status.dbStatus).toBe('connected');
      expect(status.errorCount).toBe(0);
      expect(status.avgResponseTime).toBeGreaterThan(0);
    });

    it('should return unhealthy status on API failure', async () => {
      mockOpenAI.models.list.mockRejectedValue(new Error('API Error'));

      const status = await provider.getStatus();

      expect(status.isHealthy).toBe(false);
      expect(status.dbStatus).toBe('error');
      expect(status.errorCount).toBe(1);
    });
  });

  describe('Analytics and Caching', () => {
    it('should clear cache successfully', async () => {
      mockRedis.keys.mockResolvedValue(['test_cache:user456:key1']);
      mockRedis.del.mockResolvedValue(1);

      const result = await provider.clearCache('user456');

      expect(result).toBe(true);
      expect(mockRedis.keys).toHaveBeenCalledWith('test_cache:user456:*');
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should get cache statistics', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedis.info.mockResolvedValue('used_memory_human:10.5M\n');

      const stats = await provider.getCacheStats();

      expect(stats.totalKeys).toBe(3);
      expect(stats.memoryUsage).toBe('10.5M');
      expect(stats.hitRate).toBe(0); // Default value
    });

    it('should handle cache operations gracefully without Redis', async () => {
      const { OpenAIVectorSearchProvider } = await import('@/lib/search/providers/openai-provider');
      const providerWithoutRedis = new OpenAIVectorSearchProvider(
        config,
        cacheConfig,
        queryExpansionConfig,
        similarityConfig
      );

      const clearResult = await providerWithoutRedis.clearCache();
      const stats = await providerWithoutRedis.getCacheStats();

      expect(clearResult).toBe(false);
      expect(stats.totalKeys).toBe(0);
      expect(stats.memoryUsage).toBe('0B');
    });
  });
});