/**
 * Inngest Utility Functions
 *
 * This file contains utility functions for working with Inngest events and workflows.
 * These utilities help maintain consistency across function implementations.
 */

import { inngest } from './client';
import {
  type EventPayload,
  type EventName,
  type BaseEventPayload,
  DocumentStatus,
} from './types';
// Database imports are only used when actually interacting with the database
// This allows the utilities to be imported for configuration without requiring DB connection

/**
 * Send an Inngest event with proper typing and error handling
 */
export async function sendEvent<T extends EventPayload>(
  eventName: EventName,
  payload: T,
): Promise<void> {
  try {
    await inngest.send({
      name: eventName,
      data: payload,
    });
  } catch (error) {
    console.error(`Failed to send event ${eventName}:`, error);
    throw new Error(
      `Event sending failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Create a base event payload with common fields
 */
export function createBaseEventPayload(
  userId?: string,
  sessionId?: string,
): BaseEventPayload {
  return {
    eventId: crypto.randomUUID(),
    timestamp: Date.now(),
    userId,
    sessionId,
  };
}

/**
 * Update document status in the database
 */
export async function updateDocumentStatus(
  documentId: string,
  status: DocumentStatus,
  errorMessage?: string,
): Promise<void> {
  try {
    // Dynamic import to avoid requiring DB connection at module load
    const { db } = await import('@/lib/db');
    const { ragDocument } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    // Add error information for failed statuses
    if (errorMessage && status.includes('failed')) {
      updateData.error = errorMessage;
    }

    await db
      .update(ragDocument)
      .set(updateData)
      .where(eq(ragDocument.id, documentId));

    console.log(`Document ${documentId} status updated to: ${status}`);
  } catch (error) {
    console.error(`Failed to update document status for ${documentId}:`, error);
    throw new Error(
      `Database update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Get document information from the database
 */
export async function getDocumentInfo(documentId: string) {
  try {
    // Dynamic import to avoid requiring DB connection at module load
    const { db } = await import('@/lib/db');
    const { ragDocument } = await import('@/lib/db/schema');
    const { eq } = await import('drizzle-orm');

    const document = await db.query.ragDocument.findFirst({
      where: eq(ragDocument.id, documentId),
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    return document;
  } catch (error) {
    console.error(`Failed to get document info for ${documentId}:`, error);
    throw error;
  }
}

/**
 * Calculate processing duration between two timestamps
 */
export function calculateDuration(startTime: number, endTime?: number): number {
  const end = endTime || Date.now();
  return end - startTime;
}

/**
 * Create a retry configuration for Inngest functions
 */
export function createRetryConfig(maxRetries = 3) {
  return {
    retries: maxRetries,
    backoff: {
      type: 'exponential' as const,
      base: 1000, // 1 second
      max: 30000, // 30 seconds
    },
  };
}

/**
 * Create concurrency configuration for Inngest functions
 */
export function createConcurrencyConfig(limit = 5) {
  return {
    concurrency: {
      limit,
      key: 'documentId', // Use document ID as concurrency key
    },
  };
}

/**
 * Log function execution with structured data
 */
export function logFunctionExecution(
  functionName: string,
  documentId: string,
  step: string,
  data?: Record<string, any>,
) {
  const logData = {
    function: functionName,
    documentId,
    step,
    timestamp: new Date().toISOString(),
    ...data,
  };

  console.log(`[${functionName}] ${step}:`, JSON.stringify(logData, null, 2));
}

/**
 * Create error event payload for processing failures
 */
export function createErrorEventPayload(
  documentId: string,
  failedStep: 'upload' | 'text-extraction' | 'chunking' | 'embedding',
  error: Error,
  retryAttempt = 0,
  maxRetries = 3,
  userId?: string,
  sessionId?: string,
) {
  const basePayload = createBaseEventPayload(userId, sessionId);

  return {
    ...basePayload,
    documentId,
    failedStep,
    error: {
      message: error.message,
      code: error.name || 'UNKNOWN_ERROR',
      stack: error.stack,
    },
    status: `${failedStep.replace('-', '_')}_failed` as DocumentStatus,
    retryAttempt,
    maxRetries,
    isRetryable: retryAttempt < maxRetries,
  };
}

/**
 * Validate event payload structure
 */
export function validateEventPayload<T extends EventPayload>(
  payload: T,
  requiredFields: (keyof T)[],
): void {
  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      throw new Error(`Missing required field: ${String(field)}`);
    }
  }
}

/**
 * Get environment-specific configuration
 */
export function getInngestConfig() {
  return {
    isDevelopment: process.env.NODE_ENV === 'development',
    eventKey: process.env.INNGEST_EVENT_KEY || 'local',
    signingKey: process.env.INNGEST_SIGNING_KEY,
    baseUrl: process.env.INNGEST_BASE_URL,
    servePath: process.env.INNGEST_SERVE_PATH || '/api/inngest',
    appId: process.env.INNGEST_APP_ID || 'rra-v2-app',
    appName: process.env.INNGEST_APP_NAME || 'RRA V2 Document Processing',
    maxRetries: Number.parseInt(process.env.INNGEST_MAX_RETRIES || '3'),
    loggerLevel: process.env.INNGEST_LOGGER_LEVEL || 'info',
    streamingEnabled: process.env.INNGEST_STREAMING_ENABLED === 'true',
    timeouts: {
      documentUpload: Number.parseInt(
        process.env.INNGEST_DOCUMENT_UPLOAD_TIMEOUT || '60000',
      ),
      textExtraction: Number.parseInt(
        process.env.INNGEST_TEXT_EXTRACTION_TIMEOUT || '300000',
      ),
      chunking: Number.parseInt(
        process.env.INNGEST_CHUNKING_TIMEOUT || '120000',
      ),
      embedding: Number.parseInt(
        process.env.INNGEST_EMBEDDING_TIMEOUT || '600000',
      ),
      batchProcessing: Number.parseInt(
        process.env.INNGEST_BATCH_PROCESSING_TIMEOUT || '1800000',
      ),
    },
  };
}

/**
 * Format error for logging and event payloads
 */
export function formatError(error: unknown): {
  message: string;
  code: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      code: 'STRING_ERROR',
    };
  }

  return {
    message: 'Unknown error occurred',
    code: 'UNKNOWN_ERROR',
    stack: JSON.stringify(error),
  };
}

/**
 * Generate unique batch ID for batch processing
 */
export function generateBatchId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `batch_${timestamp}_${random}`;
}

/**
 * Check if a document status indicates completion
 */
export function isDocumentProcessed(status: DocumentStatus): boolean {
  return status === DocumentStatus.PROCESSED;
}

/**
 * Check if a document status indicates failure
 */
export function isDocumentFailed(status: string | DocumentStatus): boolean {
  return status.includes('failed');
}

/**
 * Get the next expected status in the processing pipeline
 */
export function getNextExpectedStatus(
  currentStatus: DocumentStatus,
): DocumentStatus | null {
  const statusFlow: Record<string, DocumentStatus> = {
    [DocumentStatus.UPLOADED]: DocumentStatus.TEXT_EXTRACTED,
    [DocumentStatus.TEXT_EXTRACTED]: DocumentStatus.CHUNKED,
    [DocumentStatus.CHUNKED]: DocumentStatus.EMBEDDED,
    [DocumentStatus.EMBEDDED]: DocumentStatus.PROCESSED,
  };

  return statusFlow[currentStatus] || null;
}
