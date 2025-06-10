/**
 * Feature Flags Configuration
 *
 * Controls the gradual rollout of integrated features in the RAG pipeline.
 * These flags allow for safe deployment and testing of new functionality.
 */

export interface FeatureFlags {
  // Pipeline Processing
  useInngestPipeline: boolean;
  enablePdfToImageConversion: boolean;
  enableMultimodalEmbeddings: boolean;

  // External API Integration
  useRealAdeProcessing: boolean;
  enableCohereImageEmbeddings: boolean;

  // Processing Options
  maxConcurrentDocuments: number;
  enableBatchProcessing: boolean;
  batchSize: number;

  // Monitoring & Debug
  enableDetailedLogging: boolean;
  enableProcessingMetrics: boolean;
}

/**
 * Get feature flag configuration from environment variables or defaults
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    // Pipeline Processing - Start with Inngest disabled for safety
    useInngestPipeline: process.env.ENABLE_INNGEST_PIPELINE === 'true',
    enablePdfToImageConversion: process.env.ENABLE_PDF_TO_IMAGE === 'true',
    enableMultimodalEmbeddings:
      process.env.ENABLE_MULTIMODAL_EMBEDDINGS === 'true',

    // External API Integration
    useRealAdeProcessing: process.env.ENABLE_REAL_ADE === 'true',
    enableCohereImageEmbeddings: process.env.ENABLE_COHERE_IMAGES === 'true',

    // Processing Options
    maxConcurrentDocuments: Number.parseInt(
      process.env.MAX_CONCURRENT_DOCUMENTS || '3',
    ),
    enableBatchProcessing: process.env.ENABLE_BATCH_PROCESSING === 'true',
    batchSize: Number.parseInt(process.env.BATCH_SIZE || '10'),

    // Monitoring & Debug
    enableDetailedLogging: process.env.ENABLE_DETAILED_LOGGING === 'true',
    enableProcessingMetrics: process.env.ENABLE_PROCESSING_METRICS === 'true',
  };
}

/**
 * Feature flag checks for specific functionality
 */
export const features = {
  /**
   * Check if the async Inngest pipeline should be used
   * When false, falls back to direct API processing
   */
  shouldUseInngestPipeline(): boolean {
    return getFeatureFlags().useInngestPipeline;
  },

  /**
   * Check if PDF to image conversion should be enabled
   */
  shouldConvertPdfToImages(): boolean {
    return getFeatureFlags().enablePdfToImageConversion;
  },

  /**
   * Check if multimodal embeddings should be generated
   */
  shouldGenerateMultimodalEmbeddings(): boolean {
    return getFeatureFlags().enableMultimodalEmbeddings;
  },

  /**
   * Check if real ADE API should be used instead of simulation
   */
  shouldUseRealAde(): boolean {
    return getFeatureFlags().useRealAdeProcessing;
  },

  /**
   * Check if Cohere image embeddings are available
   */
  areCohereImageEmbeddingsAvailable(): boolean {
    return getFeatureFlags().enableCohereImageEmbeddings;
  },

  /**
   * Get processing configuration
   */
  getProcessingConfig() {
    const flags = getFeatureFlags();
    return {
      maxConcurrent: flags.maxConcurrentDocuments,
      batchEnabled: flags.enableBatchProcessing,
      batchSize: flags.batchSize,
    };
  },

  /**
   * Check if detailed logging is enabled
   */
  isDetailedLoggingEnabled(): boolean {
    return getFeatureFlags().enableDetailedLogging;
  },

  /**
   * Check if processing metrics should be collected
   */
  shouldCollectMetrics(): boolean {
    return getFeatureFlags().enableProcessingMetrics;
  },
};

/**
 * Example environment variables for .env.local:
 *
 * # Feature Flags for Production Rollout
 * ENABLE_INNGEST_PIPELINE=false
 * ENABLE_PDF_TO_IMAGE=false
 * ENABLE_MULTIMODAL_EMBEDDINGS=false
 * ENABLE_REAL_ADE=false
 * ENABLE_COHERE_IMAGES=false
 * MAX_CONCURRENT_DOCUMENTS=3
 * ENABLE_BATCH_PROCESSING=false
 * BATCH_SIZE=10
 * ENABLE_DETAILED_LOGGING=false
 * ENABLE_PROCESSING_METRICS=false
 */
