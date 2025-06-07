import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentProcessor } from '@/lib/document-processing/document-processor';
import { ADEChunkHelpers } from '@/lib/db/ade-helpers';
import { db } from '@/lib/db';
import { ragDocument, documentContent, documentChunk } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('ADE Simple Integration', () => {
  let processor: DocumentProcessor;
  let mockDocumentId: string;

  beforeEach(async () => {
    processor = new DocumentProcessor();

    // Create a mock document in the database
    const [doc] = await db
      .insert(ragDocument)
      .values({
        fileName: 'test.pdf',
        originalName: 'test.pdf',
        filePath: '/test/path/test.pdf',
        mimeType: 'application/pdf',
        fileSize: '1024',
        status: 'uploaded',
        uploadedBy: randomUUID(), // Generate proper UUID
      })
      .returning();

    mockDocumentId = doc.id;
  });

  afterEach(async () => {
    // Clean up test data
    await db
      .delete(documentChunk)
      .where(eq(documentChunk.documentId, mockDocumentId));
    await db
      .delete(documentContent)
      .where(eq(documentContent.documentId, mockDocumentId));
    await db.delete(ragDocument).where(eq(ragDocument.id, mockDocumentId));
  });

  describe('ADE Chunk Helpers', () => {
    it('should create chunks with ADE metadata using ADEChunkHelpers', async () => {
      // Create a chunk with ADE metadata
      const chunk = await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '0',
        content: 'This is a test title',
        elementType: 'title',
        pageNumber: 1,
        bbox: [50, 50, 500, 80],
        metadata: { is_primary_title: true },
        tokenCount: '5',
      });

      expect(chunk).toBeDefined();
      expect(chunk.content).toBe('This is a test title');
      expect(chunk.elementType).toBe('title');
      expect(chunk.pageNumber).toBe(1);
      expect(chunk.bbox).toEqual([50, 50, 500, 80]);
      expect(chunk.metadata).toMatchObject({ is_primary_title: true });
    });

    it('should retrieve chunks by element type', async () => {
      // Create multiple chunks with different types
      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '0',
        content: 'Document Title',
        elementType: 'title',
        pageNumber: 1,
        bbox: [50, 50, 500, 80],
      });

      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '1',
        content: 'This is a paragraph',
        elementType: 'paragraph',
        pageNumber: 1,
        bbox: [50, 100, 500, 150],
      });

      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '2',
        content: 'Another paragraph',
        elementType: 'paragraph',
        pageNumber: 2,
        bbox: [50, 100, 500, 150],
      });

      // Get chunks by type
      const titleChunks = await ADEChunkHelpers.getChunksByElementType(
        mockDocumentId,
        'title',
      );
      const paragraphChunks = await ADEChunkHelpers.getChunksByElementType(
        mockDocumentId,
        'paragraph',
      );

      expect(titleChunks).toHaveLength(1);
      expect(titleChunks[0].content).toBe('Document Title');

      expect(paragraphChunks).toHaveLength(2);
      expect(paragraphChunks[0].content).toBe('This is a paragraph');
      expect(paragraphChunks[1].content).toBe('Another paragraph');
    });

    it('should retrieve chunks by page', async () => {
      // Create chunks on different pages
      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '0',
        content: 'Page 1 content',
        elementType: 'paragraph',
        pageNumber: 1,
      });

      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '1',
        content: 'Page 2 content',
        elementType: 'paragraph',
        pageNumber: 2,
      });

      // Get chunks by page
      const page1Chunks = await ADEChunkHelpers.getChunksByPage(
        mockDocumentId,
        1,
      );
      const page2Chunks = await ADEChunkHelpers.getChunksByPage(
        mockDocumentId,
        2,
      );

      expect(page1Chunks).toHaveLength(1);
      expect(page1Chunks[0].content).toBe('Page 1 content');

      expect(page2Chunks).toHaveLength(1);
      expect(page2Chunks[0].content).toBe('Page 2 content');
    });

    it('should get document structure', async () => {
      // Create chunks with structural elements
      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '0',
        content: 'Main Title',
        elementType: 'title',
        pageNumber: 1,
      });

      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '1',
        content: 'Section Header',
        elementType: 'header',
        pageNumber: 1,
      });

      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '2',
        content: 'Figure caption',
        elementType: 'figure_caption',
        pageNumber: 2,
      });

      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '3',
        content: 'Regular paragraph',
        elementType: 'paragraph',
        pageNumber: 2,
      });

      // Get document structure
      const structure =
        await ADEChunkHelpers.getDocumentStructure(mockDocumentId);

      expect(structure.titles).toHaveLength(1);
      expect(structure.titles[0].content).toBe('Main Title');

      expect(structure.headers).toHaveLength(1);
      expect(structure.headers[0].content).toBe('Section Header');

      expect(structure.structure).toHaveLength(2); // titles + figure_captions
      expect(structure.structure.map((s) => s.content)).toContain('Main Title');
      expect(structure.structure.map((s) => s.content)).toContain(
        'Figure caption',
      );
    });

    it('should generate enriched context', async () => {
      // Create chunks with different types
      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '0',
        content: 'Document Title',
        elementType: 'title',
        pageNumber: 1,
      });

      await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '1',
        content: 'First paragraph with important information.',
        elementType: 'paragraph',
        pageNumber: 1,
      });

      // Generate enriched context
      const context = await ADEChunkHelpers.generateEnrichedContext(
        mockDocumentId,
        {
          includePageNumbers: true,
          includeElementTypes: true,
          includeStructuralContext: true,
          maxChunks: 10,
        },
      );

      expect(context).toContain('Document Structure:');
      expect(context).toContain('1. Document Title');
      expect(context).toContain('[TITLE] Document Title');
      expect(context).toContain(
        '[PARAGRAPH] (Page 1) First paragraph with important information.',
      );
    });

    it('should validate bounding boxes correctly', async () => {
      // Test array format
      expect(ADEChunkHelpers.validateBoundingBox([10, 20, 100, 200])).toBe(
        true,
      );

      // Test object format
      expect(
        ADEChunkHelpers.validateBoundingBox({
          x1: 10,
          y1: 20,
          x2: 100,
          y2: 200,
        }),
      ).toBe(true);

      // Test null
      expect(ADEChunkHelpers.validateBoundingBox(null)).toBe(true);

      // Test invalid formats
      expect(ADEChunkHelpers.validateBoundingBox('invalid')).toBe(false);
      expect(ADEChunkHelpers.validateBoundingBox([1, 2, 3])).toBe(false);
      expect(ADEChunkHelpers.validateBoundingBox({ x1: 10, y1: 20 })).toBe(
        false,
      );
    });

    it('should validate element types correctly', async () => {
      expect(ADEChunkHelpers.isValidElementType('paragraph')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('title')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('table_text')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType(null)).toBe(true);

      expect(ADEChunkHelpers.isValidElementType('invalid_type')).toBe(false);
      expect(ADEChunkHelpers.isValidElementType(123)).toBe(false);
    });
  });

  describe('Traditional Chunking', () => {
    it('should create traditional chunks without ADE metadata', async () => {
      const testContent =
        'This is a test document with multiple sentences. It contains various information that should be chunked properly.';

      // Create chunks without ADE
      const chunks = await processor.createChunks({
        documentId: mockDocumentId,
        content: testContent,
        db,
        useADE: false, // Explicitly disable ADE
      });

      expect(chunks.length).toBeGreaterThan(0);

      // All chunks should have null ADE metadata
      chunks.forEach((chunk) => {
        expect(chunk.elementType).toBeNull();
        expect(chunk.pageNumber).toBeNull();
        expect(chunk.bbox).toBeNull();
      });

      // Content should be chunked
      expect(chunks[0].content).toContain('This is a test document');
    });
  });

  describe('Element Type Mapping', () => {
    it('should handle different element types through helper creation', async () => {
      const testTypes = [
        'paragraph',
        'title',
        'header',
        'footer',
        'table_text',
        'figure_caption',
        'list_item',
        'footnote',
      ];

      for (const elementType of testTypes) {
        const chunk = await ADEChunkHelpers.createChunkWithADE({
          documentId: mockDocumentId,
          chunkIndex: elementType,
          content: `Test content for ${elementType}`,
          elementType: elementType as any,
          pageNumber: 1,
        });

        expect(chunk.elementType).toBe(elementType);
        expect(chunk.content).toBe(`Test content for ${elementType}`);
      }
    });
  });

  describe('Bounding Box Handling', () => {
    it('should handle different bounding box formats', async () => {
      // Array format
      const chunk1 = await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '0',
        content: 'Test content 1',
        bbox: [10, 20, 100, 200],
      });
      expect(chunk1.bbox).toEqual([10, 20, 100, 200]);

      // Object format (should be converted to array)
      const chunk2 = await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '1',
        content: 'Test content 2',
        bbox: { x1: 50, y1: 60, x2: 150, y2: 160 },
      });
      expect(chunk2.bbox).toEqual({ x1: 50, y1: 60, x2: 150, y2: 160 });

      // Null
      const chunk3 = await ADEChunkHelpers.createChunkWithADE({
        documentId: mockDocumentId,
        chunkIndex: '2',
        content: 'Test content 3',
        bbox: null,
      });
      expect(chunk3.bbox).toBeNull();
    });
  });
});
