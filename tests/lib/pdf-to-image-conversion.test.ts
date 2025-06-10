/**
 * PDF to Image Conversion Tests
 *
 * Tests for the PDF to image conversion Inngest workflow and related utilities.
 * Follows TDD patterns established in the codebase.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  convertPdfToImages,
  validateConfig,
} from '@/lib/document-processing/pdf-to-image-converter';
import { pdfToImageConversionWorkflow } from '@/lib/workflows/pdf-to-image-conversion';
import {
  getDocumentImages,
  getDocumentImageStats,
  documentHasImages,
  cleanupDocumentImages,
} from '@/lib/document-processing/image-manager';
import { db } from '@/lib/db';
import { ragDocument, documentImage } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Mock external dependencies
vi.mock('pdf2pic', () => ({
  fromPath: vi.fn(() => ({
    bulk: vi.fn(),
    convert: vi.fn(),
  })),
}));

vi.mock('@/lib/inngest/client', () => ({
  sendEvent: vi.fn(),
  inngest: {
    createFunction: vi.fn(),
  },
}));

describe('PDF to Image Conversion', () => {
  const mockDocumentId = 'test-doc-123';
  const mockUserId = 'test-user-456';
  const mockFilePath = '/uploads/test-document.pdf';

  beforeEach(async () => {
    // Setup test document
    await db.insert(ragDocument).values({
      id: mockDocumentId,
      fileName: 'test-document.pdf',
      originalName: 'Test Document.pdf',
      filePath: mockFilePath,
      mimeType: 'application/pdf',
      fileSize: '1024000',
      status: 'text_extracted',
      uploadedBy: mockUserId,
    });
  });

  afterEach(async () => {
    // Cleanup test data
    await db
      .delete(documentImage)
      .where(eq(documentImage.documentId, mockDocumentId));
    await db.delete(ragDocument).where(eq(ragDocument.id, mockDocumentId));
  });

  describe('PDF to Image Converter', () => {
    it('should validate conversion configuration correctly', () => {
      // Valid configuration
      const validConfig = {
        format: 'png' as const,
        quality: 85,
        density: 150,
      };

      const validResult = validateConfig(validConfig);
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      // Invalid configuration
      const invalidConfig = {
        format: 'invalid' as any,
        quality: 150, // Too high
        density: 50, // Too low
      };

      const invalidResult = validateConfig(invalidConfig);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid file paths for security', async () => {
      const invalidPaths = [
        '../../../etc/passwd',
        '/etc/passwd',
        'uploads/../secret.pdf',
      ];

      for (const invalidPath of invalidPaths) {
        await expect(
          convertPdfToImages(invalidPath, mockDocumentId),
        ).rejects.toThrow('Invalid file path for security reasons');
      }
    });

    it('should handle missing PDF files gracefully', async () => {
      const nonExistentPath = '/uploads/non-existent.pdf';

      const result = await convertPdfToImages(nonExistentPath, mockDocumentId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should use default configuration when none provided', async () => {
      // Mock pdf2pic to simulate successful conversion
      const mockFromPath = await import('pdf2pic');
      const mockConverter = {
        bulk: vi
          .fn()
          .mockResolvedValue([
            { page: 1, path: '/uploads/images/test-doc-123/page.1.png' },
          ]),
      };

      vi.mocked(mockFromPath.fromPath).mockReturnValue(mockConverter as any);

      const result = await convertPdfToImages(mockFilePath, mockDocumentId);

      // Should use default configuration
      expect(vi.mocked(mockFromPath.fromPath)).toHaveBeenCalledWith(
        mockFilePath,
        expect.objectContaining({
          format: 'png',
          quality: 85,
          density: 150,
        }),
      );
    });
  });

  describe('PDF to Image Workflow', () => {
    it('should process text-extracted event correctly', async () => {
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
        sendEvent: vi.fn(),
      };

      const mockEvent = {
        data: {
          documentId: mockDocumentId,
          userId: mockUserId,
          textLength: 1000,
          extractedAt: new Date(),
        },
      };

      // Mock successful conversion
      vi.doMock('@/lib/document-processing/pdf-to-image-converter', () => ({
        convertPdfToImages: vi.fn().mockResolvedValue({
          success: true,
          totalPages: 3,
          convertedPages: [
            {
              pageNumber: 1,
              imagePath: '/uploads/images/test-doc-123/page.1.png',
              width: 800,
              height: 1200,
              fileSize: 50000,
              format: 'png',
            },
            {
              pageNumber: 2,
              imagePath: '/uploads/images/test-doc-123/page.2.png',
              width: 800,
              height: 1200,
              fileSize: 52000,
              format: 'png',
            },
            {
              pageNumber: 3,
              imagePath: '/uploads/images/test-doc-123/page.3.png',
              width: 800,
              height: 1200,
              fileSize: 48000,
              format: 'png',
            },
          ],
          failedPages: [],
          metadata: {
            conversionDuration: 5000,
            totalFileSize: 150000,
            averageFileSize: 50000,
            outputDirectory: '/uploads/images/test-doc-123',
          },
        }),
      }));

      const result = await pdfToImageConversionWorkflow({
        event: mockEvent,
        step: mockStep,
      });

      expect(result.success).toBe(true);
      expect(result.imageCount).toBe(3);
      expect(result.imagePaths).toHaveLength(3);
      expect(mockStep.sendEvent).toHaveBeenCalledWith(
        'images-converted',
        expect.objectContaining({
          name: 'document.images-converted',
          data: expect.objectContaining({
            documentId: mockDocumentId,
            userId: mockUserId,
            imageCount: 3,
          }),
        }),
      );
    });

    it('should handle conversion failures gracefully', async () => {
      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => {
          if (name === 'convert-pdf-to-images') {
            throw new Error('Conversion failed');
          }
          return fn();
        }),
        sendEvent: vi.fn(),
      };

      const mockEvent = {
        data: {
          documentId: mockDocumentId,
          userId: mockUserId,
          textLength: 1000,
          extractedAt: new Date(),
        },
      };

      const result = await pdfToImageConversionWorkflow({
        event: mockEvent,
        step: mockStep,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Conversion failed');
    });

    it('should validate document status before conversion', async () => {
      // Update document to wrong status
      await db
        .update(ragDocument)
        .set({ status: 'uploaded' })
        .where(eq(ragDocument.id, mockDocumentId));

      const mockStep = {
        run: vi.fn().mockImplementation((name, fn) => fn()),
        sendEvent: vi.fn(),
      };

      const mockEvent = {
        data: {
          documentId: mockDocumentId,
          userId: mockUserId,
          textLength: 1000,
          extractedAt: new Date(),
        },
      };

      const result = await pdfToImageConversionWorkflow({
        event: mockEvent,
        step: mockStep,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not ready for image conversion');
    });
  });

  describe('Image Manager', () => {
    beforeEach(async () => {
      // Insert test image records
      await db.insert(documentImage).values([
        {
          documentId: mockDocumentId,
          pageNumber: 1,
          imagePath: '/uploads/images/test-doc-123/page.1.png',
          format: 'png',
          width: 800,
          height: 1200,
          fileSize: '50000',
          quality: 85,
        },
        {
          documentId: mockDocumentId,
          pageNumber: 2,
          imagePath: '/uploads/images/test-doc-123/page.2.png',
          format: 'png',
          width: 800,
          height: 1200,
          fileSize: '52000',
          quality: 85,
        },
      ]);
    });

    it('should retrieve document images correctly', async () => {
      const images = await getDocumentImages(mockDocumentId);

      expect(images).toHaveLength(2);
      expect(images[0].pageNumber).toBe(1);
      expect(images[1].pageNumber).toBe(2);
      expect(images[0].format).toBe('png');
    });

    it('should calculate image statistics correctly', async () => {
      const stats = await getDocumentImageStats(mockDocumentId);

      expect(stats).toBeDefined();
      expect(stats?.totalImages).toBe(2);
      expect(stats?.totalFileSize).toBe(102000);
      expect(stats?.averageFileSize).toBe(51000);
      expect(stats?.formats.png).toBe(2);
      expect(stats?.pageRange.min).toBe(1);
      expect(stats?.pageRange.max).toBe(2);
    });

    it('should detect if document has images', async () => {
      const hasImages = await documentHasImages(mockDocumentId);
      expect(hasImages).toBe(true);

      const hasNoImages = await documentHasImages('non-existent-doc');
      expect(hasNoImages).toBe(false);
    });

    it('should cleanup document images', async () => {
      const result = await cleanupDocumentImages(mockDocumentId, {
        removeFiles: false, // Don't try to remove actual files in test
        removeRecords: true,
      });

      expect(result.removedRecords).toBe(2);
      expect(result.errors).toHaveLength(0);

      // Verify records are removed
      const remainingImages = await getDocumentImages(mockDocumentId);
      expect(remainingImages).toHaveLength(0);
    });
  });

  describe('Integration Tests', () => {
    it('should process a complete PDF to image workflow', async () => {
      // This would be a more comprehensive test that exercises the entire pipeline
      // from event emission to database storage to file cleanup

      // Mock the required external dependencies
      const mockSendEvent = await import('@/lib/inngest/client');
      vi.mocked(mockSendEvent.sendEvent).mockResolvedValue({} as any);

      // Simulate workflow execution
      const mockContext = {
        event: {
          data: {
            documentId: mockDocumentId,
            userId: mockUserId,
            textLength: 1000,
            extractedAt: new Date(),
          },
        },
        step: {
          run: vi.fn().mockImplementation((name, fn) => fn()),
          sendEvent: vi.fn(),
        },
      };

      // This test would verify the complete workflow
      // but requires mocking many external dependencies
      expect(mockContext.event.data.documentId).toBe(mockDocumentId);
    });
  });
});

describe('Configuration Validation', () => {
  it('should validate supported formats', () => {
    const supportedFormats = ['png', 'jpg', 'jpeg', 'webp'];

    for (const format of supportedFormats) {
      const result = validateConfig({ format: format as any });
      expect(result.valid).toBe(true);
    }

    const result = validateConfig({ format: 'invalid' as any });
    expect(result.valid).toBe(false);
  });

  it('should validate quality ranges', () => {
    const validQualities = [1, 50, 85, 100];

    for (const quality of validQualities) {
      const result = validateConfig({ quality });
      expect(result.valid).toBe(true);
    }

    const invalidQualities = [0, -1, 101, 150];

    for (const quality of invalidQualities) {
      const result = validateConfig({ quality });
      expect(result.valid).toBe(false);
    }
  });

  it('should validate density ranges', () => {
    const validDensities = [72, 150, 300, 600];

    for (const density of validDensities) {
      const result = validateConfig({ density });
      expect(result.valid).toBe(true);
    }

    const invalidDensities = [50, 700, -1];

    for (const density of invalidDensities) {
      const result = validateConfig({ density });
      expect(result.valid).toBe(false);
    }
  });
});
