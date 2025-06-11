/**
 * Configuration module for vector search system
 *
 * Handles all configuration management including Redis setup,
 * environment variable parsing, and search parameter defaults.
 */

import { createClient, type RedisClientType } from 'redis';
import type {
  VectorSearchConfig,
  QueryExpansionConfig,
  SearchCacheConfig,
  SimilarityConfig,
} from './types';

export class SearchConfig {
  private static instance: SearchConfig;
  private redisClient: RedisClientType | null = null;
  private config: VectorSearchConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.initializeRedis();
  }

  public static getInstance(): SearchConfig {
    if (!SearchConfig.instance) {
      SearchConfig.instance = new SearchConfig();
    }
    return SearchConfig.instance;
  }

  private loadConfiguration(): VectorSearchConfig {
    return {
      similarity: this.loadSimilarityConfig(),
      cache: this.loadCacheConfig(),
      queryExpansion: this.loadQueryExpansionConfig(),
      maxResults: Number.parseInt(
        process.env.VECTOR_SEARCH_MAX_RESULTS || '50',
      ),
      defaultThreshold: Number.parseFloat(
        process.env.VECTOR_SEARCH_DEFAULT_THRESHOLD || '0.3',
      ),
      rerankingEnabled: process.env.VECTOR_SEARCH_RERANKING_ENABLED !== 'false',
      analyticsEnabled: process.env.VECTOR_SEARCH_ANALYTICS_ENABLED !== 'false',
    };
  }

  private loadSimilarityConfig(): SimilarityConfig {
    return {
      algorithm:
        (process.env.VECTOR_SIMILARITY_ALGORITHM as
          | 'cosine'
          | 'euclidean'
          | 'dot_product') || 'cosine',
      adaptiveThreshold: process.env.VECTOR_ADAPTIVE_THRESHOLD !== 'false',
      contextAwareScoring: process.env.VECTOR_CONTEXT_AWARE_SCORING !== 'false',
    };
  }

  private loadCacheConfig(): SearchCacheConfig {
    return {
      enabled: process.env.VECTOR_SEARCH_CACHE_ENABLED !== 'false',
      ttlSeconds: Number.parseInt(
        process.env.VECTOR_SEARCH_CACHE_TTL || '3600',
      ), // 1 hour default
      keyPrefix: process.env.VECTOR_SEARCH_CACHE_PREFIX || 'vectorsearch:',
    };
  }

  private loadQueryExpansionConfig(): QueryExpansionConfig {
    return {
      enabled: process.env.VECTOR_QUERY_EXPANSION_ENABLED !== 'false',
      maxExpansions: Number.parseInt(
        process.env.VECTOR_QUERY_MAX_EXPANSIONS || '3',
      ),
      synonyms: this.loadSynonyms(),
      domainTerms: this.loadDomainTerms(),
    };
  }

  private loadSynonyms(): Record<string, string[]> {
    try {
      const synonymsJson = process.env.VECTOR_SEARCH_SYNONYMS;
      if (synonymsJson) {
        return JSON.parse(synonymsJson);
      }
    } catch (error) {
      console.warn('Failed to parse VECTOR_SEARCH_SYNONYMS:', error);
    }

    // Default synonyms for common technical terms
    return {
      ai: ['artificial intelligence', 'machine learning', 'ml'],
      api: ['application programming interface', 'endpoint', 'service'],
      db: ['database', 'storage', 'data store'],
      ui: ['user interface', 'frontend', 'client'],
      config: ['configuration', 'settings', 'options'],
      auth: ['authentication', 'authorization', 'login'],
      error: ['exception', 'failure', 'bug', 'issue'],
      performance: ['speed', 'optimization', 'efficiency'],
    };
  }

  private loadDomainTerms(): Record<string, string[]> {
    try {
      const domainTermsJson = process.env.VECTOR_SEARCH_DOMAIN_TERMS;
      if (domainTermsJson) {
        return JSON.parse(domainTermsJson);
      }
    } catch (error) {
      console.warn('Failed to parse VECTOR_SEARCH_DOMAIN_TERMS:', error);
    }

    // Default domain-specific terms
    return {
      technical: [
        'implementation',
        'architecture',
        'infrastructure',
        'deployment',
      ],
      business: ['requirements', 'stakeholders', 'objectives', 'deliverables'],
      development: ['coding', 'programming', 'debugging', 'testing'],
      documentation: ['manual', 'guide', 'specification', 'reference'],
    };
  }

  private async initializeRedis(): Promise<void> {
    if (!this.config.cache.enabled || !process.env.REDIS_URL) {
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
        console.error('Redis connection error:', error);
        this.redisClient = null;
      });

      this.redisClient.on('connect', () => {
        console.log('Redis connected for vector search cache');
      });

      await this.redisClient.connect();
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.redisClient = null;
    }
  }

  // Public getters for configuration values
  public getConfig(): VectorSearchConfig {
    return { ...this.config };
  }

  public getSimilarityConfig(): SimilarityConfig {
    return { ...this.config.similarity };
  }

  public getCacheConfig(): SearchCacheConfig {
    return { ...this.config.cache };
  }

  public getQueryExpansionConfig(): QueryExpansionConfig {
    return { ...this.config.queryExpansion };
  }

  public getRedisClient(): RedisClientType | null {
    return this.redisClient;
  }

  public isRedisAvailable(): boolean {
    return this.redisClient?.isReady ?? false;
  }

  public isCacheEnabled(): boolean {
    return this.config.cache.enabled && this.isRedisAvailable();
  }

  public isRerankingEnabled(): boolean {
    return this.config.rerankingEnabled;
  }

  public isAnalyticsEnabled(): boolean {
    return this.config.analyticsEnabled;
  }

  public getMaxResults(): number {
    return this.config.maxResults;
  }

  public getDefaultThreshold(): number {
    return this.config.defaultThreshold;
  }

  // Configuration validation
  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate similarity algorithm
    const validAlgorithms = ['cosine', 'euclidean', 'dot_product'];
    if (!validAlgorithms.includes(this.config.similarity.algorithm)) {
      errors.push(
        `Invalid similarity algorithm: ${this.config.similarity.algorithm}`,
      );
    }

    // Validate cache TTL
    if (this.config.cache.ttlSeconds <= 0) {
      errors.push('Cache TTL must be positive');
    }

    // Validate max results
    if (this.config.maxResults <= 0 || this.config.maxResults > 1000) {
      errors.push('Max results must be between 1 and 1000');
    }

    // Validate threshold
    if (this.config.defaultThreshold < 0 || this.config.defaultThreshold > 1) {
      errors.push('Default threshold must be between 0 and 1');
    }

    // Validate query expansion settings
    if (
      this.config.queryExpansion.maxExpansions < 0 ||
      this.config.queryExpansion.maxExpansions > 10
    ) {
      errors.push('Max expansions must be between 0 and 10');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Dynamic configuration updates
  public updateConfig(updates: Partial<VectorSearchConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public updateSimilarityConfig(updates: Partial<SimilarityConfig>): void {
    this.config.similarity = { ...this.config.similarity, ...updates };
  }

  public updateCacheConfig(updates: Partial<SearchCacheConfig>): void {
    this.config.cache = { ...this.config.cache, ...updates };
  }

  public updateQueryExpansionConfig(
    updates: Partial<QueryExpansionConfig>,
  ): void {
    this.config.queryExpansion = { ...this.config.queryExpansion, ...updates };
  }

  // Cleanup method
  public async cleanup(): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        console.error('Error closing Redis connection:', error);
      }
      this.redisClient = null;
    }
  }
}

// Singleton instance for global access
export const searchConfig = SearchConfig.getInstance();

// Helper function to get environment-specific configurations
export function getEnvironmentConfig(): Record<string, any> {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    vectorSearchEnabled: process.env.VECTOR_SEARCH_ENABLED !== 'false',
    vectorDimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS || '1024'),
    cohereApiKey: process.env.COHERE_API_KEY,
    redisUrl: process.env.REDIS_URL,
    postgresUrl: process.env.POSTGRES_URL,
    enableDebugLogging: process.env.VECTOR_SEARCH_DEBUG === 'true',
  };
}

// Configuration health check
export async function performConfigHealthCheck(): Promise<{
  status: 'healthy' | 'warning' | 'error';
  checks: Record<string, { status: string; message?: string }>;
}> {
  const checks: Record<string, { status: string; message?: string }> = {};

  // Check Redis connection
  if (searchConfig.isCacheEnabled()) {
    try {
      const redisClient = searchConfig.getRedisClient();
      if (redisClient?.isReady) {
        await redisClient.ping();
        checks.redis = { status: 'healthy' };
      } else {
        checks.redis = { status: 'warning', message: 'Redis not connected' };
      }
    } catch (error) {
      checks.redis = { status: 'error', message: `Redis error: ${error}` };
    }
  } else {
    checks.redis = { status: 'disabled' };
  }

  // Check configuration validation
  const validation = searchConfig.validateConfig();
  checks.config = validation.isValid
    ? { status: 'healthy' }
    : { status: 'error', message: validation.errors.join(', ') };

  // Check required environment variables
  const envConfig = getEnvironmentConfig();
  checks.environment = {
    status: envConfig.postgresUrl ? 'healthy' : 'error',
    message: envConfig.postgresUrl ? undefined : 'POSTGRES_URL not configured',
  };

  // Determine overall status
  const hasErrors = Object.values(checks).some(
    (check) => check.status === 'error',
  );
  const hasWarnings = Object.values(checks).some(
    (check) => check.status === 'warning',
  );

  const status = hasErrors ? 'error' : hasWarnings ? 'warning' : 'healthy';

  return { status, checks };
}
