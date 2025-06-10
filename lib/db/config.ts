/**
 * Database Configuration
 *
 * Centralized database configuration with environment variable support.
 * Handles connection pooling, timeouts, and performance tuning.
 */

import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * Database Connection Pool Configuration
 */
export const DB_CONNECTION_CONFIG = {
  // Maximum number of connections in the pool
  max: Number.parseInt(process.env.DB_POOL_MAX_CONNECTIONS || '20'),

  // Close idle connections after specified seconds
  idle_timeout: Number.parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '20'),

  // Connection timeout in seconds
  connect_timeout: Number.parseInt(process.env.DB_POOL_CONNECT_TIMEOUT || '10'),

  // Connection acquisition timeout (wait time for available connection)
  acquisition_timeout: Number.parseInt(
    process.env.DB_POOL_ACQUISITION_TIMEOUT || '30',
  ),

  // Minimum number of connections to maintain in pool
  min: Number.parseInt(process.env.DB_POOL_MIN_CONNECTIONS || '1'),

  // Disable prepared statements for better performance with connection pooling
  prepare: process.env.DB_POOL_PREPARE === 'true',

  // PostgreSQL compatibility settings
  transform: {
    undefined: null, // Transform undefined to null for better PostgreSQL compatibility
  },
} as const;

/**
 * Database Query Configuration
 */
export const DB_QUERY_CONFIG = {
  // Default query timeout in milliseconds
  queryTimeout: Number.parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),

  // Default statement timeout in milliseconds
  statementTimeout: Number.parseInt(
    process.env.DB_STATEMENT_TIMEOUT || '60000',
  ),

  // Lock timeout in milliseconds
  lockTimeout: Number.parseInt(process.env.DB_LOCK_TIMEOUT || '10000'),

  // Idle in transaction session timeout in milliseconds
  idleInTransactionTimeout: Number.parseInt(
    process.env.DB_IDLE_IN_TRANSACTION_TIMEOUT || '300000',
  ),
} as const;

/**
 * Database Monitoring Configuration
 */
export const DB_MONITORING_CONFIG = {
  // Enable query logging in development
  enableLogging:
    process.env.DB_ENABLE_LOGGING === 'true' ||
    process.env.NODE_ENV === 'development',

  // Log slow queries (in milliseconds)
  slowQueryThreshold: Number.parseInt(
    process.env.DB_SLOW_QUERY_THRESHOLD || '1000',
  ),

  // Enable connection monitoring
  enableConnectionMonitoring:
    process.env.DB_ENABLE_CONNECTION_MONITORING === 'true',

  // Health check interval in milliseconds
  healthCheckInterval: Number.parseInt(
    process.env.DB_HEALTH_CHECK_INTERVAL || '30000',
  ),
} as const;

/**
 * Environment-specific database configuration
 */
export const DB_ENVIRONMENT_CONFIG = {
  development: {
    max: 5, // Lower connection count for development
    idle_timeout: 10,
    enableLogging: true,
    slowQueryThreshold: 500, // More aggressive slow query detection
  },

  test: {
    max: 2, // Minimal connections for testing
    idle_timeout: 5,
    enableLogging: false,
    queryTimeout: 10000, // Shorter timeouts for tests
  },

  production: {
    max: 30, // Higher connection count for production
    idle_timeout: 30,
    enableLogging: false,
    slowQueryThreshold: 2000, // Less aggressive in production
    enableConnectionMonitoring: true,
  },
} as const;

/**
 * Get environment-aware database configuration
 */
export function getDatabaseConfig() {
  const env = process.env.NODE_ENV as keyof typeof DB_ENVIRONMENT_CONFIG;
  const envOverrides = DB_ENVIRONMENT_CONFIG[env] || {};

  return {
    connection: { ...DB_CONNECTION_CONFIG, ...envOverrides },
    query: DB_QUERY_CONFIG,
    monitoring: { ...DB_MONITORING_CONFIG, ...envOverrides },
  };
}

/**
 * Validate database configuration
 */
export function validateDatabaseConfig() {
  const config = getDatabaseConfig();
  const errors: string[] = [];

  // Validate connection pool settings
  if (config.connection.max < 1 || config.connection.max > 100) {
    errors.push(
      `Invalid max connections: ${config.connection.max}. Must be between 1 and 100.`,
    );
  }

  if (config.connection.min && config.connection.min >= config.connection.max) {
    errors.push(
      `Min connections (${config.connection.min}) must be less than max connections (${config.connection.max}).`,
    );
  }

  if (
    config.connection.idle_timeout < 1 ||
    config.connection.idle_timeout > 3600
  ) {
    errors.push(
      `Invalid idle timeout: ${config.connection.idle_timeout}. Must be between 1 and 3600 seconds.`,
    );
  }

  if (
    config.connection.connect_timeout < 1 ||
    config.connection.connect_timeout > 60
  ) {
    errors.push(
      `Invalid connect timeout: ${config.connection.connect_timeout}. Must be between 1 and 60 seconds.`,
    );
  }

  // Validate query timeouts
  if (config.query.queryTimeout < 1000 || config.query.queryTimeout > 300000) {
    errors.push(
      `Invalid query timeout: ${config.query.queryTimeout}. Must be between 1000 and 300000 milliseconds.`,
    );
  }

  if (
    config.query.statementTimeout < 1000 ||
    config.query.statementTimeout > 600000
  ) {
    errors.push(
      `Invalid statement timeout: ${config.query.statementTimeout}. Must be between 1000 and 600000 milliseconds.`,
    );
  }

  // Validate PostgreSQL URL
  if (!process.env.POSTGRES_URL) {
    errors.push('POSTGRES_URL environment variable is required.');
  }

  if (errors.length > 0) {
    throw new Error(
      `Database configuration validation failed:\n${errors.join('\n')}`,
    );
  }

  return true;
}

/**
 * Get PostgreSQL connection string with query parameters
 */
export function getConnectionString(): string {
  if (!process.env.POSTGRES_URL) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  const config = getDatabaseConfig();
  const url = new URL(process.env.POSTGRES_URL);

  // Add query parameters for timeouts
  url.searchParams.set(
    'statement_timeout',
    config.query.statementTimeout.toString(),
  );
  url.searchParams.set('lock_timeout', config.query.lockTimeout.toString());
  url.searchParams.set(
    'idle_in_transaction_session_timeout',
    config.query.idleInTransactionTimeout.toString(),
  );

  // Add SSL settings for production
  if (
    process.env.NODE_ENV === 'production' &&
    !url.searchParams.has('sslmode')
  ) {
    url.searchParams.set('sslmode', 'require');
  }

  return url.toString();
}

/**
 * Log database configuration (safe for logging - no sensitive data)
 */
export function logDatabaseConfig() {
  const config = getDatabaseConfig();

  console.log('Database Configuration:', {
    environment: process.env.NODE_ENV,
    connection: {
      maxConnections: config.connection.max,
      minConnections: config.connection.min,
      idleTimeout: `${config.connection.idle_timeout}s`,
      connectTimeout: `${config.connection.connect_timeout}s`,
      preparedStatements: config.connection.prepare,
    },
    query: {
      queryTimeout: `${config.query.queryTimeout}ms`,
      statementTimeout: `${config.query.statementTimeout}ms`,
      lockTimeout: `${config.query.lockTimeout}ms`,
    },
    monitoring: {
      loggingEnabled: config.monitoring.enableLogging,
      slowQueryThreshold: `${config.monitoring.slowQueryThreshold}ms`,
      connectionMonitoring: config.monitoring.enableConnectionMonitoring,
    },
  });
}

/**
 * Database instance
 */
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
export const db = drizzle(client);
