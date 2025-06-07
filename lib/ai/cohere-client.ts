import { CohereError, CohereClient } from 'cohere-ai';

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

export interface EmbeddingBatch {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  model: string;
  processingTimeMs: number;
}

export interface EmbeddingComparison {
  model1: string;
  model2: string;
  similarity: number;
  dimensions1: number;
  dimensions2: number;
  processingTime1: number;
  processingTime2: number;
}

export interface RerankResult {
  index: number;
  relevanceScore: number;
  document: {
    text: string;
  };
}

export interface RerankResponse {
  results: RerankResult[];
  meta?: {
    apiVersion?: string;
    billedUnits?: {
      searchUnits?: number;
    };
  };
}

class CohereService {
  private client: CohereClient;
  private readonly MODEL_EMBED_V3 = 'embed-english-v3.0';
  private readonly MODEL_EMBED_V4 = 'embed-english-v4.0';
  private readonly MODEL_RERANK = 'rerank-english-v3.0';
  private readonly DEFAULT_MODEL: string;
  private embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

  constructor() {
    if (!process.env.COHERE_API_KEY) {
      throw new Error('COHERE_API_KEY environment variable is required');
    }

    this.client = new CohereClient({
      token: process.env.COHERE_API_KEY,
    });

    // Use v4.0 by default, fallback to v3.0 if specified
    this.DEFAULT_MODEL = process.env.COHERE_EMBED_MODEL === 'v3.0' 
      ? this.MODEL_EMBED_V3 
      : this.MODEL_EMBED_V4;
  }

  /**
   * Get cached embedding or generate new one
   */
  private getCachedEmbedding(text: string): number[] | null {
    const cacheKey = this.getCacheKey(text);
    const cached = this.embeddingCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.embedding;
    }
    
    return null;
  }

  /**
   * Cache embedding result
   */
  private setCachedEmbedding(text: string, embedding: number[]): void {
    const cacheKey = this.getCacheKey(text);
    this.embeddingCache.set(cacheKey, {
      embedding,
      timestamp: Date.now(),
    });
    
    // Clean old cache entries periodically
    if (this.embeddingCache.size > 1000) {
      this.cleanCache();
    }
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.embeddingCache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.embeddingCache.delete(key);
      }
    }
  }

  /**
   * Generate embeddings for a single text with enhanced features
   */
  async generateEmbedding(
    text: string, 
    options: {
      model?: 'v3.0' | 'v4.0';
      useCache?: boolean;
      inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering';
    } = {}
  ): Promise<EmbeddingResult> {
    const { 
      model = 'v4.0', 
      useCache = true, 
      inputType = 'search_document' 
    } = options;
    
    const startTime = Date.now();
    
    // Check cache first
    if (useCache) {
      const cached = this.getCachedEmbedding(text);
      if (cached) {
        return {
          embedding: cached,
          tokens: this.estimateTokens(text),
        };
      }
    }

    try {
      const modelName = model === 'v3.0' ? this.MODEL_EMBED_V3 : this.MODEL_EMBED_V4;
      
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

      // Handle different response formats
      const embedding = Array.isArray(response.embeddings[0])
        ? response.embeddings[0]
        : (response.embeddings[0] as any)?.float || [];

      const result = {
        embedding,
        tokens:
          response.meta?.billedUnits?.inputTokens || this.estimateTokens(text),
      };
      
      // Cache the result
      if (useCache) {
        this.setCachedEmbedding(text, embedding);
      }
      
      return result;
    } catch (error) {
      if (error instanceof CohereError) {
        throw new Error(`Cohere API error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in optimized batches
   */
  async generateEmbeddingBatch(
    texts: string[],
    options: {
      batchSize?: number;
      model?: 'v3.0' | 'v4.0';
      useCache?: boolean;
      inputType?: 'search_document' | 'search_query' | 'classification' | 'clustering';
      maxConcurrency?: number;
    } = {},
  ): Promise<EmbeddingBatch> {
    const {
      batchSize = 96,
      model = 'v4.0',
      useCache = true,
      inputType = 'search_document',
      maxConcurrency = 3,
    } = options;
    
    const startTime = Date.now();
    const allEmbeddings: EmbeddingResult[] = [];
    let totalTokens = 0;
    const modelName = model === 'v3.0' ? this.MODEL_EMBED_V3 : this.MODEL_EMBED_V4;
    
    // Check cache for existing embeddings
    const { cachedResults, uncachedTexts, uncachedIndices } = this.checkBatchCache(texts, useCache);
    
    // Fill cached results
    cachedResults.forEach((result, originalIndex) => {
      if (result) {
        allEmbeddings[originalIndex] = result;
        totalTokens += result.tokens;
      }
    });
    
    if (uncachedTexts.length === 0) {
      return {
        embeddings: allEmbeddings,
        totalTokens,
        model: modelName,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Process uncached texts in parallel batches
    const batches: string[][] = [];
    for (let i = 0; i < uncachedTexts.length; i += batchSize) {
      batches.push(uncachedTexts.slice(i, i + batchSize));
    }

    // Process batches with controlled concurrency
    const batchPromises = batches.map(async (batch, batchIndex) => {

      try {
        // Add delay between concurrent batches to respect rate limits
        if (batchIndex > 0) {
          await this.delay(Math.floor(batchIndex / maxConcurrency) * 200);
        }
        
        const response = await this.client.embed({
          texts: batch,
          model: modelName,
          inputType,
          embeddingTypes: ['float'],
        });

        if (
          !response.embeddings ||
          !(response.embeddings as any).length ||
          (response.embeddings as any).length !== batch.length
        ) {
          throw new Error(
            `Batch embedding failed: expected ${batch.length} embeddings, got ${(response.embeddings as any)?.length || 0}`,
          );
        }

        const batchEmbeddings = (response.embeddings as any).map(
          (emb: any, index: number) => {
            const embedding = Array.isArray(emb) ? emb : (emb as any)?.float || [];
            const result = {
              embedding,
              tokens: this.estimateTokens(batch[index]),
            };
            
            // Cache individual embeddings
            if (useCache) {
              this.setCachedEmbedding(batch[index], embedding);
            }
            
            return result;
          },
        );

        const batchTokens = response.meta?.billedUnits?.inputTokens ||
          batchEmbeddings.reduce((sum: number, emb: any) => sum + emb.tokens, 0);
        
        return { embeddings: batchEmbeddings, tokens: batchTokens };
      } catch (error) {
        if (error instanceof CohereError) {
          throw new Error(`Cohere batch API error: ${error.message}`);
        }
        throw error;
      }
    });
    
    // Wait for all batches with controlled concurrency
    const batchResults = await this.processConcurrently(batchPromises, maxConcurrency);
    
    // Merge results back into correct positions
    let uncachedIndex = 0;
    batchResults.forEach((batchResult: any) => {
      batchResult.embeddings.forEach((embedding: any) => {
        const originalIndex = uncachedIndices[uncachedIndex];
        allEmbeddings[originalIndex] = embedding;
        uncachedIndex++;
      });
      totalTokens += batchResult.tokens;
    });

    return {
      embeddings: allEmbeddings,
      totalTokens,
      model: modelName,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Check cache for batch of texts
   */
  private checkBatchCache(
    texts: string[],
    useCache: boolean,
  ): {
    cachedResults: (EmbeddingResult | null)[];
    uncachedTexts: string[];
    uncachedIndices: number[];
  } {
    const cachedResults: (EmbeddingResult | null)[] = new Array(texts.length).fill(null);
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];
    
    if (!useCache) {
      return {
        cachedResults,
        uncachedTexts: texts,
        uncachedIndices: texts.map((_, i) => i),
      };
    }
    
    texts.forEach((text, index) => {
      const cached = this.getCachedEmbedding(text);
      if (cached) {
        cachedResults[index] = {
          embedding: cached,
          tokens: this.estimateTokens(text),
        };
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(index);
      }
    });
    
    return { cachedResults, uncachedTexts, uncachedIndices };
  }

  /**
   * Process promises with controlled concurrency
   */
  private async processConcurrently<T>(
    promises: Promise<T>[],
    maxConcurrency: number,
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < promises.length; i += maxConcurrency) {
      const batch = promises.slice(i, i + maxConcurrency);
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
      
      // Small delay between concurrent batches
      if (i + maxConcurrency < promises.length) {
        await this.delay(100);
      }
    }
    
    return results;
  }

  /**
   * Compare embeddings from different models
   */
  async compareEmbeddingModels(
    text: string,
  ): Promise<EmbeddingComparison> {
    const startTime1 = Date.now();
    const embedding1 = await this.generateEmbedding(text, { 
      model: 'v3.0', 
      useCache: false 
    });
    const processingTime1 = Date.now() - startTime1;
    
    const startTime2 = Date.now();
    const embedding2 = await this.generateEmbedding(text, { 
      model: 'v4.0', 
      useCache: false 
    });
    const processingTime2 = Date.now() - startTime2;
    
    // Calculate cosine similarity between embeddings
    const similarity = this.cosineSimilarity(embedding1.embedding, embedding2.embedding);
    
    return {
      model1: this.MODEL_EMBED_V3,
      model2: this.MODEL_EMBED_V4,
      similarity,
      dimensions1: embedding1.embedding.length,
      dimensions2: embedding2.embedding.length,
      processingTime1,
      processingTime2,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get optimal embedding model based on use case
   */
  getOptimalModel(useCase: 'speed' | 'accuracy' | 'balanced'): 'v3.0' | 'v4.0' {
    switch (useCase) {
      case 'speed':
        return 'v3.0'; // Generally faster
      case 'accuracy':
        return 'v4.0'; // Latest model with improved accuracy
      case 'balanced':
      default:
        return 'v4.0'; // v4.0 as default for best overall performance
    }
  }

  /**
   * Generate query embedding for search with model selection
   */
  async generateQueryEmbedding(
    query: string,
    options: {
      model?: 'v3.0' | 'v4.0';
      useCache?: boolean;
    } = {},
  ): Promise<EmbeddingResult> {
    const { model = 'v4.0', useCache = true } = options;
    
    // Check cache first
    if (useCache) {
      const cached = this.getCachedEmbedding(query);
      if (cached) {
        return {
          embedding: cached,
          tokens: this.estimateTokens(query),
        };
      }
    }

    try {
      const modelName = model === 'v3.0' ? this.MODEL_EMBED_V3 : this.MODEL_EMBED_V4;
      
      const response = await this.client.embed({
        texts: [query],
        model: modelName,
        inputType: 'search_query',
        embeddingTypes: ['float'],
      });

      if (
        !response.embeddings ||
        !Array.isArray(response.embeddings) ||
        response.embeddings.length === 0
      ) {
        throw new Error('No query embedding returned from Cohere API');
      }

      // Handle different response formats
      const embedding = Array.isArray(response.embeddings[0])
        ? response.embeddings[0]
        : (response.embeddings[0] as any)?.float || [];

      const result = {
        embedding,
        tokens:
          response.meta?.billedUnits?.inputTokens || this.estimateTokens(query),
      };
      
      // Cache the result
      if (useCache) {
        this.setCachedEmbedding(query, embedding);
      }
      
      return result;
    } catch (error) {
      if (error instanceof CohereError) {
        throw new Error(`Cohere query embedding error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Rerank documents based on query relevance
   */
  async rerankDocuments(
    query: string,
    documents: string[],
    topK?: number,
  ): Promise<RerankResponse> {
    try {
      const response = await this.client.rerank({
        query,
        documents,
        model: this.MODEL_RERANK,
        topN: topK || documents.length,
        returnDocuments: true,
      });

      return {
        results: response.results.map((result) => ({
          index: result.index,
          relevanceScore: result.relevanceScore,
          document: result.document || { text: documents[result.index] },
        })),
        meta: response.meta as any,
      };
    } catch (error) {
      if (error instanceof CohereError) {
        throw new Error(`Cohere rerank error: ${error.message}`);
      }
      throw error;
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const cohereService = new CohereService();
