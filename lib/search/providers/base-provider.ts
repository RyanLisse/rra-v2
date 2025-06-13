/**
 * Base abstract class for vector search providers
 * 
 * Provides common functionality and enforces interface compliance
 * for all vector search provider implementations.
 */

import { createHash } from 'node:crypto';
import type { RedisClientType } from 'redis';
import type {
  VectorSearchProvider,
  SearchResponse,
  HybridSearchResponse,
  VectorSearchOptions,
  HybridSearchOptions,
  DocumentChunk,
  IndexingResult,
  SearchAnalytics,
  CacheStats,
  SearchStatus,
  ConfigValidationResult,
  SearchCacheConfig,
  QueryExpansionConfig,
  SimilarityConfig,
} from '../types';

export abstract class BaseVectorSearchProvider implements VectorSearchProvider {
  protected redis?: RedisClientType;
  protected cacheConfig: SearchCacheConfig;
  protected queryExpansionConfig: QueryExpansionConfig;
  protected similarityConfig: SimilarityConfig;

  constructor(
    cacheConfig: SearchCacheConfig,
    queryExpansionConfig: QueryExpansionConfig,
    similarityConfig: SimilarityConfig,
    redisClient?: RedisClientType,
  ) {
    this.cacheConfig = cacheConfig;
    this.queryExpansionConfig = queryExpansionConfig;
    this.similarityConfig = similarityConfig;
    this.redis = redisClient;
  }

  // Abstract methods that must be implemented by concrete providers
  abstract vectorSearch(
    query: string,
    userId: string,
    options?: VectorSearchOptions,
  ): Promise<SearchResponse>;

  abstract hybridSearch(
    query: string,
    userId: string,
    options?: HybridSearchOptions,
  ): Promise<HybridSearchResponse>;

  abstract indexDocument(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string,
  ): Promise<IndexingResult>;

  abstract updateDocumentIndex(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string,
  ): Promise<IndexingResult>;

  abstract deleteDocumentIndex(documentId: string, userId: string): Promise<boolean>;

  abstract getStatus(): Promise<SearchStatus>;

  abstract validateConfiguration(): Promise<ConfigValidationResult>;

  // Common implementations that can be shared across providers

  /**
   * Context-aware search with conversation history
   */
  async contextAwareSearch(
    query: string,
    userId: string,
    conversationContext: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: VectorSearchOptions & {
      contextWeight?: number;
    } = {},
  ): Promise<HybridSearchResponse> {
    const { contextWeight = 0.2, ...searchOptions } = options;

    // Extract key concepts from conversation history
    const contextTerms = this.extractContextTerms(conversationContext);

    // Enhance query with context
    const contextEnhancedQuery =
      contextTerms.length > 0 ? `${query} ${contextTerms.join(' ')}` : query;

    // Perform hybrid search with enhanced query
    const searchResults = await this.hybridSearch(
      contextEnhancedQuery,
      userId,
      {
        ...searchOptions,
        expandQuery: false, // Already enhanced with context
      },
    );

    // Boost results that match conversation context
    if (contextTerms.length > 0) {
      searchResults.results = searchResults.results
        .map((result) => {
          const contextMatches = contextTerms.filter((term) =>
            result.content.toLowerCase().includes(term.toLowerCase()),
          ).length;

          const contextBoost =
            (contextMatches / contextTerms.length) * contextWeight;

          return {
            ...result,
            hybridScore: result.hybridScore + contextBoost,
          };
        })
        .sort((a, b) => b.hybridScore - a.hybridScore);
    }

    return {
      ...searchResults,
      algorithmUsed: 'adaptive',
    };
  }

  /**
   * Multi-step search with query refinement
   */
  async multiStepSearch(
    query: string,
    userId: string,
    options: VectorSearchOptions & {
      maxSteps?: number;
      minResultsPerStep?: number;
    } = {},
  ): Promise<HybridSearchResponse> {
    const {
      maxSteps = 3,
      minResultsPerStep = 3,
      documentIds,
      elementTypes,
      pageNumbers,
    } = options;

    let currentQuery = query;
    const allResults: any[] = [];
    let step = 0;

    while (
      step < maxSteps &&
      allResults.length < minResultsPerStep * maxSteps
    ) {
      const stepResults = await this.hybridSearch(currentQuery, userId, {
        limit: 10,
        threshold: Math.max(0.1, 0.4 - step * 0.1), // Lower threshold each step
        documentIds,
        useCache: step === 0, // Only cache first step
        elementTypes,
        pageNumbers,
      });

      // Filter out duplicates
      const newResults = stepResults.results.filter(
        (result) =>
          !allResults.some((existing) => existing.chunkId === result.chunkId),
      );

      allResults.push(...newResults);

      if (newResults.length === 0) break;

      // Refine query for next step based on current results
      if (step < maxSteps - 1) {
        currentQuery = this.refineQueryFromResults(query, newResults);
      }

      step++;
    }

    // Re-sort all results by hybrid score
    allResults.sort((a, b) => b.hybridScore - a.hybridScore);

    return {
      results: allResults.slice(0, 15),
      totalResults: allResults.length,
      queryEmbeddingTokens: 0, // Aggregated across steps
      searchTimeMs: 0, // Aggregated across steps
      algorithmUsed: 'adaptive',
    };
  }

  /**
   * Get search analytics for a user
   */
  async getSearchAnalytics(
    userId: string,
    timeRange: 'day' | 'week' | 'month' = 'day',
  ): Promise<SearchAnalytics> {
    if (!this.redis) {
      return {
        totalQueries: 0,
        avgResponseTime: 0,
        cacheHitRate: 0,
        topQueries: [],
        failureRate: 0,
        averageResultsReturned: 0,
      };
    }

    const analyticsKey = `search_analytics:${userId}:${timeRange}`;

    try {
      const analytics = await this.redis.get(analyticsKey);
      return analytics
        ? JSON.parse(analytics)
        : {
            totalQueries: 0,
            avgResponseTime: 0,
            cacheHitRate: 0,
            topQueries: [],
            failureRate: 0,
            averageResultsReturned: 0,
          };
    } catch (error) {
      console.error('Analytics retrieval error:', error);
      return {
        totalQueries: 0,
        avgResponseTime: 0,
        cacheHitRate: 0,
        topQueries: [],
        failureRate: 0,
        averageResultsReturned: 0,
      };
    }
  }

  /**
   * Clear search cache for a user or globally
   */
  async clearCache(userId?: string): Promise<boolean> {
    if (!this.redis) return false;

    try {
      const pattern = userId
        ? `${this.cacheConfig.keyPrefix}${userId}:*`
        : `${this.cacheConfig.keyPrefix}*`;

      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
      return true;
    } catch (error) {
      console.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    if (!this.redis) {
      return { totalKeys: 0, memoryUsage: '0B', hitRate: 0 };
    }

    try {
      const keys = await this.redis.keys(`${this.cacheConfig.keyPrefix}*`);
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);

      return {
        totalKeys: keys.length,
        memoryUsage: memoryMatch ? memoryMatch[1] : '0B',
        hitRate: 0, // Would need to track hits/misses for accurate rate
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return { totalKeys: 0, memoryUsage: '0B', hitRate: 0 };
    }
  }

  // Protected helper methods

  /**
   * Generate cache key for search query
   */
  protected getCacheKey(query: string, userId: string, options: any): string {
    const optionsHash = createHash('md5')
      .update(JSON.stringify(options))
      .digest('hex');
    return `${this.cacheConfig.keyPrefix}${userId}:${createHash('md5')
      .update(query)
      .digest('hex')}:${optionsHash}`;
  }

  /**
   * Expand query with synonyms and domain terms
   */
  protected expandQuery(query: string): {
    expandedQuery: string;
    expansions: string[];
  } {
    if (!this.queryExpansionConfig.enabled) {
      return { expandedQuery: query, expansions: [] };
    }

    const words = query.toLowerCase().split(/\s+/);
    const expansions: string[] = [];
    const expandedTerms: string[] = [];

    for (const word of words) {
      const synonyms = this.queryExpansionConfig.synonyms[word] || [];
      const domainTerms = this.queryExpansionConfig.domainTerms[word] || [];

      const allExpansions = [...synonyms, ...domainTerms].slice(
        0,
        this.queryExpansionConfig.maxExpansions,
      );

      if (allExpansions.length > 0) {
        expandedTerms.push(...allExpansions);
        expansions.push(...allExpansions);
      }
    }

    const expandedQuery =
      expandedTerms.length > 0 ? `${query} ${expandedTerms.join(' ')}` : query;

    return { expandedQuery, expansions };
  }

  /**
   * Calculate adaptive similarity threshold based on query and results
   */
  protected calculateAdaptiveThreshold(
    baseThreshold: number,
    queryLength: number,
    resultCount: number,
  ): number {
    if (!this.similarityConfig.adaptiveThreshold) {
      return baseThreshold;
    }

    // Adjust threshold based on query complexity and result abundance
    let adjustedThreshold = baseThreshold;

    // Longer, more specific queries can have lower thresholds
    if (queryLength > 50) {
      adjustedThreshold *= 0.9;
    } else if (queryLength < 20) {
      adjustedThreshold *= 1.1;
    }

    // If too few results, lower threshold slightly
    if (resultCount < 5) {
      adjustedThreshold *= 0.95;
    }

    return Math.max(0.1, Math.min(1.0, adjustedThreshold));
  }

  /**
   * Extract key terms from conversation context
   */
  protected extractContextTerms(
    context: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): string[] {
    const recentMessages = context.slice(-6); // Last 3 exchanges
    const allText = recentMessages.map((msg) => msg.content).join(' ');

    // Extract technical terms, proper nouns, and important concepts
    const terms = allText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];

    // Filter and deduplicate terms
    const importantTerms = terms
      .filter((term) => {
        // Keep technical terms, model numbers, error codes, etc.
        return (
          /^(error|config|setup|install|calibrat|connect|roborail|pmac)/.test(
            term,
          ) ||
          /\d/.test(term) || // Contains numbers
          term.length > 6
        ); // Longer terms are likely more specific
      })
      .slice(0, 5); // Limit to top 5 terms

    return [...new Set(importantTerms)];
  }

  /**
   * Refine query based on search results
   */
  protected refineQueryFromResults(
    originalQuery: string,
    results: any[],
  ): string {
    if (results.length === 0) return originalQuery;

    // Extract common terms from top results
    const topResults = results.slice(0, 3);
    const commonTerms = new Map<string, number>();

    topResults.forEach((result) => {
      const words = result.content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];

      words.forEach((word) => {
        if (!originalQuery.toLowerCase().includes(word)) {
          commonTerms.set(word, (commonTerms.get(word) || 0) + 1);
        }
      });
    });

    // Get most frequent terms not in original query
    const refinementTerms = Array.from(commonTerms.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([term]) => term);

    return refinementTerms.length > 0
      ? `${originalQuery} ${refinementTerms.join(' ')}`
      : originalQuery;
  }

  /**
   * Track search metrics for analytics
   */
  protected async trackSearchMetrics(
    userId: string,
    query: string,
    responseTime: number,
    algorithm: string,
    cacheHit: boolean,
  ): Promise<void> {
    if (!this.redis) return;

    try {
      const metricsKey = `search_metrics:${userId}`;
      const today = new Date().toISOString().split('T')[0];

      // Track daily metrics
      await this.redis.hIncrBy(`${metricsKey}:${today}`, 'total_searches', 1);
      await this.redis.hIncrBy(
        `${metricsKey}:${today}`,
        'total_response_time',
        responseTime,
      );
      await this.redis.hIncrBy(
        `${metricsKey}:${today}`,
        `algorithm_${algorithm}`,
        1,
      );

      if (cacheHit) {
        await this.redis.hIncrBy(`${metricsKey}:${today}`, 'cache_hits', 1);
      }

      // Track popular queries
      await this.redis.zIncrBy(`popular_queries:${userId}:${today}`, 1, query);

      // Set expiration for cleanup
      await this.redis.expire(`${metricsKey}:${today}`, 86400 * 7); // 7 days
      await this.redis.expire(`popular_queries:${userId}:${today}`, 86400 * 7);
    } catch (error) {
      console.error('Metrics tracking error:', error);
    }
  }
}