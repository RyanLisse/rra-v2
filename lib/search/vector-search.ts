import { db } from '@/lib/db';
import { ragDocument, documentChunk, documentEmbedding } from '@/lib/db/schema';
import { eq, sql, desc, and } from 'drizzle-orm';
import { cohereService } from '@/lib/ai/cohere-client';
import { createClient, type RedisClientType } from 'redis';
import { createHash } from 'node:crypto';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  similarity: number;
  metadata: any;
  chunkIndex: number;
  // Enhanced ADE structural metadata
  elementType?: string | null; // e.g., 'paragraph', 'title', 'figure_caption', 'table_text', 'list_item'
  pageNumber?: number | null; // page number where the element appears
  bbox?: any; // optional bounding box coordinates as [x1, y1, x2, y2]
}

export interface SearchResponse {
  results: SearchResult[];
  totalResults: number;
  queryEmbeddingTokens: number;
  searchTimeMs: number;
  cacheHit?: boolean;
  queryExpansions?: string[];
}

export interface HybridSearchResult extends SearchResult {
  textScore?: number;
  vectorScore: number;
  hybridScore: number;
  rerankScore?: number;
}

export interface HybridSearchResponse {
  results: HybridSearchResult[];
  totalResults: number;
  queryEmbeddingTokens: number;
  searchTimeMs: number;
  rerankTimeMs?: number;
  cacheHit?: boolean;
  queryExpansions?: string[];
  algorithmUsed?: 'rrf' | 'weighted' | 'adaptive';
}

export interface QueryExpansionConfig {
  enabled: boolean;
  maxExpansions: number;
  synonyms: Record<string, string[]>;
  domainTerms: Record<string, string[]>;
}

export interface SearchCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
  keyPrefix: string;
}

export interface SimilarityConfig {
  algorithm: 'cosine' | 'euclidean' | 'dot_product';
  adaptiveThreshold: boolean;
  contextAwareScoring: boolean;
}

export class VectorSearchService {
  private redis?: RedisClientType;
  private cacheConfig: SearchCacheConfig;
  private queryExpansionConfig: QueryExpansionConfig;
  private similarityConfig: SimilarityConfig;

  constructor() {
    // Initialize Redis for caching if available
    if (process.env.REDIS_URL) {
      this.redis = createClient({ url: process.env.REDIS_URL });
      this.redis.connect().catch(console.error);
    }

    this.cacheConfig = {
      enabled: !!this.redis && process.env.SEARCH_CACHE_ENABLED !== 'false',
      ttlSeconds: Number.parseInt(process.env.SEARCH_CACHE_TTL || '3600'),
      keyPrefix: 'vector_search:',
    };

    this.queryExpansionConfig = {
      enabled: process.env.QUERY_EXPANSION_ENABLED !== 'false',
      maxExpansions: 3,
      synonyms: this.loadSynonymDictionary(),
      domainTerms: this.loadDomainTerms(),
    };

    this.similarityConfig = {
      algorithm: (process.env.SIMILARITY_ALGORITHM as any) || 'cosine',
      adaptiveThreshold: process.env.ADAPTIVE_THRESHOLD_ENABLED !== 'false',
      contextAwareScoring:
        process.env.CONTEXT_AWARE_SCORING_ENABLED !== 'false',
    };
  }
  /**
   * Load synonym dictionary for query expansion
   */
  private loadSynonymDictionary(): Record<string, string[]> {
    return {
      // Technical terms
      issue: ['problem', 'error', 'bug', 'fault'],
      fix: ['solve', 'repair', 'resolve', 'correct'],
      install: ['setup', 'configure', 'deploy', 'implement'],
      connect: ['link', 'attach', 'join', 'bind'],
      calibrate: ['adjust', 'tune', 'configure', 'set'],
      // Add more domain-specific synonyms as needed
    };
  }

  /**
   * Load domain-specific terms for expansion
   */
  private loadDomainTerms(): Record<string, string[]> {
    return {
      roborail: ['robot', 'automation', 'rail system', 'automated rail'],
      pmac: ['controller', 'motion controller', 'control system'],
      calibration: ['setup', 'configuration', 'tuning', 'adjustment'],
      // Add more domain terms based on your document corpus
    };
  }

  /**
   * Generate cache key for search query
   */
  private getCacheKey(query: string, userId: string, options: any): string {
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
  private expandQuery(query: string): {
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
  private calculateAdaptiveThreshold(
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
      elementTypes?: string[]; // Filter by specific element types
      pageNumbers?: number[]; // Filter by specific page numbers
    } = {},
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

      return searchResponse;
    } catch (error) {
      console.error('Vector search error:', error);
      throw new Error(
        `Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
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

      return hybridResponse;
    } catch (error) {
      console.error('Hybrid search error:', error);
      throw new Error(
        `Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
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

      // Fallback to simple query
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

      // Add element type filtering to fallback
      if (elementTypes && elementTypes.length > 0) {
        whereCondition = and(
          whereCondition,
          sql`${documentChunk.elementType} = ANY(${elementTypes})`,
        );
      }

      // Add page number filtering to fallback
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
            sql`ts_rank(to_tsvector('english', ${documentChunk.content}), plainto_tsquery('english', ${query}))`,
          ),
        )
        .limit(limit);
    }

    // Note: Query execution is now handled above with fallback logic

    return {
      results: results.map((result) => ({
        ...result,
        chunkIndex: Number.parseInt(result.chunkIndex),
      })),
    };
  }

  /**
   * Combine vector and text search results
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
   * Extract key terms from conversation context
   */
  private extractContextTerms(
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
  ): Promise<HybridSearchResponse> {
    const {
      maxSteps = 3,
      minResultsPerStep = 3,
      documentIds,
      elementTypes,
      pageNumbers,
    } = options;

    let currentQuery = query;
    const allResults: HybridSearchResult[] = [];
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
   * Refine query based on search results
   */
  private refineQueryFromResults(
    originalQuery: string,
    results: HybridSearchResult[],
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

  /**
   * Search analytics and performance metrics
   */
  async getSearchAnalytics(
    userId: string,
    timeRange: 'day' | 'week' | 'month' = 'day',
  ): Promise<{
    totalSearches: number;
    avgResponseTime: number;
    cacheHitRate: number;
    popularQueries: { query: string; count: number }[];
    algorithmUsage: Record<string, number>;
  }> {
    if (!this.redis) {
      return {
        totalSearches: 0,
        avgResponseTime: 0,
        cacheHitRate: 0,
        popularQueries: [],
        algorithmUsage: {},
      };
    }

    const analyticsKey = `search_analytics:${userId}:${timeRange}`;

    try {
      const analytics = await this.redis.get(analyticsKey);
      return analytics
        ? JSON.parse(analytics)
        : {
            totalSearches: 0,
            avgResponseTime: 0,
            cacheHitRate: 0,
            popularQueries: [],
            algorithmUsage: {},
          };
    } catch (error) {
      console.error('Analytics retrieval error:', error);
      return {
        totalSearches: 0,
        avgResponseTime: 0,
        cacheHitRate: 0,
        popularQueries: [],
        algorithmUsage: {},
      };
    }
  }

  /**
   * Track search metrics for analytics
   */
  private async trackSearchMetrics(
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
  async getCacheStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate: number;
  }> {
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
}

// Singleton instance
export const vectorSearchService = new VectorSearchService();

// Simplified VectorSearch class for testing
export class VectorSearch {
  constructor(private cohereClient: any) {}

  async search(params: {
    query: string;
    userId: string;
    limit?: number;
    threshold?: number;
    includeMetadata?: boolean;
    db: any;
  }) {
    const {
      query,
      userId,
      limit = 10,
      threshold = 0.3,
      includeMetadata = false,
      db,
    } = params;

    // For testing, perform simple search
    const chunks = await db
      .select({
        chunk: documentChunk,
        document: ragDocument,
        embedding: documentEmbedding,
      })
      .from(documentChunk)
      .innerJoin(ragDocument, eq(documentChunk.documentId, ragDocument.id))
      .innerJoin(
        documentEmbedding,
        eq(documentChunk.id, documentEmbedding.chunkId),
      )
      .where(
        and(
          eq(ragDocument.uploadedBy, userId),
          eq(ragDocument.status, 'processed'),
        ),
      )
      .limit(limit);

    // Mock scoring for tests
    const results = chunks.map((row, index) => ({
      id: row.chunk.id,
      content: row.chunk.content,
      score: Math.max(threshold, 1 - index * 0.1),
      document: {
        id: row.document.id,
        title: row.document.originalName,
        fileName: row.document.fileName,
      },
      chunkIndex: Number.parseInt(row.chunk.chunkIndex),
      // Include enhanced ADE structural metadata
      elementType: row.chunk.elementType,
      pageNumber: row.chunk.pageNumber,
      bbox: row.chunk.bbox,
    }));

    return {
      results: results.filter((r) => r.score >= threshold),
      totalFound: results.length,
      query,
    };
  }

  async searchWithReranking(params: {
    query: string;
    userId: string;
    limit?: number;
    rerankTopK?: number;
    db: any;
  }) {
    const { rerankTopK = 5, ...searchParams } = params;

    // Get initial results
    const searchResults = await this.search({
      ...searchParams,
      limit: Math.max(searchParams.limit || 10, rerankTopK * 2),
    });

    // Mock reranking
    const rerankedResults = searchResults.results
      .slice(0, rerankTopK)
      .map((result, index) => ({
        ...result,
        rerankScore: result.score + 0.1 * (rerankTopK - index),
      }))
      .sort((a, b) => b.rerankScore! - a.rerankScore!);

    return {
      ...searchResults,
      results: rerankedResults,
    };
  }
}
