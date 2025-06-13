import { createDefaultVectorSearchProvider, } from './providers/factory';
import type { VectorSearchProvider } from './types';

// Re-export types from the types module
export type {
  SearchResult,
  SearchResponse,
  HybridSearchResult,
  HybridSearchResponse,
  VectorSearchOptions,
  HybridSearchOptions,
  QueryExpansionConfig,
  SearchCacheConfig,
  SimilarityConfig,
} from './types';

/**
 * VectorSearchService - Facade class for vector search operations
 * 
 * This class provides a simplified interface for vector search operations
 * while using the provider pattern underneath for flexibility.
 */
export class VectorSearchService {
  private provider: VectorSearchProvider;

  constructor(provider?: VectorSearchProvider) {
    // Use provided provider or create default
    this.provider = provider || createDefaultVectorSearchProvider();
  }
  /**
   * Change the underlying provider
   */
  setProvider(provider: VectorSearchProvider): void {
    this.provider = provider;
  }

  /**
   * Get the current provider
   */
  getProvider(): VectorSearchProvider {
    return this.provider;
  }

  /**
   * Perform vector similarity search with enhanced features
   */
  async vectorSearch(
    query: string,
    userId: string,
    options: {
      limit?: number;
      threshold?: number;
      documentIds?: string[];
      useCache?: boolean;
      expandQuery?: boolean;
      elementTypes?: string[];
      pageNumbers?: number[];
    } = {},
  ) {
    return this.provider.vectorSearch(query, userId, options);
  }

  /**
   * Perform enhanced hybrid search (vector + full-text)
   */
  async hybridSearch(
    query: string,
    userId: string,
    options: {
      limit?: number;
      vectorWeight?: number;
      textWeight?: number;
      threshold?: number;
      documentIds?: string[];
      useRerank?: boolean;
      rerankTopK?: number;
      scoringAlgorithm?: 'weighted' | 'rrf' | 'adaptive';
      useCache?: boolean;
      expandQuery?: boolean;
      elementTypes?: string[];
      pageNumbers?: number[];
    } = {},
  ) {
    return this.provider.hybridSearch(query, userId, options);
  }


  /**
   * Context-aware search with conversation history
   */
  async contextAwareSearch(
    query: string,
    userId: string,
    conversationContext: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: {
      limit?: number;
      threshold?: number;
      documentIds?: string[];
      contextWeight?: number;
      elementTypes?: string[];
      pageNumbers?: number[];
    } = {},
  ) {
    return this.provider.contextAwareSearch(query, userId, conversationContext, options);
  }

  /**
   * Multi-step search with query refinement
   */
  async multiStepSearch(
    query: string,
    userId: string,
    options: {
      maxSteps?: number;
      minResultsPerStep?: number;
      documentIds?: string[];
      elementTypes?: string[];
      pageNumbers?: number[];
    } = {},
  ) {
    return this.provider.multiStepSearch(query, userId, options);
  }

  /**
   * Search analytics and performance metrics
   */
  async getSearchAnalytics(
    userId: string,
    timeRange: 'day' | 'week' | 'month' = 'day',
  ) {
    return this.provider.getSearchAnalytics(userId, timeRange);
  }

  /**
   * Clear search cache for a user or globally
   */
  async clearCache(userId?: string): Promise<boolean> {
    return this.provider.clearCache(userId);
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return this.provider.getCacheStats();
  }

  /**
   * Get provider status
   */
  async getStatus() {
    return this.provider.getStatus();
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration() {
    return this.provider.validateConfiguration();
  }

  /**
   * Index a document with its chunks
   */
  async indexDocument(
    documentId: string,
    chunks: Array<{
      id: string;
      content: string;
      chunkIndex: number;
      metadata?: any;
      elementType?: string | null;
      pageNumber?: number | null;
      bbox?: any;
    }>,
    userId: string,
  ) {
    return this.provider.indexDocument(documentId, chunks, userId);
  }

  /**
   * Update document index
   */
  async updateDocumentIndex(
    documentId: string,
    chunks: Array<{
      id: string;
      content: string;
      chunkIndex: number;
      metadata?: any;
      elementType?: string | null;
      pageNumber?: number | null;
      bbox?: any;
    }>,
    userId: string,
  ) {
    return this.provider.updateDocumentIndex(documentId, chunks, userId);
  }

  /**
   * Delete document index
   */
  async deleteDocumentIndex(documentId: string, userId: string): Promise<boolean> {
    return this.provider.deleteDocumentIndex(documentId, userId);
  }
}

// Singleton instance
export const vectorSearchService = new VectorSearchService();

// Simplified VectorSearch class for testing - delegates to provider
export class VectorSearch {
  private provider: VectorSearchProvider;

  constructor(cohereClient?: any) {
    // Use default provider for backward compatibility
    this.provider = createDefaultVectorSearchProvider();
  }

  async search(params: {
    query: string;
    userId: string;
    limit?: number;
    threshold?: number;
    includeMetadata?: boolean;
    db?: any; // Kept for backward compatibility, not used
  }) {
    const { query, userId, limit = 10, threshold = 0.3 } = params;

    // Use the provider for actual search
    const searchResult = await this.provider.vectorSearch(query, userId, {
      limit,
      threshold,
    });

    // Transform to match legacy interface
    const results = searchResult.results.map((result, index) => ({
      id: result.chunkId,
      content: result.content,
      score: result.similarity,
      document: {
        id: result.documentId,
        title: result.documentTitle,
        fileName: result.documentTitle,
      },
      chunkIndex: result.chunkIndex,
      elementType: result.elementType,
      pageNumber: result.pageNumber,
      bbox: result.bbox,
    }));

    return {
      results,
      totalFound: results.length,
      query,
    };
  }

  async searchWithReranking(params: {
    query: string;
    userId: string;
    limit?: number;
    rerankTopK?: number;
    db?: any; // Kept for backward compatibility, not used
  }) {
    const { query, userId, limit = 10, rerankTopK = 5 } = params;

    // Use the provider's hybrid search with reranking
    const searchResult = await this.provider.hybridSearch(query, userId, {
      limit,
      useRerank: true,
      rerankTopK,
    });

    // Transform to match legacy interface
    const results = searchResult.results.map((result) => ({
      id: result.chunkId,
      content: result.content,
      score: result.similarity,
      rerankScore: result.rerankScore || result.hybridScore,
      document: {
        id: result.documentId,
        title: result.documentTitle,
        fileName: result.documentTitle,
      },
      chunkIndex: result.chunkIndex,
      elementType: result.elementType,
      pageNumber: result.pageNumber,
      bbox: result.bbox,
    }));

    return {
      results,
      totalFound: results.length,
      query,
    };
  }
}
