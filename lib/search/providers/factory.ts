/**
 * Vector Search Provider Factory
 * 
 * Factory class for creating and managing different vector search provider instances.
 * Supports multiple providers including NeonDB, OpenAI, and custom implementations.
 */

import { createClient, type RedisClientType } from 'redis';
import { NeonDBVectorSearchProvider } from './neondb-provider';
import { OpenAIVectorSearchProvider } from './openai-provider';
import { searchConfig } from '../config';
import type {
  VectorSearchProvider,
  VectorSearchProviderFactory,
  VectorProviderConfig,
  NeonDBProviderConfig,
  OpenAIProviderConfig,
  ConfigValidationResult,
} from '../types';

export class VectorSearchFactory implements VectorSearchProviderFactory {
  private static instance: VectorSearchFactory;
  private providers: Map<string, VectorSearchProvider> = new Map();
  private redisClient: RedisClientType | null = null;

  private constructor() {
    this.initializeRedis();
  }

  public static getInstance(): VectorSearchFactory {
    if (!VectorSearchFactory.instance) {
      VectorSearchFactory.instance = new VectorSearchFactory();
    }
    return VectorSearchFactory.instance;
  }

  private async initializeRedis(): Promise<void> {
    if (!process.env.REDIS_URL) {
      return;
    }

    try {
      this.redisClient = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 5000,
        },
      });

      this.redisClient.on('error', (error: Error) => {
        console.error('Redis connection error in factory:', error);
        this.redisClient = null;
      });

      this.redisClient.on('connect', () => {
        console.log('Redis connected for vector search factory');
      });

      await this.redisClient.connect();
    } catch (error) {
      console.error('Failed to initialize Redis in factory:', error);
      this.redisClient = null;
    }
  }

  /**
   * Create a vector search provider instance
   */
  createProvider(config: VectorProviderConfig): VectorSearchProvider {
    const providerId = this.getProviderId(config);
    
    // Return existing instance if available
    if (this.providers.has(providerId)) {
      return this.providers.get(providerId)!;
    }

    let provider: VectorSearchProvider;

    switch (config.type) {
      case 'neondb':
        provider = this.createNeonDBProvider(config as NeonDBProviderConfig);
        break;
      
      case 'openai':
        provider = this.createOpenAIProvider(config as OpenAIProviderConfig);
        break;
      
      case 'pinecone':
        throw new Error('Pinecone provider not yet implemented');
      
      case 'custom':
        throw new Error('Custom provider creation requires additional implementation');
      
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }

    // Cache the provider instance
    this.providers.set(providerId, provider);
    return provider;
  }

  /**
   * Get list of available provider types
   */
  getAvailableProviders(): string[] {
    return ['neondb', 'openai', 'pinecone', 'custom'];
  }

  /**
   * Validate provider configuration
   */
  validateProviderConfig(config: VectorProviderConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate common fields
    if (!config.type) {
      errors.push('Provider type is required');
    }

    if (!this.getAvailableProviders().includes(config.type)) {
      errors.push(`Unsupported provider type: ${config.type}`);
    }

    // Type-specific validation
    switch (config.type) {
      case 'neondb':
        this.validateNeonDBConfig(config as NeonDBProviderConfig, errors, warnings);
        break;
      
      case 'openai':
        this.validateOpenAIConfig(config as OpenAIProviderConfig, errors, warnings);
        break;
      
      case 'pinecone':
        warnings.push('Pinecone provider is not yet implemented');
        break;
      
      case 'custom':
        warnings.push('Custom provider validation should be implemented separately');
        break;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Create default provider from environment variables
   */
  createDefaultProvider(): VectorSearchProvider {
    const providerType = (process.env.VECTOR_SEARCH_PROVIDER as any) || 'neondb';
    
    switch (providerType) {
      case 'neondb':
        return this.createProvider({
          type: 'neondb',
          connectionString: process.env.POSTGRES_URL || '',
          embeddingModel: process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0',
          dimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS || '1024'),
        });
      
      case 'openai':
        return this.createProvider({
          type: 'openai',
          apiKey: process.env.OPENAI_API_KEY || '',
          indexName: process.env.OPENAI_VECTOR_INDEX || 'roborail-docs',
          embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
          dimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS || '3072'),
        });
      
      default:
        throw new Error(`Unsupported default provider type: ${providerType}`);
    }
  }

  /**
   * Get provider instance by ID
   */
  getProvider(providerId: string): VectorSearchProvider | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * Remove provider instance
   */
  removeProvider(config: VectorProviderConfig): boolean {
    const providerId = this.getProviderId(config);
    return this.providers.delete(providerId);
  }

  /**
   * Clear all provider instances
   */
  clearProviders(): void {
    this.providers.clear();
  }

  /**
   * Get health status of all providers
   */
  async getProvidersHealth(): Promise<Record<string, any>> {
    const health: Record<string, any> = {};
    
    for (const [providerId, provider] of this.providers) {
      try {
        const status = await provider.getStatus();
        health[providerId] = {
          isHealthy: status.isHealthy,
          lastSuccessfulQuery: status.lastSuccessfulQuery,
          errorCount: status.errorCount,
          avgResponseTime: status.avgResponseTime,
          cacheStatus: status.cacheStatus,
          dbStatus: status.dbStatus,
        };
      } catch (error) {
        health[providerId] = {
          isHealthy: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return health;
  }

  // Private helper methods

  private createNeonDBProvider(config: NeonDBProviderConfig): NeonDBVectorSearchProvider {
    return new NeonDBVectorSearchProvider(
      config,
      searchConfig.getCacheConfig(),
      searchConfig.getQueryExpansionConfig(),
      searchConfig.getSimilarityConfig(),
      this.redisClient || undefined,
    );
  }

  private createOpenAIProvider(config: OpenAIProviderConfig): OpenAIVectorSearchProvider {
    return new OpenAIVectorSearchProvider(
      config,
      searchConfig.getCacheConfig(),
      searchConfig.getQueryExpansionConfig(),
      searchConfig.getSimilarityConfig(),
      this.redisClient || undefined,
    );
  }

  private validateNeonDBConfig(
    config: NeonDBProviderConfig,
    errors: string[],
    warnings: string[],
  ): void {
    if (!config.connectionString) {
      errors.push('NeonDB connection string is required');
    }

    if (!config.embeddingModel) {
      errors.push('Embedding model is required for NeonDB provider');
    }

    if (!config.dimensions || config.dimensions <= 0) {
      errors.push('Valid embedding dimensions are required for NeonDB provider');
    }

    // Check if connection string looks valid
    if (config.connectionString && !config.connectionString.startsWith('postgres://')) {
      warnings.push('Connection string should start with postgres://');
    }

    // Validate embedding dimensions based on model
    if (config.embeddingModel && config.dimensions) {
      const expectedDimensions = this.getExpectedDimensions(config.embeddingModel);
      if (expectedDimensions && expectedDimensions !== config.dimensions) {
        warnings.push(
          `Expected ${expectedDimensions} dimensions for model ${config.embeddingModel}, got ${config.dimensions}`,
        );
      }
    }
  }

  private validateOpenAIConfig(
    config: OpenAIProviderConfig,
    errors: string[],
    warnings: string[],
  ): void {
    if (!config.apiKey) {
      errors.push('OpenAI API key is required');
    }

    if (!config.indexName) {
      errors.push('OpenAI index name is required');
    }

    if (!config.embeddingModel) {
      errors.push('Embedding model is required for OpenAI provider');
    }

    if (!config.dimensions || config.dimensions <= 0) {
      errors.push('Valid embedding dimensions are required for OpenAI provider');
    }

    // Validate API key format
    if (config.apiKey && !config.apiKey.startsWith('sk-')) {
      warnings.push('OpenAI API key should start with sk-');
    }

    // Validate embedding model
    const validOpenAIModels = [
      'text-embedding-3-small',
      'text-embedding-3-large',
      'text-embedding-ada-002',
    ];
    if (config.embeddingModel && !validOpenAIModels.includes(config.embeddingModel)) {
      warnings.push(`Unknown OpenAI embedding model: ${config.embeddingModel}`);
    }
  }

  private getProviderId(config: VectorProviderConfig): string {
    switch (config.type) {
      case 'neondb':
        return `neondb_${createHash('md5').update(config.connectionString || '').digest('hex').slice(0, 8)}`;
      
      case 'openai':
        return `openai_${config.indexName || 'default'}`;
      
      case 'pinecone':
        return `pinecone_${config.indexName || 'default'}`;
      
      case 'custom':
        return `custom_${createHash('md5').update(JSON.stringify(config.customConfig || {})).digest('hex').slice(0, 8)}`;
      
      default:
        return `unknown_${Date.now()}`;
    }
  }

  private getExpectedDimensions(embeddingModel: string): number | null {
    const dimensionMap: Record<string, number> = {
      'embed-english-v3.0': 1024,
      'embed-english-v2.0': 4096,
      'embed-multilingual-v3.0': 1024,
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536,
    };

    return dimensionMap[embeddingModel] || null;
  }

  /**
   * Cleanup method
   */
  async cleanup(): Promise<void> {
    // Clear all providers
    this.clearProviders();

    // Close Redis connection
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        console.error('Error closing Redis connection in factory:', error);
      }
      this.redisClient = null;
    }
  }
}

// Helper function for crypto import
function createHash(algorithm: string) {
  return require('node:crypto').createHash(algorithm);
}

// Singleton instance for global access
export const vectorSearchFactory = VectorSearchFactory.getInstance();

// Convenience function to create default provider
export function createDefaultVectorSearchProvider(): VectorSearchProvider {
  return vectorSearchFactory.createDefaultProvider();
}

// Convenience function to create provider with config
export function createVectorSearchProvider(config: VectorProviderConfig): VectorSearchProvider {
  return vectorSearchFactory.createProvider(config);
}

// Type guard functions
export function isNeonDBConfig(config: VectorProviderConfig): config is NeonDBProviderConfig {
  return config.type === 'neondb';
}

export function isOpenAIConfig(config: VectorProviderConfig): config is OpenAIProviderConfig {
  return config.type === 'openai';
}