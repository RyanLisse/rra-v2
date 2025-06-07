import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock dependencies at the top level
vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: vi.fn(),
    step: {
      run: vi.fn(),
    },
  },
}));

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Import after mocks
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { promises as fs } from 'node:fs';
import * as schema from '@/lib/db/schema';
import { textExtractionWorkflow } from '@/lib/workflows/text-extraction';
import { inngest } from '@/lib/inngest/client';
import type { EventSchemas } from '@/lib/inngest/events';

// Test database setup
let testDb: ReturnType<typeof drizzle>;
let connection: postgres.Sql;

describe('Text Extraction Workflow', () => {
  let documentId: string;
  let userId: string;

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
        email: 'test@example.com',
        name: 'Test User',
      })
      .returning();
    userId = user.id;

    // Create test document
    const [doc] = await testDb
      .insert(schema.ragDocument)
      .values({
        userId,
        title: 'Test Document.pdf',
        fileType: 'pdf',
        fileSize: 1024,
        fileName: 'test-document.pdf',
        filePath: '/uploads/test-document.pdf',
        status: 'uploaded',
      })
      .returning();
    documentId = doc.id;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (connection) {
      await connection.end();
    }
  });

  describe('textExtractionWorkflow', () => {
    it('should extract text from PDF and update document status', async () => {
      // Arrange
      const mockPdfContent = Buffer.from('mock pdf content');
      const extractedText = 'This is the extracted text from the PDF';

      vi.mocked(fs.readFile).mockResolvedValue(mockPdfContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      // Mock PDF extraction (we'll implement the actual extraction later)
      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/test-document.pdf',
        },
      };

      // Act
      const result = await textExtractionWorkflow.run({
        event,
        step: inngest.step,
      });

      // Assert
      expect(result).toEqual({
        success: true,
        documentId,
        textLength: extractedText.length,
        outputPath: expect.stringContaining('extracted-text.txt'),
      });

      // Verify document status was updated
      const [updatedDoc] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(updatedDoc.status).toBe('text_extracted');
      expect(updatedDoc.processedAt).toBeTruthy();

      // Verify document content was created
      const [content] = await testDb
        .select()
        .from(schema.documentContent)
        .where(eq(schema.documentContent.documentId, documentId));

      expect(content).toBeTruthy();
      expect(content.content).toBe(extractedText);
      expect(content.contentType).toBe('text');
      expect(content.extractedAt).toBeTruthy();

      // Verify file operations
      expect(fs.readFile).toHaveBeenCalledWith('/uploads/test-document.pdf');
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('extracted'),
        { recursive: true },
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('extracted-text.txt'),
        extractedText,
        'utf-8',
      );
    });

    it('should handle empty PDF content gracefully', async () => {
      // Arrange
      const mockPdfContent = Buffer.from('mock pdf content');
      const extractedText = '';

      vi.mocked(fs.readFile).mockResolvedValue(mockPdfContent);
      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/test-document.pdf',
        },
      };

      // Act
      const result = await textExtractionWorkflow.run({
        event,
        step: inngest.step,
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'No text content extracted from PDF',
        documentId,
      });

      // Verify document status was updated to indicate failure
      const [updatedDoc] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(updatedDoc.status).toBe('extraction_failed');
    });

    it('should handle file read errors', async () => {
      // Arrange
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/non-existent.pdf',
        },
      };

      // Act & Assert
      await expect(
        textExtractionWorkflow.run({ event, step: inngest.step }),
      ).rejects.toThrow('File not found');

      // Verify document status was updated
      const [updatedDoc] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(updatedDoc.status).toBe('extraction_failed');
    });

    it('should handle PDF extraction errors', async () => {
      // Arrange
      const mockPdfContent = Buffer.from('corrupted pdf');
      vi.mocked(fs.readFile).mockResolvedValue(mockPdfContent);

      const mockExtractText = vi
        .fn()
        .mockRejectedValue(new Error('Invalid PDF format'));
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/corrupted.pdf',
        },
      };

      // Act & Assert
      await expect(
        textExtractionWorkflow.run({ event, step: inngest.step }),
      ).rejects.toThrow('Invalid PDF format');

      // Verify document status
      const [updatedDoc] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(updatedDoc.status).toBe('extraction_failed');
    });

    it('should emit success event after extraction', async () => {
      // Arrange
      const mockPdfContent = Buffer.from('mock pdf content');
      const extractedText = 'Successfully extracted text';

      vi.mocked(fs.readFile).mockResolvedValue(mockPdfContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const mockSend = vi.fn().mockResolvedValue({ ids: ['test-event-id'] });
      vi.mocked(inngest.send).mockImplementation(mockSend);

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/test-document.pdf',
        },
      };

      // Act
      await textExtractionWorkflow.run({ event, step: inngest.step });

      // Assert - verify event was sent
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

    it('should handle database transaction rollback on error', async () => {
      // Arrange
      const mockPdfContent = Buffer.from('mock pdf content');
      const extractedText = 'Extracted text';

      vi.mocked(fs.readFile).mockResolvedValue(mockPdfContent);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      // Mock successful extraction but failed file write
      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'));

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/test-document.pdf',
        },
      };

      // Act & Assert
      await expect(
        textExtractionWorkflow.run({ event, step: inngest.step }),
      ).rejects.toThrow('Disk full');

      // Verify no document content was created (transaction rolled back)
      const contents = await testDb
        .select()
        .from(schema.documentContent)
        .where(eq(schema.documentContent.documentId, documentId));

      expect(contents).toHaveLength(0);

      // Verify document status remains as extraction_failed
      const [doc] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(doc.status).toBe('extraction_failed');
    });

    it('should update document metadata after successful extraction', async () => {
      // Arrange
      const mockPdfContent = Buffer.from('mock pdf content');
      const extractedText = 'A '.repeat(500); // 1000 characters

      vi.mocked(fs.readFile).mockResolvedValue(mockPdfContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/test-document.pdf',
        },
      };

      // Act
      await textExtractionWorkflow.run({ event, step: inngest.step });

      // Assert - check metadata updates
      const [updatedDoc] = await testDb
        .select()
        .from(schema.ragDocument)
        .where(eq(schema.ragDocument.id, documentId));

      expect(updatedDoc.metadata).toEqual({
        textLength: 1000,
        extractedAt: expect.any(String),
        extractionDuration: expect.any(Number),
      });
    });

    it('should respect step.run for idempotency', async () => {
      // Arrange
      const mockPdfContent = Buffer.from('mock pdf content');
      const extractedText = 'Test text';

      vi.mocked(fs.readFile).mockResolvedValue(mockPdfContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const mockExtractText = vi.fn().mockResolvedValue(extractedText);
      vi.doMock('@/lib/document-processing/pdf-extractor', () => ({
        extractTextFromPdf: mockExtractText,
      }));

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
      };

      const event: EventSchemas['document.uploaded'] = {
        data: {
          documentId,
          userId,
          filePath: '/uploads/test-document.pdf',
        },
      };

      // Act
      await textExtractionWorkflow.run({ event, step: mockStep as any });

      // Assert - verify step.run was called for each operation
      expect(mockStep.run).toHaveBeenCalledWith(
        'update-status-processing',
        expect.any(Function),
      );
      expect(mockStep.run).toHaveBeenCalledWith(
        'extract-text',
        expect.any(Function),
      );
      expect(mockStep.run).toHaveBeenCalledWith(
        'save-to-database',
        expect.any(Function),
      );
      expect(mockStep.run).toHaveBeenCalledWith(
        'save-to-file',
        expect.any(Function),
      );
      expect(mockStep.run).toHaveBeenCalledWith(
        'emit-success-event',
        expect.any(Function),
      );
    });
  });
});
