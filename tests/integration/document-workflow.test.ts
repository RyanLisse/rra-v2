import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies at the top level
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: vi.fn(),
    step: {
      run: vi.fn(),
    },
  },
}));

// Import after mocks
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as schema from '@/lib/db/schema';
import { inngest } from '@/lib/inngest/client';
import { DocumentUploadHandler } from '@/lib/document-processing/upload-handler';
import { textExtractionWorkflow } from '@/lib/workflows/text-extraction';
import type { EventSchemas } from '@/lib/inngest/events';

// Test database setup
let testDb: ReturnType<typeof drizzle>;
let connection: postgres.Sql;

describe('Document Workflow Integration', () => {
  let userId: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Setup test database connection
    const databaseUrl =
      process.env.POSTGRES_URL ||
      'postgresql://test:test@localhost:5432/test_db';
    connection = postgres(databaseUrl, { max: 1 });
    testDb = drizzle(connection, { schema });

    // Clean up test data
    await testDb.delete(schema.documentEmbedding);
    await testDb.delete(schema.documentChunk);
    await testDb.delete(schema.documentContent);
    await testDb.delete(schema.ragDocument);
    await testDb.delete(schema.user);

    // Create test user
    const [user] = await testDb
      .insert(schema.user)
      .values({
        email: 'integration-test@example.com',
        name: 'Integration Test User',
      })
      .returning();
    userId = user.id;

    testFilePath = '/tmp/test-upload.pdf';
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (connection) {
      await connection.end();
    }
  });

  describe('Complete Document Processing Flow', () => {
    it('should process document from upload to text extraction', async () => {
      // Arrange - Mock file operations
      const mockFileBuffer = Buffer.from('mock pdf content');
      const extractedText =
        'This is extracted text from the integration test PDF';

      vi.mocked(fs.readFile).mockResolvedValue(mockFileBuffer);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
      } as any);

      // Mock PDF extraction
      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const mockSend = vi.fn().mockResolvedValue({ ids: ['event-id'] });
      vi.mocked(inngest.send).mockImplementation(mockSend);

      // Step 1: Upload document (simulate API endpoint behavior)
      const uploadHandler = new DocumentUploadHandler();
      const uploadResult = await uploadHandler.processUpload({
        userId,
        file: {
          name: 'test-document.pdf',
          type: 'application/pdf',
          size: 1024,
          buffer: mockFileBuffer,
        },
      });

      expect(uploadResult.success).toBe(true);
      expect(uploadResult.documentId).toBeTruthy();

      const documentId = uploadResult.documentId!;

      // Verify document was created in database
      const [document] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(document).toBeTruthy();
      expect(document.status).toBe('uploaded');
      expect(document.title).toBe('test-document.pdf');
      expect(document.fileType).toBe('pdf');

      // Verify upload event was emitted
      expect(mockSend).toHaveBeenCalledWith({
        name: 'document.uploaded',
        data: {
          documentId,
          userId,
          filePath: expect.stringContaining('test-document.pdf'),
        },
      });

      // Step 2: Process text extraction workflow
      const extractionEvent: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: document.filePath,
        },
      };

      const extractionResult = await textExtractionWorkflow.run({
        event: extractionEvent,
        step: inngest.step,
      });

      expect(extractionResult.success).toBe(true);
      expect(extractionResult.textLength).toBe(extractedText.length);

      // Step 3: Verify final document state
      const [finalDocument] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(finalDocument.status).toBe('text_extracted');
      expect(finalDocument.processedAt).toBeTruthy();
      expect(finalDocument.metadata).toEqual({
        textLength: extractedText.length,
        extractedAt: expect.any(String),
        extractionDuration: expect.any(Number),
      });

      // Verify document content was created
      const [content] = await testDb
        .select()
        .from(schema.documentContent)
        .where(eq(schema.documentContent.documentId, documentId));

      expect(content).toBeTruthy();
      expect(content.content).toBe(extractedText);
      expect(content.contentType).toBe('text');

      // Verify text extraction event was emitted
      expect(mockSend).toHaveBeenCalledWith({
        name: 'document.text-extracted',
        data: {
          documentId,
          userId,
          textLength: extractedText.length,
          extractedAt: expect.any(Date),
        },
      });
    });

    it('should handle workflow failure and maintain data consistency', async () => {
      // Arrange - Successful upload but failed extraction
      const mockFileBuffer = Buffer.from('mock pdf content');

      vi.mocked(fs.readFile).mockResolvedValue(mockFileBuffer);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
      } as any);

      // Mock failed PDF extraction
      const mockExtractText = vi
        .fn()
        .mockRejectedValue(new Error('Corrupted PDF'));
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const mockSend = vi.fn().mockResolvedValue({ ids: ['event-id'] });
      vi.mocked(inngest.send).mockImplementation(mockSend);

      // Step 1: Upload document
      const uploadHandler = new DocumentUploadHandler();
      const uploadResult = await uploadHandler.processUpload({
        userId,
        file: {
          name: 'corrupted.pdf',
          type: 'application/pdf',
          size: 1024,
          buffer: mockFileBuffer,
        },
      });

      const documentId = uploadResult.documentId!;

      // Step 2: Attempt text extraction (should fail)
      const extractionEvent: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/corrupted.pdf',
        },
      };

      await expect(
        textExtractionWorkflow.run({
          event: extractionEvent,
          step: inngest.step,
        }),
      ).rejects.toThrow('Corrupted PDF');

      // Step 3: Verify document state shows failure
      const [document] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(document.status).toBe('extraction_failed');

      // Verify no content was created due to transaction rollback
      const contents = await testDb
        .select()
        .from(schema.documentContent)
        .where(eq(schema.documentContent.documentId, documentId));

      expect(contents).toHaveLength(0);
    });

    it('should handle multiple documents concurrently', async () => {
      // Arrange
      const mockFileBuffer = Buffer.from('mock pdf content');
      const extractedText1 = 'First document text';
      const extractedText2 = 'Second document text';

      vi.mocked(fs.readFile).mockResolvedValue(mockFileBuffer);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
      } as any);

      const mockExtractText = vi
        .fn()
        .mockResolvedValueOnce(extractedText1)
        .mockResolvedValueOnce(extractedText2);

      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const mockSend = vi.fn().mockResolvedValue({ ids: ['event-id'] });
      vi.mocked(inngest.send).mockImplementation(mockSend);

      const uploadHandler = new DocumentUploadHandler();

      // Step 1: Upload multiple documents
      const [upload1, upload2] = await Promise.all([
        uploadHandler.processUpload({
          userId,
          file: {
            name: 'document1.pdf',
            type: 'application/pdf',
            size: 1024,
            buffer: mockFileBuffer,
          },
        }),
        uploadHandler.processUpload({
          userId,
          file: {
            name: 'document2.pdf',
            type: 'application/pdf',
            size: 1024,
            buffer: mockFileBuffer,
          },
        }),
      ]);

      expect(upload1.success).toBe(true);
      expect(upload2.success).toBe(true);

      // Step 2: Process both extractions concurrently
      const [doc1, doc2] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.userId, userId));

      await Promise.all([
        textExtractionWorkflow.run({
          event: {
            data: {
              documentId: doc1.id,
              userId,
              filePath: doc1.filePath,
            },
          },
          step: inngest.step,
        }),
        textExtractionWorkflow.run({
          event: {
            data: {
              documentId: doc2.id,
              userId,
              filePath: doc2.filePath,
            },
          },
          step: inngest.step,
        }),
      ]);

      // Step 3: Verify both documents processed successfully
      const finalDocs = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.userId, userId));

      expect(finalDocs).toHaveLength(2);
      expect(finalDocs.every((doc) => doc.status === 'text_extracted')).toBe(
        true,
      );

      const contents = await testDb
        .select()
        .from(schema.documentContent)
        .where(eq(schema.documentContent.documentId, doc1.id));

      expect(contents).toHaveLength(1);
    });

    it('should validate file system path security', async () => {
      // Arrange - Attempt directory traversal attack
      const mockFileBuffer = Buffer.from('mock pdf content');

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
      } as any);

      const uploadHandler = new DocumentUploadHandler();

      // Act & Assert - Should reject malicious filenames
      await expect(
        uploadHandler.processUpload({
          userId,
          file: {
            name: '../../../etc/passwd',
            type: 'application/pdf',
            size: 1024,
            buffer: mockFileBuffer,
          },
        }),
      ).rejects.toThrow(/Invalid filename/);
    });

    it('should track processing timeline accurately', async () => {
      // Arrange
      const mockFileBuffer = Buffer.from('mock pdf content');
      const extractedText = 'Timeline test text';

      vi.mocked(fs.readFile).mockResolvedValue(mockFileBuffer);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
      } as any);

      const mockExtractText = vi.fn().mockImplementation(async () => {
        // Simulate processing time
        await new Promise((resolve) => setTimeout(resolve, 10));
        return extractedText;
      });

      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const mockSend = vi.fn().mockResolvedValue({ ids: ['event-id'] });
      vi.mocked(inngest.send).mockImplementation(mockSend);

      const startTime = Date.now();

      // Act - Complete workflow
      const uploadHandler = new DocumentUploadHandler();
      const uploadResult = await uploadHandler.processUpload({
        userId,
        file: {
          name: 'timeline-test.pdf',
          type: 'application/pdf',
          size: 1024,
          buffer: mockFileBuffer,
        },
      });

      const [document] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, uploadResult.documentId!));

      await textExtractionWorkflow.run({
        event: {
          data: {
            documentId: document.id,
            userId,
            filePath: document.filePath,
          },
        },
        step: inngest.step,
      });

      const endTime = Date.now();

      // Assert - Verify timeline
      const [finalDoc] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, document.id));

      const [content] = await testDb
        .select()
        .from(schema.documentContent)
        .where(eq(schema.documentContent.documentId, document.id));

      expect(finalDoc.createdAt.getTime()).toBeGreaterThanOrEqual(startTime);
      expect(finalDoc.processedAt!.getTime()).toBeLessThanOrEqual(endTime);
      expect(content.extractedAt.getTime()).toBeLessThanOrEqual(endTime);
      expect(finalDoc.metadata.extractionDuration).toBeGreaterThan(0);
    });
  });

  describe('Event Chain Integration', () => {
    it('should emit events in correct sequence', async () => {
      // Arrange
      const mockFileBuffer = Buffer.from('mock pdf content');
      const extractedText = 'Event sequence test';

      vi.mocked(fs.readFile).mockResolvedValue(mockFileBuffer);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024,
        isFile: () => true,
      } as any);

      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const mockSend = vi.fn().mockResolvedValue({ ids: ['event-id'] });
      vi.mocked(inngest.send).mockImplementation(mockSend);

      // Act
      const uploadHandler = new DocumentUploadHandler();
      const uploadResult = await uploadHandler.processUpload({
        userId,
        file: {
          name: 'event-test.pdf',
          type: 'application/pdf',
          size: 1024,
          buffer: mockFileBuffer,
        },
      });

      const [document] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, uploadResult.documentId!));

      await textExtractionWorkflow.run({
        event: {
          data: {
            documentId: document.id,
            userId,
            filePath: document.filePath,
          },
        },
        step: inngest.step,
      });

      // Assert - Verify event sequence
      expect(mockSend).toHaveBeenCalledTimes(2);

      // First event: document.uploaded
      expect(mockSend).toHaveBeenNthCalledWith(1, {
        name: 'document.uploaded',
        data: {
          documentId: document.id,
          userId,
          filePath: document.filePath,
        },
      });

      // Second event: document.text-extracted
      expect(mockSend).toHaveBeenNthCalledWith(2, {
        name: 'document.text-extracted',
        data: {
          documentId: document.id,
          userId,
          textLength: extractedText.length,
          extractedAt: expect.any(Date),
        },
      });
    });
  });
});
