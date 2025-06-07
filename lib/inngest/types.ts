import { z } from 'zod';

/**
 * Document Status Constants (for existing system)
 */
export const DocumentStatus = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  TEXT_EXTRACTED: 'text_extracted',
  CHUNKED: 'chunked',
  EMBEDDED: 'embedded',
  PROCESSED: 'processed',
  UPLOAD_FAILED: 'upload_failed',
  TEXT_EXTRACTION_FAILED: 'text_extraction_failed',
  CHUNKING_FAILED: 'chunking_failed',
  EMBEDDING_FAILED: 'embedding_failed',
  PROCESSING_FAILED: 'processing_failed',
} as const;

/**
 * Event Names (for existing system)
 */
export const EVENT_NAMES = {
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_TEXT_EXTRACTED: 'document.text-extracted',
  DOCUMENT_CHUNKED: 'document.chunked',
  DOCUMENT_EMBEDDED: 'document.embedded',
  DOCUMENT_PROCESSED: 'document.processed',
  DOCUMENT_PROCESSING_FAILED: 'document.processing-failed',
  DOCUMENT_DELETED: 'document.deleted',
  BATCH_PROCESSING: 'batch.processing',
} as const;

/**
 * Base Event Payload (for existing system)
 */
export interface BaseEventPayload {
  eventId: string;
  timestamp: number;
  userId?: string;
  sessionId?: string;
}

/**
 * Document Upload Event Payload
 */
export interface DocumentUploadedPayload extends BaseEventPayload {
  documentId: string;
  fileName: string;
  fileSize: number;
  filePath: string;
  documentType: string;
}

/**
 * Document Text Extracted Event Payload
 */
export interface DocumentTextExtractedPayload extends BaseEventPayload {
  documentId: string;
  textLength: number;
  extractedAt: string;
  duration: number;
}

/**
 * Document Chunked Event Payload
 */
export interface DocumentChunkedPayload extends BaseEventPayload {
  documentId: string;
  chunkCount: number;
  chunkedAt: string;
  duration: number;
}

/**
 * Document Embedded Event Payload
 */
export interface DocumentEmbeddedPayload extends BaseEventPayload {
  documentId: string;
  embeddingCount: number;
  embeddedAt: string;
  duration: number;
}

/**
 * Document Processed Event Payload
 */
export interface DocumentProcessedPayload extends BaseEventPayload {
  documentId: string;
  processedAt: string;
  totalDuration: number;
  status: (typeof DocumentStatus)[keyof typeof DocumentStatus];
}

/**
 * Document Processing Failed Event Payload
 */
export interface DocumentProcessingFailedPayload extends BaseEventPayload {
  documentId: string;
  failedAt: string;
  stage: string;
  error: {
    message: string;
    code: string;
    stack?: string;
  };
}

/**
 * Document Deleted Event Payload
 */
export interface DocumentDeletedPayload extends BaseEventPayload {
  documentId: string;
  deletedAt: string;
  reason: string;
}

/**
 * Batch Processing Event Payload
 */
export interface BatchProcessingPayload extends BaseEventPayload {
  batchId: string;
  documentIds: string[];
  operation: string;
  startedAt: string;
}

/**
 * Union type for all event payloads
 */
export type EventPayload =
  | DocumentUploadedPayload
  | DocumentTextExtractedPayload
  | DocumentChunkedPayload
  | DocumentEmbeddedPayload
  | DocumentProcessedPayload
  | DocumentProcessingFailedPayload
  | DocumentDeletedPayload
  | BatchProcessingPayload;

/**
 * Event names type
 */
export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

/**
 * Event map for type safety
 */
export interface EventMap {
  [EVENT_NAMES.DOCUMENT_UPLOADED]: DocumentUploadedPayload;
  [EVENT_NAMES.DOCUMENT_TEXT_EXTRACTED]: DocumentTextExtractedPayload;
  [EVENT_NAMES.DOCUMENT_CHUNKED]: DocumentChunkedPayload;
  [EVENT_NAMES.DOCUMENT_EMBEDDED]: DocumentEmbeddedPayload;
  [EVENT_NAMES.DOCUMENT_PROCESSED]: DocumentProcessedPayload;
  [EVENT_NAMES.DOCUMENT_PROCESSING_FAILED]: DocumentProcessingFailedPayload;
  [EVENT_NAMES.DOCUMENT_DELETED]: DocumentDeletedPayload;
  [EVENT_NAMES.BATCH_PROCESSING]: BatchProcessingPayload;
}

/**
 * TDD System - Inngest configuration schema and types
 */
export const InngestConfigSchema = z.object({
  id: z.string().min(1, 'App ID is required'),
  name: z.string().min(1, 'App name is required'),
  eventKey: z.string().min(1, 'Event key is required'),
  signingKey: z.string().optional(),
  isDev: z.boolean().default(false),
  devServerUrl: z.string().optional(),
  env: z.enum(['development', 'production']).optional(),
});

export type InngestConfig = z.infer<typeof InngestConfigSchema>;

/**
 * TDD System - Base event schema
 */
export const InngestEventSchema = z.object({
  name: z.string().min(1, 'Event name is required'),
  data: z.record(z.any()),
  user: z
    .object({
      id: z.string(),
      email: z.string().optional(),
    })
    .optional(),
  timestamp: z.number().optional(),
  ts: z.number().optional(),
});

export type InngestEvent = z.infer<typeof InngestEventSchema>;

/**
 * TDD System - Document processing event schemas
 */
export const DocumentUploadEventSchema = z.object({
  name: z.literal('document/upload.completed'),
  data: z.object({
    documentId: z.string(),
    fileName: z.string(),
    fileSize: z.number(),
    filePath: z.string(),
    userId: z.string(),
    uploadedAt: z.string(),
    documentType: z.string(),
  }),
  user: z
    .object({
      id: z.string(),
      email: z.string().optional(),
    })
    .optional(),
  timestamp: z.number().optional(),
});

export type DocumentUploadEvent = z.infer<typeof DocumentUploadEventSchema>;

export const DocumentProcessingEventSchema = z.object({
  name: z.literal('document/processing.started'),
  data: z.object({
    documentId: z.string(),
    processingStage: z.enum(['text_extraction', 'chunking', 'embedding']),
    userId: z.string(),
    startedAt: z.string(),
  }),
  user: z
    .object({
      id: z.string(),
      email: z.string().optional(),
    })
    .optional(),
  timestamp: z.number().optional(),
});

export type DocumentProcessingEvent = z.infer<
  typeof DocumentProcessingEventSchema
>;

export const DocumentCompletedEventSchema = z.object({
  name: z.literal('document/processing.completed'),
  data: z.object({
    documentId: z.string(),
    processingStage: z.enum(['text_extraction', 'chunking', 'embedding']),
    userId: z.string(),
    completedAt: z.string(),
    success: z.boolean(),
    errorMessage: z.string().optional(),
  }),
  user: z
    .object({
      id: z.string(),
      email: z.string().optional(),
    })
    .optional(),
  timestamp: z.number().optional(),
});

export type DocumentCompletedEvent = z.infer<
  typeof DocumentCompletedEventSchema
>;

/**
 * TDD System - RAG processing event schemas
 */
export const RagQueryEventSchema = z.object({
  name: z.literal('rag/query.executed'),
  data: z.object({
    queryId: z.string(),
    userId: z.string(),
    query: z.string(),
    documentIds: z.array(z.string()),
    executedAt: z.string(),
    responseTime: z.number(),
  }),
  user: z
    .object({
      id: z.string(),
      email: z.string().optional(),
    })
    .optional(),
  timestamp: z.number().optional(),
});

export type RagQueryEvent = z.infer<typeof RagQueryEventSchema>;

/**
 * TDD System - Health check schema
 */
export const InngestHealthSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'unknown']),
  timestamp: z.number(),
  config: InngestConfigSchema.partial(),
  devServerAvailable: z.boolean().optional(),
  error: z.string().optional(),
});

export type InngestHealth = z.infer<typeof InngestHealthSchema>;

/**
 * TDD System - Function definition schema
 */
export const InngestFunctionSchema = z.object({
  id: z.string(),
  name: z.string(),
  triggers: z.array(
    z.object({
      event: z.string(),
      expression: z.string().optional(),
    }),
  ),
  concurrency: z
    .object({
      limit: z.number().optional(),
      scope: z.enum(['account', 'environment', 'function']).optional(),
    })
    .optional(),
  debounce: z
    .object({
      period: z.string(),
      key: z.string().optional(),
    })
    .optional(),
  rateLimit: z
    .object({
      limit: z.number(),
      period: z.string(),
      key: z.string().optional(),
    })
    .optional(),
});

export type InngestFunction = z.infer<typeof InngestFunctionSchema>;

/**
 * TDD System - Union type for all document events
 */
export type TDDDocumentEvent =
  | DocumentUploadEvent
  | DocumentProcessingEvent
  | DocumentCompletedEvent;

/**
 * TDD System - Union type for all supported events
 */
export type SupportedEvent = TDDDocumentEvent | RagQueryEvent;

/**
 * TDD System - Event name constants
 */
export const EventNames = {
  DOCUMENT_UPLOAD_COMPLETED: 'document/upload.completed',
  DOCUMENT_PROCESSING_STARTED: 'document/processing.started',
  DOCUMENT_PROCESSING_COMPLETED: 'document/processing.completed',
  RAG_QUERY_EXECUTED: 'rag/query.executed',
} as const;

export type TDDEventName = (typeof EventNames)[keyof typeof EventNames];
