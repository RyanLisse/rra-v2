/**
 * Inngest Setup Test
 *
 * This test verifies that the basic Inngest infrastructure is properly configured
 * and can be imported without errors.
 */

import { describe, it, expect } from 'vitest';
import { inngest, EVENT_NAMES, DocumentStatus } from '@/lib/inngest';
import {
  sendEvent,
  createBaseEventPayload,
  getInngestConfig,
  formatError,
  generateBatchId,
} from '@/lib/inngest/utils';

describe('Inngest Setup', () => {
  it('should export inngest client correctly', () => {
    expect(inngest).toBeDefined();
    expect(typeof inngest.send).toBe('function');
    expect(typeof inngest.createFunction).toBe('function');
  });

  it('should have all required event names', () => {
    expect(EVENT_NAMES.DOCUMENT_UPLOADED).toBe('document.uploaded');
    expect(EVENT_NAMES.DOCUMENT_TEXT_EXTRACTED).toBe('document.text-extracted');
    expect(EVENT_NAMES.DOCUMENT_CHUNKED).toBe('document.chunked');
    expect(EVENT_NAMES.DOCUMENT_EMBEDDED).toBe('document.embedded');
    expect(EVENT_NAMES.DOCUMENT_PROCESSED).toBe('document.processed');
    expect(EVENT_NAMES.DOCUMENT_PROCESSING_FAILED).toBe(
      'document.processing-failed',
    );
    expect(EVENT_NAMES.DOCUMENT_DELETED).toBe('document.deleted');
    expect(EVENT_NAMES.BATCH_PROCESSING).toBe('batch.processing');
  });

  it('should have all document status values', () => {
    expect(DocumentStatus.UPLOADED).toBe('uploaded');
    expect(DocumentStatus.PROCESSING).toBe('processing');
    expect(DocumentStatus.TEXT_EXTRACTED).toBe('text_extracted');
    expect(DocumentStatus.CHUNKED).toBe('chunked');
    expect(DocumentStatus.EMBEDDED).toBe('embedded');
    expect(DocumentStatus.PROCESSED).toBe('processed');
    expect(DocumentStatus.UPLOAD_FAILED).toBe('upload_failed');
    expect(DocumentStatus.TEXT_EXTRACTION_FAILED).toBe(
      'text_extraction_failed',
    );
    expect(DocumentStatus.CHUNKING_FAILED).toBe('chunking_failed');
    expect(DocumentStatus.EMBEDDING_FAILED).toBe('embedding_failed');
    expect(DocumentStatus.PROCESSING_FAILED).toBe('processing_failed');
  });

  it('should create base event payload correctly', () => {
    const payload = createBaseEventPayload('user123', 'session456');

    expect(payload.eventId).toBeDefined();
    expect(typeof payload.eventId).toBe('string');
    expect(payload.timestamp).toBeDefined();
    expect(typeof payload.timestamp).toBe('number');
    expect(payload.userId).toBe('user123');
    expect(payload.sessionId).toBe('session456');
  });

  it('should get inngest configuration', () => {
    const config = getInngestConfig();

    expect(config).toBeDefined();
    expect(config.appId).toBe('rra-v2-app');
    expect(config.servePath).toBe('/api/inngest');
    expect(typeof config.isDevelopment).toBe('boolean');
    expect(typeof config.maxRetries).toBe('number');
    expect(config.timeouts).toBeDefined();
    expect(typeof config.timeouts.documentUpload).toBe('number');
    expect(typeof config.timeouts.textExtraction).toBe('number');
    expect(typeof config.timeouts.chunking).toBe('number');
    expect(typeof config.timeouts.embedding).toBe('number');
    expect(typeof config.timeouts.batchProcessing).toBe('number');
  });

  it('should format errors correctly', () => {
    const error = new Error('Test error');
    error.name = 'TestError';

    const formatted = formatError(error);

    expect(formatted.message).toBe('Test error');
    expect(formatted.code).toBe('TestError');
    expect(formatted.stack).toBeDefined();
  });

  it('should format string errors', () => {
    const formatted = formatError('String error');

    expect(formatted.message).toBe('String error');
    expect(formatted.code).toBe('STRING_ERROR');
  });

  it('should format unknown errors', () => {
    const formatted = formatError({ unknown: 'error' });

    expect(formatted.message).toBe('Unknown error occurred');
    expect(formatted.code).toBe('UNKNOWN_ERROR');
    expect(formatted.stack).toBeDefined();
  });

  it('should generate unique batch IDs', () => {
    const batchId1 = generateBatchId();
    const batchId2 = generateBatchId();

    expect(batchId1).toBeDefined();
    expect(batchId2).toBeDefined();
    expect(batchId1).not.toBe(batchId2);
    expect(batchId1.startsWith('batch_')).toBe(true);
    expect(batchId2.startsWith('batch_')).toBe(true);
  });

  it('should export sendEvent function', () => {
    expect(typeof sendEvent).toBe('function');
  });

  describe('Event Payload Validation', () => {
    it('should create valid document uploaded payload structure', () => {
      const basePayload = createBaseEventPayload('user123');
      const documentPayload = {
        ...basePayload,
        documentId: 'doc123',
        filename: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storagePath: '/uploads/test.pdf',
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalName: 'test.pdf',
          fileExtension: 'pdf',
        },
      };

      expect(documentPayload.documentId).toBe('doc123');
      expect(documentPayload.filename).toBe('test.pdf');
      expect(documentPayload.fileSize).toBe(1024);
      expect(documentPayload.mimeType).toBe('application/pdf');
      expect(documentPayload.storagePath).toBe('/uploads/test.pdf');
      expect(documentPayload.metadata.fileExtension).toBe('pdf');
    });

    it('should create valid text extracted payload structure', () => {
      const basePayload = createBaseEventPayload('user123');
      const textPayload = {
        ...basePayload,
        documentId: 'doc123',
        extractedText: 'Sample text',
        characterCount: 11,
        pageCount: 1,
        metadata: {
          extractionMethod: 'pdf-parse' as const,
          extractionDuration: 1000,
          extractedAt: new Date().toISOString(),
        },
      };

      expect(textPayload.documentId).toBe('doc123');
      expect(textPayload.extractedText).toBe('Sample text');
      expect(textPayload.characterCount).toBe(11);
      expect(textPayload.metadata.extractionMethod).toBe('pdf-parse');
    });
  });
});
