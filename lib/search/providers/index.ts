/**
 * Vector Search Providers Export Module
 * 
 * Centralized exports for all vector search provider implementations
 * and related utilities.
 */

// Base provider and interfaces
export { BaseVectorSearchProvider } from './base-provider';

// Concrete provider implementations  
export { NeonDBVectorSearchProvider } from './neondb-provider';
export { OpenAIVectorSearchProvider } from './openai-provider';

// Factory and utilities
export {
  VectorSearchFactory,
  vectorSearchFactory,
  createDefaultVectorSearchProvider,
  createVectorSearchProvider,
  isNeonDBConfig,
  isOpenAIConfig,
} from './factory';

// Re-export types for convenience
export type {
  VectorSearchProvider,
  VectorSearchProviderFactory,
  VectorProviderConfig,
  NeonDBProviderConfig,
  OpenAIProviderConfig,
  ConfigValidationResult,
  DocumentChunk,
  IndexingResult,
  CacheStats,
} from '../types';