/**
 * Enhanced Cohere Client with Redis Caching Integration
 *
 * Extends the existing Cohere client with comprehensive Redis caching
 * for embeddings, search queries, and reranking results.
 */

import { CohereError, CohereClient } from 'cohere-ai';
import {
  embeddingCache,
  redisCacheManager,
} from '@/lib/cache/redis-cache-manager';
import crypto from 'node:crypto';
import pino from 'pino';

const logger = pino({
  name: 'enhanced-cohere-client',
  level: process.env.LOG_LEVEL || 'info',
});

export interface CachedEmbeddingResult {
  embedding: number[];
  tokens: number;
  model: string;
  inputType: string;
  cacheHit: boolean;
  processingTimeMs: number;
}

export interface CachedRerankResult {
  results: {
    index: number;
    relevanceScore: number;
    document: { text: string };
  }[];
  meta?: any;
  cacheHit: boolean;
  processingTimeMs: number;
}

export interface EmbeddingCacheStats {
  hitRate: number;
  totalEmbeddings: number;
  cacheSize: string;
  avgResponseTime: number;
}

export class EnhancedCohereService {
  private client: CohereClient;
  private readonly MODEL_EMBED_V3 = 'embed-english-v3.0';
  private readonly MODEL_EMBED_V4 = 'embed-english-v3.0'; // v4.0 doesn't exist
  private readonly MODEL_RERANK = 'rerank-english-v3.0';
  private readonly DEFAULT_MODEL: string;

  // Cache configuration
  private readonly EMBEDDING_CACHE_TTL = 14400; // 4 hours
  private readonly QUERY_CACHE_TTL = 1800; // 30 minutes
  private readonly RERANK_CACHE_TTL = 900; // 15 minutes

  // Performance tracking
  private metrics = {
    embeddingRequests: 0,
    embeddingCacheHits: 0,
    rerankRequests: 0,
    rerankCacheHits: 0,
    totalApiTime: 0,
    totalCacheTime: 0,
  };

  constructor() {
    if (!process.env.COHERE_API_KEY) {
      throw new Error('COHERE_API_KEY environment variable is required');
    }

    this.client = new CohereClient({
      token: process.env.COHERE_API_KEY,
    });

    this.DEFAULT_MODEL =
      process.env.COHERE_EMBED_MODEL === 'v3.0'
        ? this.MODEL_EMBED_V3
        : this.MODEL_EMBED_V4;
  }

  /**
   * Generate embedding with Redis caching
   */
  async generateEmbedding(
    text: string,
    options: {
      model?: 'v3.0' | 'v4.0';
      useCache?: boolean;
      inputType?:
        | 'search_document'
        | 'search_query'
        | 'classification'
        | 'clustering';
    } = {},
  ): Promise<CachedEmbeddingResult> {
    const {
      model = 'v4.0',
      useCache = true,
      inputType = 'search_document',
    } = options;

    const startTime = Date.now();
    this.metrics.embeddingRequests++;

    // Generate cache key
    const cacheKey = this.generateEmbeddingCacheKey(text, model, inputType);

    // Check Redis cache first
    if (useCache) {
      const cached = await embeddingCache.getEmbedding(cacheKey);
      if (cached) {
        this.metrics.embeddingCacheHits++;
        this.metrics.totalCacheTime += Date.now() - startTime;

        return {
          embedding: cached.embedding,
          tokens: cached.metadata?.tokens || this.estimateTokens(text),
          model: model === 'v3.0' ? this.MODEL_EMBED_V3 : this.MODEL_EMBED_V4,
          inputType,
          cacheHit: true,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    // Generate fresh embedding
    try {
      const apiStartTime = Date.now();
      const modelName =
        model === 'v3.0' ? this.MODEL_EMBED_V3 : this.MODEL_EMBED_V4;

      const response = await this.client.embed({
        texts: [text],
        model: modelName,
        inputType,
        embeddingTypes: ['float'],
      });

      if (
        !response.embeddings ||
        !Array.isArray(response.embeddings) ||
        response.embeddings.length === 0
      ) {
        throw new Error('No embeddings returned from Cohere API');
      }

      const embedding = Array.isArray(response.embeddings[0])
        ? response.embeddings[0]
        : (response.embeddings[0] as any)?.float || [];

      const tokens =
        response.meta?.billedUnits?.inputTokens || this.estimateTokens(text);
      const apiTime = Date.now() - apiStartTime;
      this.metrics.totalApiTime += apiTime;

      // Cache the result
      if (useCache) {
        await embeddingCache.cacheEmbedding(cacheKey, embedding, {
          tokens,
          model: modelName,
          inputType,
          generatedAt: Date.now(),
        });
      }

      logger.debug(
        {
          textLength: text.length,
          tokens,
          model: modelName,
          apiTime,
          totalTime: Date.now() - startTime,
        },
        'Generated fresh embedding',
      );

      return {
        embedding,
        tokens,
        model: modelName,
        inputType,
        cacheHit: false,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error, model, inputType }, 'Failed to generate embedding');
      if (error instanceof CohereError) {
        throw new Error(`Cohere API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate query embedding with specialized caching
   */
  async generateQueryEmbedding(
    query: string,
    options: {
      model?: 'v3.0' | 'v4.0';
      useCache?: boolean;
    } = {},
  ): Promise<CachedEmbeddingResult> {
    const { model = 'v4.0', useCache = true } = options;

    // Use shorter TTL for query embeddings
    const result = await this.generateEmbedding(query, {
      model,
      useCache,
      inputType: 'search_query',
    });

    // Store in specialized query cache with shorter TTL
    if (!result.cacheHit && useCache) {
      await embeddingCache.cacheSearchEmbedding(
        query,
        result.embedding,
        result.tokens,
      );
    }

    return result;
  }

  /**
   * Batch embedding generation with intelligent caching
   */
  async generateEmbeddingBatch(
    texts: string[],
    options: {
      batchSize?: number;
      model?: 'v3.0' | 'v4.0';
      useCache?: boolean;
      inputType?:
        | 'search_document'
        | 'search_query'
        | 'classification'
        | 'clustering';
      maxConcurrency?: number;
    } = {},
  ): Promise<{
    embeddings: CachedEmbeddingResult[];
    totalTokens: number;
    cacheHitRate: number;
    processingTimeMs: number;
  }> {
    const {
      batchSize = 96,
      model = 'v4.0',
      useCache = true,
      inputType = 'search_document',
      maxConcurrency = 3,
    } = options;

    const startTime = Date.now();
    const embeddings: CachedEmbeddingResult[] = [];
    let totalTokens = 0;
    let cacheHits = 0;

    // Check cache for all texts first
    const cacheChecks = await Promise.all(
      texts.map(async (text, index) => {
        const cacheKey = this.generateEmbeddingCacheKey(text, model, inputType);
        const cached = useCache
          ? await embeddingCache.getEmbedding(cacheKey)
          : null;

        return {
          index,
          text,
          cacheKey,
          cached,
        };
      }),
    );

    // Separate cached and uncached texts
    const uncachedItems: { index: number; text: string; cacheKey: string }[] =
      [];

    cacheChecks.forEach(({ index, text, cacheKey, cached }) => {
      if (cached) {
        embeddings[index] = {
          embedding: cached.embedding,
          tokens: cached.metadata?.tokens || this.estimateTokens(text),
          model: model === 'v3.0' ? this.MODEL_EMBED_V3 : this.MODEL_EMBED_V4,
          inputType,
          cacheHit: true,
          processingTimeMs: 0,
        };
        totalTokens += embeddings[index].tokens;
        cacheHits++;
      } else {
        uncachedItems.push({ index, text, cacheKey });
      }
    });

    // Process uncached texts in batches
    if (uncachedItems.length > 0) {
      const modelName =
        model === 'v3.0' ? this.MODEL_EMBED_V3 : this.MODEL_EMBED_V4;

      for (let i = 0; i < uncachedItems.length; i += batchSize) {
        const batch = uncachedItems.slice(i, i + batchSize);
        const batchTexts = batch.map((item) => item.text);

        try {
          const batchStartTime = Date.now();

          const response = await this.client.embed({
            texts: batchTexts,
            model: modelName,
            inputType,
            embeddingTypes: ['float'],
          });

          if (
            !response.embeddings ||
            (response.embeddings as any).length !== batchTexts.length
          ) {
            throw new Error(
              `Batch embedding failed: expected ${batchTexts.length} embeddings`,
            );
          }

          const batchProcessingTime = Date.now() - batchStartTime;

          // Process batch results
          const batchResults = await Promise.all(
            (response.embeddings as any).map(
              async (emb: any, batchIndex: number) => {
                const item = batch[batchIndex];
                const embedding = Array.isArray(emb)
                  ? emb
                  : (emb as any)?.float || [];
                const tokens = this.estimateTokens(item.text);

                // Cache the result
                if (useCache) {
                  await embeddingCache.cacheEmbedding(
                    item.cacheKey,
                    embedding,
                    {
                      tokens,
                      model: modelName,
                      inputType,
                      generatedAt: Date.now(),
                    },
                  );
                }

                return {
                  index: item.index,
                  embedding,
                  tokens,
                  model: modelName,
                  inputType,
                  cacheHit: false,
                  processingTimeMs: batchProcessingTime / batchTexts.length,
                };
              },
            ),
          );

          // Place results in correct positions
          batchResults.forEach((result) => {
            embeddings[result.index] = result;
            totalTokens += result.tokens;
          });

          // Add delay between batches to respect rate limits
          if (i + batchSize < uncachedItems.length) {
            await this.delay(200);
          }
        } catch (error) {
          logger.error(
            { error, batchSize: batch.length },
            'Failed to process embedding batch',
          );
          throw error;
        }
      }
    }

    const cacheHitRate =
      texts.length > 0 ? (cacheHits / texts.length) * 100 : 0;

    logger.info(
      {
        totalTexts: texts.length,
        cacheHits,
        cacheHitRate: cacheHitRate.toFixed(1),
        uncachedProcessed: uncachedItems.length,
        totalTokens,
        processingTimeMs: Date.now() - startTime,
      },
      'Completed batch embedding generation',
    );

    return {
      embeddings,
      totalTokens,
      cacheHitRate,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Rerank documents with caching
   */
  async rerankDocuments(
    query: string,
    documents: string[],
    topK?: number,
    useCache = true,
  ): Promise<CachedRerankResult> {
    const startTime = Date.now();
    this.metrics.rerankRequests++;

    // Generate cache key for reranking
    const cacheKey = this.generateRerankCacheKey(query, documents, topK);

    // Check cache
    if (useCache) {
      const cached = await redisCacheManager.get<CachedRerankResult>(
        cacheKey,
        'api',
      );
      if (cached) {
        this.metrics.rerankCacheHits++;
        return {
          ...cached,
          cacheHit: true,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }

    // Generate fresh rerank results
    try {
      const response = await this.client.rerank({
        query,
        documents,
        model: this.MODEL_RERANK,
        topN: topK || documents.length,
        returnDocuments: true,
      });

      const result: CachedRerankResult = {
        results: response.results.map((result) => ({
          index: result.index,
          relevanceScore: result.relevanceScore,
          document: result.document || { text: documents[result.index] },
        })),
        meta: response.meta as any,
        cacheHit: false,
        processingTimeMs: Date.now() - startTime,
      };

      // Cache the result
      if (useCache) {
        await redisCacheManager.set(cacheKey, result, {
          prefix: 'api',
          ttl: this.RERANK_CACHE_TTL,
        });
      }

      logger.debug(
        {
          query: query.substring(0, 100),
          documentsCount: documents.length,
          topK,
          processingTimeMs: result.processingTimeMs,
        },
        'Generated fresh rerank results',
      );

      return result;
    } catch (error) {
      logger.error(
        { error, query: query.substring(0, 100) },
        'Failed to rerank documents',
      );
      if (error instanceof CohereError) {
        throw new Error(`Cohere rerank error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics(): {
    embeddingCacheHitRate: number;
    rerankCacheHitRate: number;
    avgApiResponseTime: number;
    avgCacheResponseTime: number;
    totalRequests: number;
  } {
    const embeddingCacheHitRate =
      this.metrics.embeddingRequests > 0
        ? (this.metrics.embeddingCacheHits / this.metrics.embeddingRequests) *
          100
        : 0;

    const rerankCacheHitRate =
      this.metrics.rerankRequests > 0
        ? (this.metrics.rerankCacheHits / this.metrics.rerankRequests) * 100
        : 0;

    const totalApiRequests =
      this.metrics.embeddingRequests -
      this.metrics.embeddingCacheHits +
      (this.metrics.rerankRequests - this.metrics.rerankCacheHits);

    const avgApiResponseTime =
      totalApiRequests > 0 ? this.metrics.totalApiTime / totalApiRequests : 0;

    const totalCacheRequests =
      this.metrics.embeddingCacheHits + this.metrics.rerankCacheHits;
    const avgCacheResponseTime =
      totalCacheRequests > 0
        ? this.metrics.totalCacheTime / totalCacheRequests
        : 0;

    return {
      embeddingCacheHitRate: Number(embeddingCacheHitRate.toFixed(2)),
      rerankCacheHitRate: Number(rerankCacheHitRate.toFixed(2)),
      avgApiResponseTime: Number(avgApiResponseTime.toFixed(2)),
      avgCacheResponseTime: Number(avgCacheResponseTime.toFixed(2)),
      totalRequests:
        this.metrics.embeddingRequests + this.metrics.rerankRequests,
    };
  }

  /**
   * Clear embedding cache
   */
  async clearEmbeddingCache(): Promise<number> {
    return redisCacheManager.clear('*', 'embedding');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<EmbeddingCacheStats> {
    const metrics = await redisCacheManager.getMetrics();

    return {
      hitRate: metrics.hitRate,
      totalEmbeddings: metrics.totalKeys,
      cacheSize: metrics.memoryUsage,
      avgResponseTime: metrics.avgResponseTime,
    };
  }

  // Private helper methods

  private generateEmbeddingCacheKey(
    text: string,
    model: string,
    inputType: string,
  ): string {
    const content = `${model}:${inputType}:${text}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private generateRerankCacheKey(
    query: string,
    documents: string[],
    topK?: number,
  ): string {
    const documentsHash = crypto
      .createHash('md5')
      .update(documents.join('||'))
      .digest('hex');

    const content = `rerank:${query}:${documentsHash}:${topK || documents.length}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Backwards compatibility methods
  async embed(
    query: string,
    options: {
      inputType?: 'search_query' | 'search_document';
      embeddingTypes?: string[];
    } = {},
  ): Promise<{
    embeddings: number[][];
    meta?: { billedUnits?: { inputTokens?: number } };
  }> {
    const result = await this.generateEmbedding(query, {
      inputType: options.inputType || 'search_query',
    });

    return {
      embeddings: [result.embedding],
      meta: {
        billedUnits: {
          inputTokens: result.tokens,
        },
      },
    };
  }
}

// Create singleton instance
export const enhancedCohereService = new EnhancedCohereService();

// Export for backwards compatibility
export { EnhancedCohereService as CohereService };
