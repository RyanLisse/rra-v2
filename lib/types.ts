// Core types
export type DataPart = { type: 'append-message'; message: string };

// Re-export ADE types for convenience
export type {
  AdeElementType,
  BoundingBox,
  AdeElement,
  AdeOutput,
  AdeConfig,
  AdeProcessRequest,
  AdeProcessingStatus,
  AdeProcessingJob,
  DbAdeElement,
} from './ade/types';

// Re-export search types for convenience
export type {
  SearchResult,
  SearchResponse,
  HybridSearchResult,
  HybridSearchResponse,
} from './search/vector-search';

// Re-export context formatting types
export type {
  ChatSource,
  ContextFormattingOptions,
} from './ai/context-formatter';

// Enhanced Chat Source interface with complete structural metadata
export interface EnhancedChatSource {
  // Core ChatSource properties
  id: string;
  title: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  elementType?: string | null;
  pageNumber?: number | null;
  bbox?: any;

  // Enhanced document metadata
  documentId: string;
  fileName?: string;
  uploadedAt?: Date;

  // Enhanced structural metadata from ADE
  elementId?: string; // ADE element identifier
  confidence?: number; // ADE confidence score
  metadata?: Record<string, any>; // Additional element metadata

  // Context assembly metadata
  contextIndex: number; // Position in context list
  tokenCount?: number; // Estimated tokens for this source
  wasReranked?: boolean; // Whether this was reranked
  rerankScore?: number; // Reranking confidence score
}

// Chat session and conversation types
export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  visibility: 'private' | 'public';
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  lastActivityAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: EnhancedChatSource[];
  reasoning?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Document processing pipeline types
export type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'text_extracted'
  | 'chunked'
  | 'embedded'
  | 'processed'
  | 'failed';

export interface DocumentProcessingJob {
  id: string;
  documentId: string;
  status: DocumentStatus;
  currentStep: string;
  progress: number; // 0-100
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

// RAG pipeline configuration types
export interface RagConfig {
  // Chunking configuration
  chunking: {
    strategy: 'semantic' | 'fixed' | 'adaptive';
    chunkSize: number;
    chunkOverlap: number;
    preserveStructure: boolean;
  };

  // Embedding configuration
  embedding: {
    provider: 'cohere' | 'openai' | 'custom';
    model: string;
    dimensions: number;
    batchSize: number;
  };

  // Search configuration
  search: {
    defaultLimit: number;
    defaultThreshold: number;
    useHybridSearch: boolean;
    useReranking: boolean;
    rerankTopK: number;
    maxContextTokens: number;
  };

  // ADE processing configuration
  ade: {
    enabled: boolean;
    provider: 'landing-ai' | 'azure-form-recognizer';
    confidence: number;
    preserveImages: boolean;
    extractTables: boolean;
    extractFigures: boolean;
  };
}

// Search and filtering types
export interface SearchFilters {
  documentIds?: string[];
  elementTypes?: string[];
  pageNumbers?: number[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  confidenceRange?: {
    min: number;
    max: number;
  };
}

export interface SearchOptions extends SearchFilters {
  limit?: number;
  threshold?: number;
  useCache?: boolean;
  expandQuery?: boolean;
  useReranking?: boolean;
  rerankTopK?: number;
  scoringAlgorithm?: 'weighted' | 'rrf' | 'adaptive';
  prioritizeElementTypes?: string[];
  maxContextTokens?: number;
}

// Error types
export class RagError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any,
  ) {
    super(message);
    this.name = 'RagError';
  }
}

export class ChatError extends RagError {
  constructor(message: string, details?: any) {
    super(message, 'CHAT_ERROR', 500, details);
  }
}

export class SearchError extends RagError {
  constructor(message: string, details?: any) {
    super(message, 'SEARCH_ERROR', 500, details);
  }
}

export class DocumentProcessingError extends RagError {
  constructor(message: string, statusCode: number = 500, details?: any) {
    super(message, 'DOCUMENT_PROCESSING_ERROR', statusCode, details);
  }
}

// Utility types
export type AsyncResult<T> = Promise<
  { success: true; data: T } | { success: false; error: string }
>;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// AI model configuration types
export interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'google';
  chatModel: string;
  reasoningModel: string;
  titleModel: string;
  artifactModel: string;
  maxTokens?: number;
  temperature?: number;
}

// Context assembly types
export interface ContextAssemblyResult {
  formattedContext: string;
  sources: EnhancedChatSource[];
  totalTokens: number;
  searchStats: {
    totalResults: number;
    searchTimeMs: number;
    rerankTimeMs?: number;
    algorithm: string;
  };
  truncated: boolean;
  elementTypeDistribution: Record<string, number>;
}
