/**
 * Inngest Module Exports
 *
 * This is the main entry point for the Inngest module.
 * It exports all the necessary types, utilities, and client configuration
 * for use throughout the application.
 */

// Core client and configuration
export { inngest, createEvent, type InngestClient } from './client';

// Type definitions
export {
  // Event payload types
  type BaseEventPayload,
  type DocumentUploadedPayload,
  type DocumentTextExtractedPayload,
  type DocumentChunkedPayload,
  type DocumentEmbeddedPayload,
  type DocumentProcessedPayload,
  type DocumentProcessingFailedPayload,
  type DocumentDeletedPayload,
  type BatchProcessingPayload,
  type EventPayload,
  type EventName,
  type EventMap,
  // Constants
  EVENT_NAMES,
  DocumentStatus,
} from './types';

// Utility functions
export {
  sendEvent,
  createBaseEventPayload,
  updateDocumentStatus,
  getDocumentInfo,
  calculateDuration,
  createRetryConfig,
  createConcurrencyConfig,
  logFunctionExecution,
  createErrorEventPayload,
  validateEventPayload,
  getInngestConfig,
  formatError,
  generateBatchId,
  isDocumentProcessed,
  isDocumentFailed,
  getNextExpectedStatus,
} from './utils';

// Functions will be exported here as they are created
// export { processDocumentUpload } from "./functions/process-document-upload";
// export { extractDocumentText } from "./functions/extract-document-text";
// export { chunkDocument } from "./functions/chunk-document";
// export { embedDocument } from "./functions/embed-document";
// export { handleProcessingFailure } from "./functions/handle-processing-failure";

/**
 * Default export for convenience
 */
import { inngest as inngestClient } from './client';
export default inngestClient;
