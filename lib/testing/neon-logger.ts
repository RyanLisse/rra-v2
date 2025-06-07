/**
 * Logging and monitoring utilities for Neon API operations
 */

export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  operation: string;
  message: string;
  metadata?: Record<string, any>;
  duration_ms?: number;
  error?: string;
}

export interface PerformanceMetrics {
  operation: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  lastExecuted: string;
}

/**
 * Enhanced logger for Neon API operations
 */
export class NeonLogger {
  private logs: LogEntry[] = [];
  private metrics = new Map<
    string,
    {
      count: number;
      totalDuration: number;
      minDuration: number;
      maxDuration: number;
      successCount: number;
      lastExecuted: string;
    }
  >();
  private readonly maxLogs: number;
  private readonly enableConsoleOutput: boolean;

  constructor(
    maxLogs = 1000,
    enableConsoleOutput: boolean = process.env.NODE_ENV !== 'production',
  ) {
    this.maxLogs = maxLogs;
    this.enableConsoleOutput = enableConsoleOutput;
  }

  /**
   * Log a debug message
   */
  debug(
    operation: string,
    message: string,
    metadata?: Record<string, any>,
  ): void {
    this.log('debug', operation, message, metadata);
  }

  /**
   * Log an info message
   */
  info(
    operation: string,
    message: string,
    metadata?: Record<string, any>,
  ): void {
    this.log('info', operation, message, metadata);
  }

  /**
   * Log a warning message
   */
  warn(
    operation: string,
    message: string,
    metadata?: Record<string, any>,
  ): void {
    this.log('warn', operation, message, metadata);
  }

  /**
   * Log an error message
   */
  error(
    operation: string,
    message: string,
    error?: Error,
    metadata?: Record<string, any>,
  ): void {
    this.log(
      'error',
      operation,
      message,
      {
        ...metadata,
        error: error?.message,
        stack: error?.stack,
      },
      undefined,
      error?.message,
    );
  }

  /**
   * Log the start of an operation
   */
  startOperation(
    operation: string,
    message: string,
    metadata?: Record<string, any>,
  ): string {
    const operationId = `${operation}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.log('info', operation, `Starting: ${message}`, {
      ...metadata,
      operationId,
      phase: 'start',
    });
    return operationId;
  }

  /**
   * Log the completion of an operation
   */
  completeOperation(
    operationId: string,
    operation: string,
    success: boolean,
    duration: number,
    message?: string,
    metadata?: Record<string, any>,
  ): void {
    const level = success ? 'info' : 'error';
    const statusMessage =
      message ||
      (success ? 'Operation completed successfully' : 'Operation failed');

    this.log(
      level,
      operation,
      statusMessage,
      {
        ...metadata,
        operationId,
        phase: 'complete',
        success,
        duration_ms: duration,
      },
      duration,
    );

    // Update metrics
    this.updateMetrics(operation, duration, success);
  }

  /**
   * Get recent logs
   */
  getLogs(limit?: number, level?: LogEntry['level']): LogEntry[] {
    let filteredLogs = this.logs;

    if (level) {
      filteredLogs = this.logs.filter((log) => log.level === level);
    }

    return limit ? filteredLogs.slice(-limit) : filteredLogs;
  }

  /**
   * Get performance metrics for operations
   */
  getMetrics(operation?: string): PerformanceMetrics[] {
    const metricsEntries = operation
      ? [[operation, this.metrics.get(operation)]]
      : Array.from(this.metrics.entries());

    return metricsEntries
      .filter(([, data]) => data !== undefined)
      .map(([op, data]) => ({
        operation: op,
        count: data.count,
        totalDuration: data.totalDuration,
        avgDuration: Math.round(data.totalDuration / data.count),
        minDuration: data.minDuration,
        maxDuration: data.maxDuration,
        successRate: Math.round((data.successCount / data.count) * 100) / 100,
        lastExecuted: data.lastExecuted,
      }));
  }

  /**
   * Get error summary
   */
  getErrorSummary(since?: Date): {
    totalErrors: number;
    errorsByOperation: Record<string, number>;
    recentErrors: LogEntry[];
  } {
    const sinceTime = since?.getTime() || 0;
    const errors = this.logs.filter(
      (log) =>
        log.level === 'error' && new Date(log.timestamp).getTime() >= sinceTime,
    );

    const errorsByOperation: Record<string, number> = {};
    errors.forEach((error) => {
      errorsByOperation[error.operation] =
        (errorsByOperation[error.operation] || 0) + 1;
    });

    return {
      totalErrors: errors.length,
      errorsByOperation,
      recentErrors: errors.slice(-10),
    };
  }

  /**
   * Clear logs and metrics
   */
  clear(): void {
    this.logs = [];
    this.metrics.clear();
  }

  /**
   * Export logs and metrics for external analysis
   */
  export(): {
    logs: LogEntry[];
    metrics: PerformanceMetrics[];
    exportedAt: string;
  } {
    return {
      logs: this.logs,
      metrics: this.getMetrics(),
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import logs and metrics from external source
   */
  import(data: { logs: LogEntry[]; metrics?: PerformanceMetrics[] }): void {
    this.logs = data.logs;

    if (data.metrics) {
      this.metrics.clear();
      data.metrics.forEach((metric) => {
        this.metrics.set(metric.operation, {
          count: metric.count,
          totalDuration: metric.totalDuration,
          minDuration: metric.minDuration,
          maxDuration: metric.maxDuration,
          successCount: Math.round(metric.count * metric.successRate),
          lastExecuted: metric.lastExecuted,
        });
      });
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogEntry['level'],
    operation: string,
    message: string,
    metadata?: Record<string, any>,
    duration?: number,
    error?: string,
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      operation,
      message,
      metadata,
      duration_ms: duration,
      error,
    };

    this.logs.push(logEntry);

    // Limit log size
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output in development
    if (this.enableConsoleOutput) {
      const prefix = `[Neon:${operation}]`;
      const fullMessage = metadata
        ? `${message} ${JSON.stringify(metadata)}`
        : message;

      switch (level) {
        case 'debug':
          console.debug(prefix, fullMessage);
          break;
        case 'info':
          console.info(prefix, fullMessage);
          break;
        case 'warn':
          console.warn(prefix, fullMessage);
          break;
        case 'error':
          console.error(prefix, fullMessage, error);
          break;
      }
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(
    operation: string,
    duration: number,
    success: boolean,
  ): void {
    const existing = this.metrics.get(operation);

    if (existing) {
      existing.count++;
      existing.totalDuration += duration;
      existing.minDuration = Math.min(existing.minDuration, duration);
      existing.maxDuration = Math.max(existing.maxDuration, duration);
      if (success) existing.successCount++;
      existing.lastExecuted = new Date().toISOString();
    } else {
      this.metrics.set(operation, {
        count: 1,
        totalDuration: duration,
        minDuration: duration,
        maxDuration: duration,
        successCount: success ? 1 : 0,
        lastExecuted: new Date().toISOString(),
      });
    }
  }
}

/**
 * Global logger instance
 */
let globalLogger: NeonLogger | null = null;

/**
 * Get or create the global logger instance
 */
export function getNeonLogger(): NeonLogger {
  if (!globalLogger) {
    globalLogger = new NeonLogger();
  }
  return globalLogger;
}

/**
 * Reset the global logger (useful for testing)
 */
export function resetNeonLogger(): void {
  globalLogger = null;
}

/**
 * Utility decorator for timing operations
 */
export function timed(operation: string) {
  return <T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyName: string,
    descriptor: TypedPropertyDescriptor<T>,
  ) => {
    const method = descriptor.value!;

    descriptor.value = async function (...args: any[]) {
      const logger = getNeonLogger();
      const operationId = logger.startOperation(
        operation,
        `${target.constructor.name}.${propertyName}`,
      );
      const startTime = Date.now();

      try {
        const result = await method.apply(this, args);
        const duration = Date.now() - startTime;
        logger.completeOperation(operationId, operation, true, duration);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.completeOperation(
          operationId,
          operation,
          false,
          duration,
          (error as Error).message,
        );
        throw error;
      }
    } as T;

    return descriptor;
  };
}
