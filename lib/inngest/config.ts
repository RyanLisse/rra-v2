/**
 * Inngest Configuration
 *
 * Centralized configuration for all Inngest functions with environment variable support.
 * Allows runtime configuration of concurrency, rate limits, timeouts, and retries.
 */

/**
 * PDF to Images Function Configuration
 */
export const PDF_TO_IMAGES_CONFIG = {
  retries: Math.min(
    20,
    Math.max(
      0,
      Number.parseInt(process.env.INNGEST_PDF_CONVERSION_RETRIES || '3'),
    ),
  ) as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20,
  concurrency: {
    limit: Number.parseInt(
      process.env.INNGEST_PDF_CONVERSION_CONCURRENCY || '3',
    ),
  },
  rateLimit: {
    limit: Number.parseInt(
      process.env.INNGEST_PDF_CONVERSION_RATE_LIMIT || '10',
    ),
    period: (process.env.INNGEST_PDF_CONVERSION_RATE_PERIOD || '1m') as '1m',
  },
  timeouts: {
    start: (process.env.INNGEST_PDF_CONVERSION_TIMEOUT || '10m') as '10m',
  },
} as const;

/**
 * Multimodal Embeddings Function Configuration
 */
export const MULTIMODAL_EMBEDDINGS_CONFIG = {
  retries: Math.min(
    20,
    Math.max(0, Number.parseInt(process.env.INNGEST_EMBEDDINGS_RETRIES || '2')),
  ) as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20,
  concurrency: {
    limit: Number.parseInt(process.env.INNGEST_EMBEDDINGS_CONCURRENCY || '2'),
  },
  rateLimit: {
    limit: Number.parseInt(process.env.INNGEST_EMBEDDINGS_RATE_LIMIT || '3'),
    period: (process.env.INNGEST_EMBEDDINGS_RATE_PERIOD || '1m') as '1m',
  },
  timeouts: {
    start: (process.env.INNGEST_EMBEDDINGS_TIMEOUT || '20m') as '20m',
  },
} as const;

/**
 * ADE Processing Function Configuration
 */
export const ADE_PROCESSING_CONFIG = {
  retries: Math.min(
    20,
    Math.max(0, Number.parseInt(process.env.INNGEST_ADE_RETRIES || '2')),
  ) as
    | 0
    | 1
    | 2
    | 3
    | 4
    | 5
    | 6
    | 7
    | 8
    | 9
    | 10
    | 11
    | 12
    | 13
    | 14
    | 15
    | 16
    | 17
    | 18
    | 19
    | 20,
  concurrency: {
    limit: Number.parseInt(process.env.INNGEST_ADE_CONCURRENCY || '2'),
  },
  rateLimit: {
    limit: Number.parseInt(process.env.INNGEST_ADE_RATE_LIMIT || '5'),
    period: (process.env.INNGEST_ADE_RATE_PERIOD || '1m') as '1m',
  },
  timeouts: {
    start: (process.env.INNGEST_ADE_TIMEOUT || '15m') as '15m',
  },
} as const;

/**
 * General Inngest Configuration
 */
export const INNGEST_GENERAL_CONFIG = {
  // Default retry configuration
  defaultRetries: Number.parseInt(process.env.INNGEST_DEFAULT_RETRIES || '3'),

  // Default concurrency limits
  defaultConcurrency: Number.parseInt(
    process.env.INNGEST_DEFAULT_CONCURRENCY || '5',
  ),

  // Default rate limiting
  defaultRateLimit: Number.parseInt(
    process.env.INNGEST_DEFAULT_RATE_LIMIT || '10',
  ),
  defaultRatePeriod: process.env.INNGEST_DEFAULT_RATE_PERIOD || '1m',

  // Default timeout
  defaultTimeout: process.env.INNGEST_DEFAULT_TIMEOUT || '5m',

  // Environment-specific settings
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Performance tuning
  highConcurrencyLimit: Number.parseInt(
    process.env.INNGEST_HIGH_CONCURRENCY_LIMIT || '10',
  ),
  lowConcurrencyLimit: Number.parseInt(
    process.env.INNGEST_LOW_CONCURRENCY_LIMIT || '1',
  ),
} as const;

/**
 * Environment-aware configuration getter
 * Adjusts limits based on environment (development vs production)
 */
export function getEnvironmentAwareConfig<T extends Record<string, any>>(
  baseConfig: T,
  environmentOverrides: {
    development?: Partial<T>;
    production?: Partial<T>;
  } = {},
): T {
  const env = process.env.NODE_ENV;

  if (env === 'development' && environmentOverrides.development) {
    return { ...baseConfig, ...environmentOverrides.development };
  }

  if (env === 'production' && environmentOverrides.production) {
    return { ...baseConfig, ...environmentOverrides.production };
  }

  return baseConfig;
}

/**
 * Validate Inngest configuration values
 */
export function validateInngestConfig() {
  const configs = [
    PDF_TO_IMAGES_CONFIG,
    MULTIMODAL_EMBEDDINGS_CONFIG,
    ADE_PROCESSING_CONFIG,
  ];

  const errors: string[] = [];

  for (const config of configs) {
    // Validate retry counts
    if (config.retries < 0 || config.retries > 10) {
      errors.push(
        `Invalid retry count: ${config.retries}. Must be between 0 and 10.`,
      );
    }

    // Validate concurrency limits
    if (config.concurrency.limit < 1 || config.concurrency.limit > 50) {
      errors.push(
        `Invalid concurrency limit: ${config.concurrency.limit}. Must be between 1 and 50.`,
      );
    }

    // Validate rate limits
    if (config.rateLimit.limit < 1 || config.rateLimit.limit > 1000) {
      errors.push(
        `Invalid rate limit: ${config.rateLimit.limit}. Must be between 1 and 1000.`,
      );
    }

    // Validate timeout format
    if (!config.timeouts.start.match(/^\d+[smh]$/)) {
      errors.push(
        `Invalid timeout format: ${config.timeouts.start}. Must be in format like '10m', '30s', '2h'.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Inngest configuration validation failed:\n${errors.join('\n')}`,
    );
  }

  return true;
}

/**
 * Get configuration for specific function type
 */
export function getFunctionConfig(
  functionType: 'pdf-conversion' | 'embeddings' | 'ade-processing',
) {
  switch (functionType) {
    case 'pdf-conversion':
      return getEnvironmentAwareConfig(PDF_TO_IMAGES_CONFIG, {
        development: { concurrency: { limit: 1 } }, // Lower concurrency in dev
        production: { concurrency: { limit: 5 } }, // Higher concurrency in prod
      });

    case 'embeddings':
      return getEnvironmentAwareConfig(MULTIMODAL_EMBEDDINGS_CONFIG, {
        development: { rateLimit: { limit: 1, period: '1m' as const } }, // Very conservative in dev
        production: { rateLimit: { limit: 10, period: '1m' as const } }, // More aggressive in prod
      });

    case 'ade-processing':
      // For ADE processing, just return the base config since timeout overrides cause type issues
      return ADE_PROCESSING_CONFIG;

    default:
      throw new Error(`Unknown function type: ${functionType}`);
  }
}
