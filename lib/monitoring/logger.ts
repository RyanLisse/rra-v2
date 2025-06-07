import 'server-only';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  error?: Error;
  duration?: number;
  statusCode?: number;
}

export interface Logger {
  debug(message: string, metadata?: Record<string, any>): void;
  info(message: string, metadata?: Record<string, any>): void;
  warn(message: string, metadata?: Record<string, any>): void;
  error(message: string, error?: Error, metadata?: Record<string, any>): void;
  performance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>,
  ): void;
  setContext(context: Partial<LogEntry>): Logger;
}

class AppLogger implements Logger {
  private context: Partial<LogEntry> = {};
  private minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.INFO) {
    this.minLevel = minLevel;
  }

  setContext(context: Partial<LogEntry>): Logger {
    const newLogger = new AppLogger(this.minLevel);
    newLogger.context = { ...this.context, ...context };
    return newLogger;
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, undefined, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, undefined, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, undefined, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, error, metadata);
  }

  performance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>,
  ): void {
    this.log(LogLevel.INFO, `Performance: ${operation}`, undefined, {
      operation,
      duration,
      ...metadata,
    });
  }

  private log(
    level: LogLevel,
    message: string,
    error?: Error,
    metadata?: Record<string, any>,
  ): void {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'rra-v2',
      ...this.context,
      ...(metadata && { metadata }),
      ...(error && { error }),
    };

    // In development, log to console with formatting
    if (process.env.NODE_ENV === 'development') {
      this.logToConsole(entry);
    }

    // In production, send to logging service
    if (process.env.NODE_ENV === 'production') {
      this.logToService(entry);
    }

    // Always log errors to console for visibility
    if (level === LogLevel.ERROR) {
      console.error(entry);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const levelColors = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m', // Green
      [LogLevel.WARN]: '\x1b[33m', // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    };

    const reset = '\x1b[0m';
    const levelName = LogLevel[entry.level];
    const color = levelColors[entry.level];

    const prefix = `${color}[${entry.timestamp}] ${levelName}${reset}`;
    const context = entry.userId ? ` [User: ${entry.userId}]` : '';
    const request = entry.requestId ? ` [Request: ${entry.requestId}]` : '';

    console.log(`${prefix}${context}${request} ${entry.message}`);

    if (entry.metadata) {
      console.log('  Metadata:', entry.metadata);
    }

    if (entry.error) {
      console.error('  Error:', entry.error);
    }
  }

  private async logToService(entry: LogEntry): Promise<void> {
    try {
      // In a real application, you would send logs to a service like:
      // - Datadog, New Relic, LogRocket
      // - ELK Stack (Elasticsearch, Logstash, Kibana)
      // - CloudWatch, Google Cloud Logging
      // - Sentry for error tracking

      // For now, we'll use a simple HTTP endpoint or file logging
      if (process.env.LOG_ENDPOINT) {
        await fetch(process.env.LOG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
      }
    } catch (error) {
      // Don't throw on logging errors
      console.error('Failed to send log to service:', error);
    }
  }
}

// Singleton logger instance
export const logger = new AppLogger(
  process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
);

// Performance measurement utility
export function withPerformanceLogging<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>,
): Promise<T> {
  return (async (): Promise<T> => {
    const startTime = Date.now();
    const operationLogger = logger.setContext({ message: operation } as any);

    try {
      operationLogger.debug(`Starting ${operation}`);
      const result = await fn();
      const duration = Date.now() - startTime;

      operationLogger.performance(operation, duration, {
        success: true,
        ...metadata,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      operationLogger.performance(operation, duration, {
        success: false,
        ...metadata,
      });

      operationLogger.error(`Failed ${operation}`, error as Error);
      throw error;
    }
  })();
}

// Request logging middleware helper
export function createRequestLogger(requestId: string, userId?: string) {
  return logger.setContext({
    requestId,
    userId,
  });
}

// Database query logging
export function logDatabaseQuery(
  query: string,
  duration: number,
  rowCount?: number,
  error?: Error,
) {
  const metadata = {
    query: query.substring(0, 200), // Truncate long queries
    duration,
    rowCount,
  };

  if (error) {
    logger.error('Database query failed', error, metadata);
  } else {
    logger.performance('database_query', duration, metadata);
  }
}

// API endpoint logging
export function logAPIRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string,
  metadata?: Record<string, any>,
) {
  const requestLogger = userId ? logger.setContext({ userId }) : logger;

  requestLogger.info(`${method} ${path} ${statusCode}`, {
    method,
    path,
    statusCode,
    duration,
    ...metadata,
  });
}

// Error boundary logging
export function logComponentError(
  componentName: string,
  error: Error,
  errorInfo?: any,
) {
  logger.error(`Component error in ${componentName}`, error, {
    componentName,
    errorInfo,
  });
}
