/**
 * NeonDB Vector Search Provider
 * 
 * Implementation of VectorSearchProvider interface for NeonDB PostgreSQL
 * with PGVector extension support.
 */

import { db } from '@/lib/db';
import { ragDocument, documentChunk, documentEmbedding } from '@/lib/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { cohereService } from '@/lib/ai/cohere-client';
import type { RedisClientType } from 'redis';
import { BaseVectorSearchProvider } from './base-provider';
import type {
  SearchResponse,
  HybridSearchResponse,
  VectorSearchOptions,
  HybridSearchOptions,
  DocumentChunk,
  IndexingResult,
  SearchStatus,
  ConfigValidationResult,
  SearchResult,
  HybridSearchResult,
  SearchCacheConfig,
  QueryExpansionConfig,
  SimilarityConfig,
  NeonDBProviderConfig,
} from '../types';

export class NeonDBVectorSearchProvider extends BaseVectorSearchProvider {
  private config: NeonDBProviderConfig;

  constructor(
    config: NeonDBProviderConfig,
    cacheConfig: SearchCacheConfig,
    queryExpansionConfig: QueryExpansionConfig,
    similarityConfig: SimilarityConfig,
    redisClient?: RedisClientType,
  ) {
    super(cacheConfig, queryExpansionConfig, similarityConfig, redisClient);
    this.config = config;
  }

  /**
   * Perform vector similarity search with enhanced features
   */
  async vectorSearch(
    query: string,
    userId: string,
    options: VectorSearchOptions = {},
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const {
      limit = 10,
      threshold = 0.3,
      documentIds,
      useCache = true,
      expandQuery = true,
      elementTypes,
      pageNumbers,
    } = options;

    // Check cache first
    const cacheKey = this.getCacheKey(query, userId, options);
    if (this.cacheConfig.enabled && useCache && this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const cachedResult = JSON.parse(cached);
          return {
            ...cachedResult,
            cacheHit: true,
            searchTimeMs: Date.now() - startTime,
          };
        }
      } catch (error) {
        console.warn('Cache read error:', error);
      }
    }

    // Expand query if enabled
    const { expandedQuery, expansions } = expandQuery
      ? this.expandQuery(query)
      : { expandedQuery: query, expansions: [] };

    try {
      // Generate query embedding using expanded query
      const queryEmbedding =
        await cohereService.generateQueryEmbedding(expandedQuery);
      const embeddingVector = JSON.stringify(queryEmbedding.embedding);

      // Build the search query
      let whereCondition = and(
        eq(ragDocument.uploadedBy, userId),
        eq(ragDocument.status, 'embedded'),
      );

      if (documentIds && documentIds.length > 0) {
        whereCondition = and(
          whereCondition,
          sql`${ragDocument.id} = ANY(${documentIds})`,
        );
      }

      // Add element type filtering
      if (elementTypes && elementTypes.length > 0) {
        whereCondition = and(
          whereCondition,
          sql`${documentChunk.elementType} = ANY(${elementTypes})`,
        );
      }

      // Add page number filtering
      if (pageNumbers && pageNumbers.length > 0) {
        whereCondition = and(
          whereCondition,
          sql`${documentChunk.pageNumber} = ANY(${pageNumbers})`,
        );
      }

      // Perform vector similarity search using configured algorithm
      const similaritySql = this.getSimilaritySql(
        documentEmbedding.embedding,
        embeddingVector,
      );

      const results = await db
        .select({
          chunkId: documentEmbedding.chunkId,
          documentId: ragDocument.id,
          documentTitle: ragDocument.originalName,
          content: documentChunk.content,
          similarity: similaritySql,
          metadata: documentChunk.metadata,
          chunkIndex: documentChunk.chunkIndex,
          // Include enhanced ADE structural metadata
          elementType: documentChunk.elementType,
          pageNumber: documentChunk.pageNumber,
          bbox: documentChunk.bbox,
        })
        .from(documentEmbedding)
        .innerJoin(
          documentChunk,
          eq(documentEmbedding.chunkId, documentChunk.id),
        )
        .innerJoin(ragDocument, eq(documentChunk.documentId, ragDocument.id))
        .where(whereCondition)
        .orderBy(desc(similaritySql))
        .limit(limit);

      // Calculate adaptive threshold
      const adaptiveThreshold = this.calculateAdaptiveThreshold(
        threshold,
        expandedQuery.length,
        results.length,
      );

      // Filter by adaptive similarity threshold
      const filteredResults = results
        .filter((result) => result.similarity >= adaptiveThreshold)
        .map((result) => ({
          ...result,
          chunkId: result.chunkId || '',
          chunkIndex: Number.parseInt(result.chunkIndex),
        }));

      const searchResponse = {
        results: filteredResults,
        totalResults: filteredResults.length,
        queryEmbeddingTokens: queryEmbedding.tokens,
        searchTimeMs: Date.now() - startTime,
        cacheHit: false,
        queryExpansions: expansions.length > 0 ? expansions : undefined,
      };

      // Cache the results
      if (this.cacheConfig.enabled && useCache && this.redis) {
        try {
          await this.redis.setEx(
            cacheKey,
            this.cacheConfig.ttlSeconds,
            JSON.stringify({
              results: filteredResults,
              totalResults: filteredResults.length,
              queryEmbeddingTokens: queryEmbedding.tokens,
              queryExpansions: expansions.length > 0 ? expansions : undefined,
            }),
          );
        } catch (error) {
          console.warn('Cache write error:', error);
        }
      }

      // Track metrics
      await this.trackSearchMetrics(
        userId,
        query,
        Date.now() - startTime,
        'vector',
        false,
      );

      return searchResponse;
    } catch (error) {
      console.error('Vector search error:', error);
      throw new Error(
        `Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Perform enhanced hybrid search (vector + full-text)
   */
  async hybridSearch(
    query: string,
    userId: string,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResponse> {
    const startTime = Date.now();
    const {
      limit = 10,
      vectorWeight: initialVectorWeight = 0.7,
      textWeight: initialTextWeight = 0.3,
      threshold = 0.2,
      documentIds,
      useRerank = true,
      rerankTopK = 20,
      scoringAlgorithm = 'adaptive',
      useCache = true,
      expandQuery = true,
      elementTypes,
      pageNumbers,
    } = options;

    // Check cache first for hybrid search
    const cacheKey = this.getCacheKey(`hybrid:${query}`, userId, options);
    if (this.cacheConfig.enabled && useCache && this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const cachedResult = JSON.parse(cached);
          return {
            ...cachedResult,
            cacheHit: true,
            searchTimeMs: Date.now() - startTime,
          };
        }
      } catch (error) {
        console.warn('Hybrid search cache read error:', error);
      }
    }

    try {
      // Get vector search results (higher limit for reranking)
      const vectorResults = await this.vectorSearch(query, userId, {
        limit: useRerank ? rerankTopK : limit,
        threshold: 0.1, // Lower threshold for hybrid approach
        documentIds,
        useCache: false, // Don't double-cache
        expandQuery,
        elementTypes,
        pageNumbers,
      });

      // Perform full-text search with expanded query if enabled
      const { expandedQuery, expansions } = expandQuery
        ? this.expandQuery(query)
        : { expandedQuery: query, expansions: [] };

      const textResults = await this.fullTextSearch(expandedQuery, userId, {
        limit: useRerank ? rerankTopK : limit,
        documentIds,
        elementTypes,
        pageNumbers,
      });

      // Determine scoring approach and weights
      let vectorWeight = initialVectorWeight;
      let textWeight = initialTextWeight;
      let algorithmUsed = scoringAlgorithm;
      let combinedResults: HybridSearchResult[];

      if (scoringAlgorithm === 'adaptive') {
        const adaptiveWeights = this.adaptiveScoring(
          query,
          vectorResults.results,
          textResults.results,
        );
        vectorWeight = adaptiveWeights.vectorWeight;
        textWeight = adaptiveWeights.textWeight;
        algorithmUsed = adaptiveWeights.algorithm as any;
      }

      // Combine results using selected algorithm
      if (scoringAlgorithm === 'rrf') {
        combinedResults = this.combineResultsRRF(
          vectorResults.results,
          textResults.results,
        );
        algorithmUsed = 'rrf';
      } else {
        // Use weighted combination (original or adaptive)
        combinedResults = this.combineResults(
          vectorResults.results,
          textResults.results,
          vectorWeight,
          textWeight,
        );
      }

      let finalResults = combinedResults
        .filter((result) => result.hybridScore >= threshold)
        .sort((a, b) => b.hybridScore - a.hybridScore)
        .slice(0, useRerank ? rerankTopK : limit);

      let rerankTimeMs: number | undefined;

      // Apply reranking if requested
      if (useRerank && finalResults.length > 1) {
        const rerankStart = Date.now();
        finalResults = await this.rerankResults(query, finalResults, limit);
        rerankTimeMs = Date.now() - rerankStart;
      } else {
        finalResults = finalResults.slice(0, limit);
      }

      const hybridResponse = {
        results: finalResults,
        totalResults: finalResults.length,
        queryEmbeddingTokens: vectorResults.queryEmbeddingTokens,
        searchTimeMs: Date.now() - startTime,
        rerankTimeMs,
        cacheHit: false,
        queryExpansions:
          expansions.length > 0 ? expansions : vectorResults.queryExpansions,
        algorithmUsed,
      };

      // Cache the hybrid search results
      if (this.cacheConfig.enabled && useCache && this.redis) {
        try {
          await this.redis.setEx(
            cacheKey,
            this.cacheConfig.ttlSeconds,
            JSON.stringify({
              results: finalResults,
              totalResults: finalResults.length,
              queryEmbeddingTokens: vectorResults.queryEmbeddingTokens,
              rerankTimeMs,
              queryExpansions:
                expansions.length > 0
                  ? expansions
                  : vectorResults.queryExpansions,
              algorithmUsed,
            }),
          );
        } catch (error) {
          console.warn('Hybrid search cache write error:', error);
        }
      }

      // Track metrics
      await this.trackSearchMetrics(
        userId,
        query,
        Date.now() - startTime,
        algorithmUsed,
        false,
      );

      return hybridResponse;
    } catch (error) {
      console.error('Hybrid search error:', error);
      throw new Error(
        `Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Index a document with its chunks
   */
  async indexDocument(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string,
  ): Promise<IndexingResult> {
    const startTime = Date.now();
    let chunksIndexed = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      for (const chunk of chunks) {
        try {
          // Generate embedding for the chunk
          const embedding = await cohereService.generateEmbedding(chunk.content);
          
          // Insert/update the chunk in database
          await db.insert(documentChunk).values({
            id: chunk.id,
            documentId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex.toString(),
            metadata: chunk.metadata,
            elementType: chunk.elementType,
            pageNumber: chunk.pageNumber,
            bbox: chunk.bbox,
            createdAt: new Date(),
            updatedAt: new Date(),
          }).onConflictDoUpdate({
            target: documentChunk.id,
            set: {
              content: chunk.content,
              metadata: chunk.metadata,
              elementType: chunk.elementType,
              pageNumber: chunk.pageNumber,
              bbox: chunk.bbox,
              updatedAt: new Date(),
            },
          });

          // Insert/update the embedding
          await db.insert(documentEmbedding).values({
            id: `${chunk.id}_embedding`,
            chunkId: chunk.id,
            embedding: JSON.stringify(embedding.embedding),
            model: this.config.embeddingModel,
            dimensions: this.config.dimensions,
            createdAt: new Date(),
          }).onConflictDoUpdate({
            target: documentEmbedding.chunkId,
            set: {
              embedding: JSON.stringify(embedding.embedding),
              model: this.config.embeddingModel,
              dimensions: this.config.dimensions,
              createdAt: new Date(),
            },
          });

          chunksIndexed++;
        } catch (chunkError) {
          errorCount++;
          errors.push(`Chunk ${chunk.id}: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`);
        }
      }

      return {
        success: errorCount === 0,
        documentId,
        chunksIndexed,
        errorCount,
        errors: errors.length > 0 ? errors : undefined,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        documentId,
        chunksIndexed,
        errorCount: chunks.length,
        errors: [`Document indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        timeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Update document index
   */
  async updateDocumentIndex(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string,
  ): Promise<IndexingResult> {
    // For NeonDB, update is the same as indexing with upsert behavior
    return this.indexDocument(documentId, chunks, userId);
  }

  /**
   * Delete document index
   */
  async deleteDocumentIndex(documentId: string, userId: string): Promise<boolean> {
    try {
      // Delete embeddings first (due to foreign key constraints)
      await db.delete(documentEmbedding)
        .where(sql`${documentEmbedding.chunkId} IN (
          SELECT ${documentChunk.id} FROM ${documentChunk} 
          WHERE ${documentChunk.documentId} = ${documentId}
        )`);

      // Delete chunks
      await db.delete(documentChunk)
        .where(eq(documentChunk.documentId, documentId));

      return true;
    } catch (error) {
      console.error(`Failed to delete document index for ${documentId}:`, error);
      return false;
    }
  }

  /**
   * Get provider status
   */
  async getStatus(): Promise<SearchStatus> {
    const lastSuccessfulQuery = new Date(); // Would track this properly in production
    let dbStatus: 'connected' | 'disconnected' | 'error' = 'connected';
    let cacheStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';

    // Test database connection
    try {
      await db.select({ count: sql<number>`count(*)` }).from(ragDocument);
    } catch (error) {
      dbStatus = 'error';
    }

    // Test cache connection
    if (this.redis) {
      try {
        await this.redis.ping();
        cacheStatus = 'connected';
      } catch (error) {
        cacheStatus = 'error';
      }
    }

    return {
      isHealthy: dbStatus === 'connected',
      lastSuccessfulQuery,
      errorCount: 0, // Would track this properly
      avgResponseTime: 0, // Would calculate this from metrics
      cacheStatus,
      dbStatus,
    };
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration(): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate connection string
    if (!this.config.connectionString) {
      errors.push('Connection string is required');
    }

    // Validate embedding model
    if (!this.config.embeddingModel) {
      errors.push('Embedding model is required');
    }

    // Validate dimensions
    if (!this.config.dimensions || this.config.dimensions <= 0) {
      errors.push('Valid embedding dimensions are required');
    }

    // Test database connection
    try {
      await db.select({ count: sql<number>`count(*)` }).from(ragDocument);
    } catch (error) {
      errors.push(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check if PGVector is available
    try {
      await db.execute(sql`SELECT 1`);
    } catch (error) {
      warnings.push('Could not verify PGVector extension availability');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // Private helper methods

  /**
   * Get similarity SQL based on configured algorithm
   */
  private getSimilaritySql(embeddingColumn: any, queryVector: string) {
    switch (this.similarityConfig.algorithm) {
      case 'cosine':
        return sql<number>`1 - (${embeddingColumn}::vector <=> ${queryVector}::vector)`;
      case 'euclidean':
        return sql<number>`1 / (1 + (${embeddingColumn}::vector <-> ${queryVector}::vector))`;
      case 'dot_product':
        return sql<number>`${embeddingColumn}::vector <#> ${queryVector}::vector`;
      default:
        return sql<number>`1 - (${embeddingColumn}::vector <=> ${queryVector}::vector)`;
    }
  }

  /**
   * Enhanced full-text search with query optimization
   */
  private async fullTextSearch(
    query: string,
    userId: string,
    options: {
      limit?: number;
      documentIds?: string[];
      useAdvancedQuery?: boolean;
      elementTypes?: string[];
      pageNumbers?: number[];
    } = {},
  ): Promise<{ results: SearchResult[] }> {
    const {
      limit = 10,
      documentIds,
      useAdvancedQuery = true,
      elementTypes,
      pageNumbers,
    } = options;

    // Optimize query for full-text search
    let optimizedQuery = query;
    if (useAdvancedQuery) {
      // Clean and optimize the query for PostgreSQL full-text search
      optimizedQuery = query
        .replace(/[^\w\s]/g, ' ') // Remove special characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Add prefix matching for technical terms
      const words = optimizedQuery.split(' ');
      const expandedWords = words.map((word) => {
        if (word.length > 3) {
          return `${word}:*`; // Add prefix matching
        }
        return word;
      });
      optimizedQuery = expandedWords.join(' & ');
    }

    let whereCondition = and(
      eq(ragDocument.uploadedBy, userId),
      eq(ragDocument.status, 'embedded'),
      useAdvancedQuery
        ? sql`to_tsvector('english', ${documentChunk.content}) @@ to_tsquery('english', ${optimizedQuery})`
        : sql`to_tsvector('english', ${documentChunk.content}) @@ plainto_tsquery('english', ${query})`,
    );

    // Add document ID filtering
    if (documentIds && documentIds.length > 0) {
      whereCondition = and(
        whereCondition,
        sql`${ragDocument.id} = ANY(${documentIds})`,
      );
    }

    // Add element type filtering
    if (elementTypes && elementTypes.length > 0) {
      whereCondition = and(
        whereCondition,
        sql`${documentChunk.elementType} = ANY(${elementTypes})`,
      );
    }

    // Add page number filtering
    if (pageNumbers && pageNumbers.length > 0) {
      whereCondition = and(
        whereCondition,
        sql`${documentChunk.pageNumber} = ANY(${pageNumbers})`,
      );
    }

    // If advanced query fails, fallback to simple query
    let results: any[] = [];
    try {
      results = await db
        .select({
          chunkId: documentChunk.id,
          documentId: ragDocument.id,
          documentTitle: ragDocument.originalName,
          content: documentChunk.content,
          similarity: useAdvancedQuery
            ? sql<number>`ts_rank_cd(to_tsvector('english', ${documentChunk.content}), to_tsquery('english', ${optimizedQuery}))`
            : sql<number>`ts_rank(to_tsvector('english', ${documentChunk.content}), plainto_tsquery('english', ${query}))`,
          metadata: documentChunk.metadata,
          chunkIndex: documentChunk.chunkIndex,
          // Include enhanced ADE structural metadata
          elementType: documentChunk.elementType,
          pageNumber: documentChunk.pageNumber,
          bbox: documentChunk.bbox,
        })
        .from(documentChunk)
        .innerJoin(ragDocument, eq(documentChunk.documentId, ragDocument.id))
        .where(whereCondition)
        .orderBy(
          desc(
            useAdvancedQuery
              ? sql`ts_rank_cd(to_tsvector('english', ${documentChunk.content}), to_tsquery('english', ${optimizedQuery}))`
              : sql`ts_rank(to_tsvector('english', ${documentChunk.content}), plainto_tsquery('english', ${query}))`,
          ),
        )
        .limit(limit);
    } catch (advancedError) {
      console.warn(
        'Advanced text search failed, falling back to simple search:',
        advancedError,
      );

      // Fallback to simple query - recreate whereCondition without advanced query
      whereCondition = and(
        eq(ragDocument.uploadedBy, userId),
        eq(ragDocument.status, 'embedded'),
        sql`to_tsvector('english', ${documentChunk.content}) @@ plainto_tsquery('english', ${query})`,
      );

      if (documentIds && documentIds.length > 0) {
        whereCondition = and(
          whereCondition,
          sql`${ragDocument.id} = ANY(${documentIds})`,
        );
      }

      if (elementTypes && elementTypes.length > 0) {
        whereCondition = and(
          whereCondition,
          sql`${documentChunk.elementType} = ANY(${elementTypes})`,
        );
      }

      if (pageNumbers && pageNumbers.length > 0) {
        whereCondition = and(
          whereCondition,
          sql`${documentChunk.pageNumber} = ANY(${pageNumbers})`,
        );
      }

      results = await db
        .select({
          chunkId: documentChunk.id,
          documentId: ragDocument.id,
          documentTitle: ragDocument.originalName,
          content: documentChunk.content,
          similarity: sql<number>`ts_rank(to_tsvector('english', ${documentChunk.content}), plainto_tsquery('english', ${query}))`,
          metadata: documentChunk.metadata,
          chunkIndex: documentChunk.chunkIndex,
          elementType: documentChunk.elementType,
          pageNumber: documentChunk.pageNumber,
          bbox: documentChunk.bbox,
        })
        .from(documentChunk)
        .innerJoin(ragDocument, eq(documentChunk.documentId, ragDocument.id))
        .where(whereCondition)
        .orderBy(
          desc(
            sql`ts_rank(to_tsvector('english', ${documentChunk.content}), plainto_tsquery('english', ${query}))`,
          ),
        )
        .limit(limit);
    }

    return {
      results: results.map((result) => ({
        ...result,
        chunkIndex: Number.parseInt(result.chunkIndex),
      })),
    };
  }

  /**
   * Adaptive scoring that adjusts weights based on query characteristics
   */
  private adaptiveScoring(
    query: string,
    vectorResults: SearchResult[],
    textResults: SearchResult[],
  ): { vectorWeight: number; textWeight: number; algorithm: string } {
    // Analyze query characteristics
    const hasSpecificTerms = /\b(error|issue|problem|fix|solve)\b/i.test(query);
    const hasNumbers = /\d+/.test(query);
    const isLongQuery = query.length > 50;
    const wordCount = query.split(/\s+/).length;

    let vectorWeight = 0.7;
    let textWeight = 0.3;

    // Adjust weights based on query analysis
    if (hasSpecificTerms || hasNumbers) {
      // Favor text search for specific technical terms and numbers
      textWeight = 0.5;
      vectorWeight = 0.5;
    }

    if (isLongQuery || wordCount > 10) {
      // Favor vector search for conceptual/longer queries
      vectorWeight = 0.8;
      textWeight = 0.2;
    }

    // Analyze result quality to further adjust
    const vectorAvgScore =
      vectorResults.length > 0
        ? vectorResults.reduce((sum, r) => sum + r.similarity, 0) /
          vectorResults.length
        : 0;
    const textAvgScore =
      textResults.length > 0
        ? textResults.reduce((sum, r) => sum + r.similarity, 0) /
          textResults.length
        : 0;

    // If one method significantly outperforms, adjust weights
    if (vectorAvgScore > textAvgScore * 1.5) {
      vectorWeight = Math.min(0.9, vectorWeight + 0.1);
      textWeight = 1 - vectorWeight;
    } else if (textAvgScore > vectorAvgScore * 1.5) {
      textWeight = Math.min(0.9, textWeight + 0.1);
      vectorWeight = 1 - textWeight;
    }

    return { vectorWeight, textWeight, algorithm: 'adaptive' };
  }

  /**
   * Reciprocal Rank Fusion (RRF) for combining search results
   */
  private combineResultsRRF(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    k = 60,
  ): HybridSearchResult[] {
    const resultMap = new Map<string, HybridSearchResult>();

    // Add vector results with RRF scoring
    vectorResults.forEach((result, index) => {
      const rrfScore = 1 / (k + index + 1);
      resultMap.set(result.chunkId, {
        ...result,
        vectorScore: result.similarity,
        textScore: 0,
        hybridScore: rrfScore,
      });
    });

    // Add text results with RRF scoring
    textResults.forEach((result, index) => {
      const rrfScore = 1 / (k + index + 1);
      const existing = resultMap.get(result.chunkId);

      if (existing) {
        existing.textScore = result.similarity;
        existing.hybridScore += rrfScore;
      } else {
        resultMap.set(result.chunkId, {
          ...result,
          vectorScore: 0,
          textScore: result.similarity,
          hybridScore: rrfScore,
        });
      }
    });

    return Array.from(resultMap.values());
  }

  /**
   * Combine vector and text search results using weighted scoring
   */
  private combineResults(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    vectorWeight: number,
    textWeight: number,
  ): HybridSearchResult[] {
    const resultMap = new Map<string, HybridSearchResult>();

    // Add vector results
    vectorResults.forEach((result, index) => {
      const normalizedScore = 1 - index / vectorResults.length; // Normalize by rank
      resultMap.set(result.chunkId, {
        ...result,
        vectorScore: result.similarity,
        textScore: 0,
        hybridScore: vectorWeight * normalizedScore,
      });
    });

    // Add text results
    textResults.forEach((result, index) => {
      const normalizedScore = 1 - index / textResults.length; // Normalize by rank
      const existing = resultMap.get(result.chunkId);

      if (existing) {
        existing.textScore = result.similarity;
        existing.hybridScore =
          vectorWeight * (existing.vectorScore || 0) +
          textWeight * normalizedScore;
      } else {
        resultMap.set(result.chunkId, {
          ...result,
          vectorScore: 0,
          textScore: result.similarity,
          hybridScore: textWeight * normalizedScore,
        });
      }
    });

    return Array.from(resultMap.values());
  }

  /**
   * Enhanced rerank results using Cohere Rerank with confidence scoring
   */
  private async rerankResults(
    query: string,
    results: HybridSearchResult[],
    topK: number,
  ): Promise<HybridSearchResult[]> {
    if (results.length <= 1) return results;

    try {
      // Prepare documents with enhanced context
      const documents = results.map((result) => {
        // Include document title and metadata for better reranking
        const contextualContent = `${result.documentTitle}: ${result.content}`;
        return contextualContent;
      });

      const rerankResponse = await cohereService.rerankDocuments(
        query,
        documents,
        Math.min(topK * 2, 20), // Get more candidates for better selection
      );

      // Map rerank results back with enhanced scoring
      const rerankedResults = rerankResponse.results.map((rerankResult) => {
        const originalResult = results[rerankResult.index];

        // Combine rerank score with original hybrid score
        const combinedScore =
          rerankResult.relevanceScore * 0.8 + originalResult.hybridScore * 0.2;

        return {
          ...originalResult,
          rerankScore: rerankResult.relevanceScore,
          hybridScore: combinedScore,
        };
      });

      // Return top K results
      return rerankedResults.slice(0, topK);
    } catch (error) {
      console.error('Reranking error:', error);
      // Fall back to original ordering if reranking fails
      return results.slice(0, topK);
    }
  }
}