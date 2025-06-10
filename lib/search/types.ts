/**
 * TypeScript interfaces and types for the vector search system
 *
 * This module contains all type definitions used across the vector search
 * modules to ensure type safety and consistency.
 */

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

// Multimodal search interfaces
export interface ImageSearchResult {
  imageId: string;
  documentId: string;
  documentTitle: string;
  imagePath: string;
  pageNumber: number;
  similarity: number;
  imageMetadata: {
    width: number;
    height: number;
    format: string;
    fileSize: number;
  };
}

export interface MultimodalSearchResponse {
  textResults: SearchResult[];
  imageResults: ImageSearchResult[];
  totalTextResults: number;
  totalImageResults: number;
  queryEmbeddingTokens: number;
  searchTimeMs: number;
  cacheHit?: boolean;
  queryExpansions?: string[];
}

// Search options interfaces
export interface VectorSearchOptions {
  limit?: number;
  threshold?: number;
  documentIds?: string[];
  useCache?: boolean;
  expandQuery?: boolean;
  elementTypes?: string[];
  pageNumbers?: number[];
}

export interface HybridSearchOptions {
  limit?: number;
  vectorWeight?: number;
  textWeight?: number;
  threshold?: number;
  documentIds?: string[];
  useRerank?: boolean;
  rerankTopK?: number;
  useCache?: boolean;
  expandQuery?: boolean;
  scoringAlgorithm?: 'weighted' | 'rrf' | 'adaptive';
  elementTypes?: string[];
  pageNumbers?: number[];
}

export interface MultimodalSearchOptions {
  limit?: number;
  textLimit?: number;
  imageLimit?: number;
  threshold?: number;
  documentIds?: string[];
  useCache?: boolean;
  expandQuery?: boolean;
  elementTypes?: string[];
  pageNumbers?: number[];
}

// Search filter interfaces
export interface SearchFilters {
  documentTypes?: string[];
  dateRange?: {
    start?: string;
    end?: string;
  };
  sources?: string[];
  minChunkLength?: number;
  maxChunkLength?: number;
  elementTypes?: string[];
  pageNumbers?: number[];
  spatialSearch?: {
    bbox?: [number, number, number, number];
    tolerance?: number;
  };
}

// Context-aware search interfaces
export interface ContextAwareSearchOptions {
  conversationHistory?: Array<{ role: string; content: string }>;
  userPreferences?: Record<string, any>;
  sessionContext?: Record<string, any>;
  domainSpecific?: boolean;
}

// Multi-step search interfaces
export interface MultiStepSearchOptions {
  maxSteps?: number;
  stepThreshold?: number;
  contextWindowSize?: number;
  refinementStrategy?: 'additive' | 'replacement' | 'hybrid';
}

// Analytics and metrics interfaces
export interface SearchAnalytics {
  totalQueries: number;
  avgResponseTime: number;
  cacheHitRate: number;
  topQueries: Array<{ query: string; count: number }>;
  failureRate: number;
  averageResultsReturned: number;
}

export interface SearchMetrics {
  queryTime: number;
  vectorSearchTime: number;
  textSearchTime: number;
  rerankTime?: number;
  cacheTime?: number;
  totalTime: number;
  resultCount: number;
  cacheHit: boolean;
}

// Configuration interfaces
export interface VectorSearchConfig {
  similarity: SimilarityConfig;
  cache: SearchCacheConfig;
  queryExpansion: QueryExpansionConfig;
  maxResults: number;
  defaultThreshold: number;
  rerankingEnabled: boolean;
  analyticsEnabled: boolean;
}

// Result ranking and scoring interfaces
export interface ScoringWeights {
  vectorScore: number;
  textScore: number;
  recencyBoost: number;
  sourceReliability: number;
  chunkLength: number;
}

export interface RankingOptions {
  algorithm: 'rrf' | 'weighted' | 'adaptive' | 'linear';
  weights: ScoringWeights;
  normalizeScores: boolean;
  applyBoosts: boolean;
}

// Error and status interfaces
export interface SearchError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export interface SearchStatus {
  isHealthy: boolean;
  lastSuccessfulQuery?: Date;
  errorCount: number;
  avgResponseTime: number;
  cacheStatus: 'connected' | 'disconnected' | 'error';
  dbStatus: 'connected' | 'disconnected' | 'error';
}

// Internal utility types
export type SearchResultWithScore = SearchResult & {
  _score: number;
  _algorithm: string;
};

export type CacheEntry<T> = {
  value: T;
  ttl: number;
  createdAt: Date;
};

export type QueryContext = {
  originalQuery: string;
  expandedQueries: string[];
  filters?: SearchFilters;
  options?: MultimodalSearchOptions;
  metadata?: Record<string, any>;
};
