/**
 * Enhanced Monitoring Logger for Slice 19
 *
 * Extends the existing logger with Pino-based structured logging
 * and advanced monitoring capabilities for Inngest workflows.
 */

import pino from 'pino';
import { features } from '@/lib/config/feature-flags';
import { logger as baseLogger } from './logger';

// Create Pino logger configuration based on environment
const createPinoConfig = (): pino.LoggerOptions => ({
  level: process.env.LOG_LEVEL || 'info',
  // Use pretty printing in development, JSON in production
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: true },
        }
      : undefined,
  // Add base fields for all logs
  base: {
    pid: process.pid,
    environment: process.env.NODE_ENV || 'development',
    service: 'rra-v2',
    version: process.env.npm_package_version || '1.0.0',
  },
  // Timestamp configuration
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Create the enhanced Pino logger instance
const pinoLogger = pino(createPinoConfig());

// Export types for consistency
export type LoggerInstance = typeof pinoLogger;
export type LogContext = Record<string, any>;

// Metric logging structure for Slice 19
export interface MetricLog {
  metric: true;
  metricName: string;
  metricValue: number;
  tags?: Record<string, string | number>;
  timestamp?: string;
}

// Inngest-specific logging context
export interface InngestContext {
  functionName: string;
  documentId?: string;
  userId?: string;
  eventId?: string;
  runId?: string;
  attemptNumber?: number;
}

/**
 * Enhanced Monitoring Logger for Slice 19 requirements
 */
export class EnhancedMonitoringLogger {
  protected pino: LoggerInstance;
  protected context: LogContext;

  constructor(
    baseLogger: LoggerInstance = pinoLogger,
    context: LogContext = {},
  ) {
    this.pino = baseLogger;
    this.context = context;
  }

  /**
   * Get the Pino logger instance (for extending classes)
   */
  getPinoLogger(): LoggerInstance {
    return this.pino;
  }

  /**
   * Get the current context (for extending classes)
   */
  getContext(): LogContext {
    return this.context;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): EnhancedMonitoringLogger {
    return new EnhancedMonitoringLogger(this.pino.child(context), {
      ...this.context,
      ...context,
    });
  }

  /**
   * Create an Inngest-specific logger
   */
  forInngest(inngestContext: InngestContext): InngestLogger {
    return new InngestLogger(this.child(inngestContext), inngestContext);
  }

  /**
   * Log a metric with structured format for monitoring systems
   */
  metric(
    metricData: Omit<MetricLog, 'metric' | 'timestamp'>,
    message?: string,
  ): void {
    if (!features.shouldCollectMetrics()) {
      return;
    }

    const metricLog: MetricLog = {
      metric: true,
      timestamp: new Date().toISOString(),
      ...metricData,
    };

    this.pino.info(metricLog, message || `Metric: ${metricData.metricName}`);
  }

  /**
   * Log performance timing with metrics
   */
  timing(name: string, durationMs: number, context: LogContext = {}): void {
    // Log to existing base logger for compatibility
    baseLogger.performance(name, durationMs, context);

    // Log structured metric for monitoring
    this.metric({
      metricName: 'operation_duration_ms',
      metricValue: durationMs,
      tags: {
        operation: name,
        ...Object.fromEntries(
          Object.entries(context).map(([k, v]) => [k, String(v)]),
        ),
      },
    });
  }

  /**
   * Log error with enhanced context and metrics
   */
  error(error: Error | any, message?: string, context: LogContext = {}): void {
    const errorContext = {
      error: {
        name: error?.name || 'UnknownError',
        message: error?.message || String(error),
        stack: error?.stack,
        code: error?.code,
      },
      ...this.context,
      ...context,
    };

    this.pino.error(errorContext, message || 'Error occurred');

    // Log to base logger for compatibility
    baseLogger.error(message || 'Error occurred', error, context);

    // Log error metric if enabled
    if (features.shouldCollectMetrics()) {
      this.metric({
        metricName: 'error_count',
        metricValue: 1,
        tags: {
          errorType: error?.name || 'UnknownError',
          errorCode: error?.code || 'unknown',
          operation: context.operation || this.context.operation || 'unknown',
        },
      });
    }
  }

  /**
   * Log success with optional metrics
   */
  success(message: string, context: LogContext = {}): void {
    this.pino.info({ success: true, ...this.context, ...context }, message);
    baseLogger.info(message, context);

    if (features.shouldCollectMetrics()) {
      this.metric({
        metricName: 'success_count',
        metricValue: 1,
        tags: {
          operation: context.operation || this.context.operation || 'unknown',
        },
      });
    }
  }

  /**
   * Standard logging methods with fallback to base logger
   */
  debug(message: string, context: LogContext = {}): void {
    if (features.isDetailedLoggingEnabled()) {
      this.pino.debug({ ...this.context, ...context }, message);
      baseLogger.debug(message, context);
    }
  }

  info(message: string, context: LogContext = {}): void {
    this.pino.info({ ...this.context, ...context }, message);
    baseLogger.info(message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.pino.warn({ ...this.context, ...context }, message);
    baseLogger.warn(message, context);
  }
}

/**
 * Inngest-specific logger for workflow monitoring
 */
export class InngestLogger extends EnhancedMonitoringLogger {
  protected inngestContext: InngestContext;

  constructor(
    baseLogger: EnhancedMonitoringLogger,
    inngestContext: InngestContext,
  ) {
    super(baseLogger.getPinoLogger(), baseLogger.getContext());
    this.inngestContext = inngestContext;
  }

  /**
   * Get the Inngest context (for accessing function name, etc.)
   */
  getInngestContext(): InngestContext {
    return this.inngestContext;
  }

  /**
   * Log function start with context
   */
  functionStart(eventData?: any): void {
    this.info('Inngest function started', {
      functionStart: true,
      eventData: features.isDetailedLoggingEnabled() ? eventData : undefined,
    });

    this.metric({
      metricName: 'inngest_function_started',
      metricValue: 1,
      tags: {
        functionName: this.inngestContext.functionName,
        documentId: this.inngestContext.documentId || 'unknown',
      },
    });
  }

  /**
   * Log function completion with timing
   */
  functionComplete(durationMs: number, result?: any): void {
    this.info(`Inngest function completed in ${durationMs}ms`, {
      functionComplete: true,
      duration: durationMs,
      status: 'success',
      result: features.isDetailedLoggingEnabled() ? result : undefined,
    });

    // Log timing metric
    this.timing(`inngest.${this.inngestContext.functionName}`, durationMs, {
      functionName: this.inngestContext.functionName,
      documentId: this.inngestContext.documentId,
      status: 'success',
    });

    // Log success metric
    this.metric({
      metricName: 'inngest_function_success',
      metricValue: 1,
      tags: {
        functionName: this.inngestContext.functionName,
        documentId: this.inngestContext.documentId || 'unknown',
      },
    });
  }

  /**
   * Log function failure with error details
   */
  functionFail(error: Error | any, durationMs: number): void {
    this.error(error, `Inngest function failed after ${durationMs}ms`, {
      functionFailed: true,
      duration: durationMs,
      status: 'failed',
      functionName: this.inngestContext.functionName,
    });

    // Log failure metric
    this.metric({
      metricName: 'inngest_function_failure',
      metricValue: 1,
      tags: {
        functionName: this.inngestContext.functionName,
        documentId: this.inngestContext.documentId || 'unknown',
        errorType: error?.name || 'UnknownError',
      },
    });
  }

  /**
   * Log step execution within Inngest function
   */
  stepStart(stepName: string, context: LogContext = {}): StepLogger {
    return new StepLogger(this, stepName, context);
  }

  /**
   * Log processing metrics for document pipeline
   */
  documentProcessingMetric(
    stage: string,
    durationMs: number,
    status: 'success' | 'failed',
    additionalTags: Record<string, string | number> = {},
  ): void {
    this.metric({
      metricName: `document_processing_${stage}_duration_ms`,
      metricValue: durationMs,
      tags: {
        stage,
        status,
        functionName: this.inngestContext.functionName,
        documentId: this.inngestContext.documentId || 'unknown',
        ...additionalTags,
      },
    });

    // Also log success/failure count
    this.metric({
      metricName: `document_processing_${stage}_${status}_count`,
      metricValue: 1,
      tags: {
        stage,
        functionName: this.inngestContext.functionName,
        documentId: this.inngestContext.documentId || 'unknown',
        ...additionalTags,
      },
    });
  }
}

/**
 * Step Logger for tracking individual steps within Inngest functions
 */
export class StepLogger {
  private parent: InngestLogger;
  private stepName: string;
  private stepStartTime: number;
  private stepContext: LogContext;

  constructor(parent: InngestLogger, stepName: string, context: LogContext) {
    this.parent = parent;
    this.stepName = stepName;
    this.stepStartTime = Date.now();
    this.stepContext = context;

    this.parent.debug(`Step started: ${stepName}`, {
      step: stepName,
      stepStart: true,
      ...context,
    });
  }

  /**
   * Complete the step with success
   */
  complete(result: any = null): void {
    const stepDuration = Date.now() - this.stepStartTime;

    this.parent.debug(`Step completed: ${this.stepName} (${stepDuration}ms)`, {
      step: this.stepName,
      stepComplete: true,
      stepDuration,
      result: features.isDetailedLoggingEnabled() ? result : undefined,
      ...this.stepContext,
    });

    // Log step timing metric
    this.parent.timing(
      `inngest.${this.parent.getInngestContext().functionName}.${this.stepName}`,
      stepDuration,
      {
        step: this.stepName,
        status: 'success',
        ...this.stepContext,
      },
    );
  }

  /**
   * Fail the step with error
   */
  fail(error: Error | any): void {
    const stepDuration = Date.now() - this.stepStartTime;

    this.parent.error(
      error,
      `Step failed: ${this.stepName} (${stepDuration}ms)`,
      {
        step: this.stepName,
        stepFailed: true,
        stepDuration,
        status: 'failed',
        ...this.stepContext,
      },
    );

    // Log step failure metric
    this.parent.metric({
      metricName: 'inngest_step_failure',
      metricValue: 1,
      tags: {
        step: this.stepName,
        functionName: this.parent.getInngestContext().functionName,
        errorType: error?.name || 'UnknownError',
      },
    });
  }
}

// Create default enhanced logger instance
const defaultEnhancedLogger = new EnhancedMonitoringLogger();

// Export convenience functions
export const createInngestLogger = (context: InngestContext) =>
  defaultEnhancedLogger.forInngest(context);

export const createEnhancedLogger = (context: LogContext = {}) =>
  defaultEnhancedLogger.child(context);

// Export logger instances
export { defaultEnhancedLogger as enhancedLogger };
export { pinoLogger };

export default defaultEnhancedLogger;
