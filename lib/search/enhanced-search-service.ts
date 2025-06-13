/**
 * Enhanced Vector Search Service with Provider Fallbacks
 * 
 * Provides a robust search service that can fallback between multiple
 * vector search providers for high availability and reliability.
 */

import { vectorSearchFactory } from './providers/factory';
import type {
  VectorSearchProvider,
  SearchResponse,
  HybridSearchResponse,
  VectorSearchOptions,
  HybridSearchOptions,
  DocumentChunk,
  IndexingResult,
  SearchStatus,
  ConfigValidationResult,
} from './types';

export interface ProviderConfig {
  primary: {
    type: 'neondb' | 'openai';
    config: any;
  };
  fallback?: {
    type: 'neondb' | 'openai';
    config: any;
  };
  fallbackThreshold?: number; // Error rate threshold to trigger fallback
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface SearchMetrics {
  totalRequests: number;
  primarySuccess: number;
  fallbackUsed: number;
  failures: number;
  avgResponseTime: number;
  lastError?: string;
}

export class EnhancedVectorSearchService {
  private primaryProvider: VectorSearchProvider;
  private fallbackProvider?: VectorSearchProvider;
  private config: Required<ProviderConfig>;
  private metrics: SearchMetrics;
  private errorHistory: Array<{ timestamp: Date; error: string }> = [];

  constructor(config: ProviderConfig) {
    this.config = {
      primary: config.primary,
      fallback: config.fallback,
      fallbackThreshold: config.fallbackThreshold || 0.3, // 30% error rate
      retryAttempts: config.retryAttempts || 3,
      retryDelayMs: config.retryDelayMs || 1000,
    };

    this.metrics = {
      totalRequests: 0,
      primarySuccess: 0,
      fallbackUsed: 0,
      failures: 0,
      avgResponseTime: 0,
    };

    this.initializeProviders();
  }

  /**
   * Enhanced vector search with automatic fallback
   */
  async vectorSearch(
    query: string,
    userId: string,
    options: VectorSearchOptions = {}
  ): Promise<SearchResponse> {
    return this.executeWithFallback(
      'vectorSearch',
      async (provider) => provider.vectorSearch(query, userId, options)
    );
  }

  /**
   * Enhanced hybrid search with automatic fallback
   */
  async hybridSearch(
    query: string,
    userId: string,
    options: HybridSearchOptions = {}
  ): Promise<HybridSearchResponse> {
    return this.executeWithFallback(
      'hybridSearch',
      async (provider) => provider.hybridSearch(query, userId, options)
    );
  }

  /**
   * Context-aware search with fallback
   */
  async contextAwareSearch(
    query: string,
    userId: string,
    conversationContext: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: VectorSearchOptions & { contextWeight?: number } = {}
  ): Promise<HybridSearchResponse> {
    return this.executeWithFallback(
      'contextAwareSearch',
      async (provider) => provider.contextAwareSearch(query, userId, conversationContext, options)
    );
  }

  /**
   * Multi-step search with fallback
   */
  async multiStepSearch(
    query: string,
    userId: string,
    options: VectorSearchOptions & {
      maxSteps?: number;
      minResultsPerStep?: number;
    } = {}
  ): Promise<HybridSearchResponse> {
    return this.executeWithFallback(
      'multiStepSearch',
      async (provider) => provider.multiStepSearch(query, userId, options)
    );
  }

  /**
   * Index document with fallback to secondary provider
   */
  async indexDocument(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string,
    useBothProviders = false
  ): Promise<IndexingResult> {
    const startTime = Date.now();

    try {
      // Index on primary provider
      const primaryResult = await this.primaryProvider.indexDocument(documentId, chunks, userId);

      // If requested, also index on fallback provider
      if (useBothProviders && this.fallbackProvider && primaryResult.success) {
        try {
          await this.fallbackProvider.indexDocument(documentId, chunks, userId);
        } catch (error) {
          console.warn('Fallback indexing failed:', error);
        }
      }

      this.updateMetrics('indexDocument', true, Date.now() - startTime);
      return primaryResult;
    } catch (error) {
      this.updateMetrics('indexDocument', false, Date.now() - startTime);
      this.recordError(`Index document failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Try fallback provider
      if (this.fallbackProvider) {
        try {
          const fallbackResult = await this.fallbackProvider.indexDocument(documentId, chunks, userId);
          this.metrics.fallbackUsed++;
          return fallbackResult;
        } catch (fallbackError) {
          console.error('Fallback indexing also failed:', fallbackError);
        }
      }

      throw error;
    }
  }

  /**
   * Update document index with fallback
   */
  async updateDocumentIndex(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string
  ): Promise<IndexingResult> {
    return this.executeWithFallback(
      'updateDocumentIndex',
      async (provider) => provider.updateDocumentIndex(documentId, chunks, userId)
    );
  }

  /**
   * Delete document with cleanup on both providers
   */
  async deleteDocumentIndex(
    documentId: string,
    userId: string,
    cleanupBothProviders = true
  ): Promise<boolean> {
    let primarySuccess = false;
    let fallbackSuccess = false;

    try {
      primarySuccess = await this.primaryProvider.deleteDocumentIndex(documentId, userId);
    } catch (error) {
      console.error('Primary provider deletion failed:', error);
      this.recordError(`Delete document failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    if (cleanupBothProviders && this.fallbackProvider) {
      try {
        fallbackSuccess = await this.fallbackProvider.deleteDocumentIndex(documentId, userId);
      } catch (error) {
        console.error('Fallback provider deletion failed:', error);
      }
    }

    return primarySuccess || fallbackSuccess;
  }

  /**
   * Get comprehensive status of all providers
   */
  async getStatus(): Promise<{
    primary: SearchStatus;
    fallback?: SearchStatus;
    metrics: SearchMetrics;
    shouldUseFallback: boolean;
  }> {
    const primaryStatus = await this.primaryProvider.getStatus();
    let fallbackStatus: SearchStatus | undefined;

    if (this.fallbackProvider) {
      try {
        fallbackStatus = await this.fallbackProvider.getStatus();
      } catch (error) {
        console.error('Fallback status check failed:', error);
      }
    }

    return {
      primary: primaryStatus,
      fallback: fallbackStatus,
      metrics: this.metrics,
      shouldUseFallback: this.shouldUseFallback(),
    };
  }

  /**
   * Validate configuration for all providers
   */
  async validateConfiguration(): Promise<{
    primary: ConfigValidationResult;
    fallback?: ConfigValidationResult;
    overall: ConfigValidationResult;
  }> {
    const primaryValidation = await this.primaryProvider.validateConfiguration();
    let fallbackValidation: ConfigValidationResult | undefined;

    if (this.fallbackProvider) {
      try {
        fallbackValidation = await this.fallbackProvider.validateConfiguration();
      } catch (error) {
        fallbackValidation = {
          isValid: false,
          errors: [error instanceof Error ? error.message : 'Fallback validation failed'],
          warnings: [],
        };
      }
    }

    const overallValidation: ConfigValidationResult = {
      isValid: primaryValidation.isValid || (fallbackValidation?.isValid || false),
      errors: [
        ...primaryValidation.errors,
        ...(fallbackValidation?.errors || []),
      ],
      warnings: [
        ...primaryValidation.warnings,
        ...(fallbackValidation?.warnings || []),
      ],
    };

    return {
      primary: primaryValidation,
      fallback: fallbackValidation,
      overall: overallValidation,
    };
  }

  /**
   * Get search analytics from active provider
   */
  async getSearchAnalytics(
    userId: string,
    timeRange: 'day' | 'week' | 'month' = 'day'
  ) {
    const provider = this.shouldUseFallback() && this.fallbackProvider 
      ? this.fallbackProvider 
      : this.primaryProvider;

    return provider.getSearchAnalytics(userId, timeRange);
  }

  /**
   * Clear cache on all providers
   */
  async clearCache(userId?: string): Promise<boolean> {
    const promises: Promise<boolean>[] = [
      this.primaryProvider.clearCache(userId),
    ];

    if (this.fallbackProvider) {
      promises.push(this.fallbackProvider.clearCache(userId));
    }

    const results = await Promise.allSettled(promises);
    return results.some(result => result.status === 'fulfilled' && result.value);
  }

  /**
   * Get cache statistics from all providers
   */
  async getCacheStats() {
    const primaryStats = await this.primaryProvider.getCacheStats();
    let fallbackStats;

    if (this.fallbackProvider) {
      try {
        fallbackStats = await this.fallbackProvider.getCacheStats();
      } catch (error) {
        console.error('Fallback cache stats failed:', error);
      }
    }

    return {
      primary: primaryStats,
      fallback: fallbackStats,
    };
  }

  /**
   * Switch primary and fallback providers
   */
  async switchProviders(): Promise<void> {
    if (!this.fallbackProvider) {
      throw new Error('No fallback provider configured');
    }

    const temp = this.primaryProvider;
    this.primaryProvider = this.fallbackProvider;
    this.fallbackProvider = temp;

    // Reset metrics
    this.metrics = {
      totalRequests: 0,
      primarySuccess: 0,
      fallbackUsed: 0,
      failures: 0,
      avgResponseTime: 0,
    };

    this.errorHistory = [];
  }

  /**
   * Get current metrics
   */
  getMetrics(): SearchMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      primarySuccess: 0,
      fallbackUsed: 0,
      failures: 0,
      avgResponseTime: 0,
    };
    this.errorHistory = [];
  }

  // Private methods

  private initializeProviders(): void {
    const factory = vectorSearchFactory;

    this.primaryProvider = factory.createProvider(this.config.primary.config);

    if (this.config.fallback) {
      this.fallbackProvider = factory.createProvider(this.config.fallback.config);
    }
  }

  private async executeWithFallback<T>(
    operation: string,
    execute: (provider: VectorSearchProvider) => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Try primary provider first
    if (!this.shouldUseFallback()) {
      try {
        const result = await this.retryOperation(() => execute(this.primaryProvider));
        this.updateMetrics(operation, true, Date.now() - startTime);
        this.metrics.primarySuccess++;
        return result;
      } catch (error) {
        this.updateMetrics(operation, false, Date.now() - startTime);
        this.recordError(`Primary ${operation} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

        // Fall through to fallback
      }
    }

    // Try fallback provider
    if (this.fallbackProvider) {
      try {
        const result = await this.retryOperation(() => execute(this.fallbackProvider!));
        this.updateMetrics(operation, true, Date.now() - startTime);
        this.metrics.fallbackUsed++;
        return result;
      } catch (fallbackError) {
        this.updateMetrics(operation, false, Date.now() - startTime);
        this.recordError(`Fallback ${operation} failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        this.metrics.failures++;
        throw fallbackError;
      }
    }

    this.metrics.failures++;
    throw new Error(`All providers failed for operation: ${operation}`);
  }

  private async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.retryAttempts) {
          await this.sleep(this.config.retryDelayMs * attempt);
        }
      }
    }

    throw lastError!;
  }

  private shouldUseFallback(): boolean {
    if (!this.fallbackProvider || this.metrics.totalRequests < 10) {
      return false;
    }

    const errorRate = (this.metrics.failures + this.errorHistory.length) / this.metrics.totalRequests;
    return errorRate >= this.config.fallbackThreshold;
  }

  private updateMetrics(operation: string, success: boolean, responseTime: number): void {
    if (success) {
      // Update average response time
      const totalTime = this.metrics.avgResponseTime * (this.metrics.primarySuccess + this.metrics.fallbackUsed);
      const newCount = this.metrics.primarySuccess + this.metrics.fallbackUsed + 1;
      this.metrics.avgResponseTime = (totalTime + responseTime) / newCount;
    }
  }

  private recordError(error: string): void {
    this.errorHistory.push({
      timestamp: new Date(),
      error,
    });

    // Keep only recent errors (last 100)
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-100);
    }

    this.metrics.lastError = error;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create enhanced search service from environment
 */
export function createEnhancedSearchService(): EnhancedVectorSearchService {
  const primaryType = (process.env.VECTOR_SEARCH_PROVIDER as 'neondb' | 'openai') || 'neondb';
  const fallbackType = primaryType === 'neondb' ? 'openai' : 'neondb';

  const config: ProviderConfig = {
    primary: {
      type: primaryType,
      config: createProviderConfig(primaryType),
    },
    fallback: process.env.OPENAI_API_KEY && process.env.POSTGRES_URL ? {
      type: fallbackType,
      config: createProviderConfig(fallbackType),
    } : undefined,
    fallbackThreshold: 0.3,
    retryAttempts: 3,
    retryDelayMs: 1000,
  };

  return new EnhancedVectorSearchService(config);
}

function createProviderConfig(type: 'neondb' | 'openai'): any {
  if (type === 'neondb') {
    return {
      type: 'neondb',
      connectionString: process.env.POSTGRES_URL || '',
      embeddingModel: process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0',
      dimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS || '1024'),
    };
  } else {
    return {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY || '',
      indexName: process.env.OPENAI_VECTOR_INDEX || 'roborail-docs',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
      dimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS || '3072'),
    };
  }
}

// Singleton instance
export const enhancedSearchService = createEnhancedSearchService();