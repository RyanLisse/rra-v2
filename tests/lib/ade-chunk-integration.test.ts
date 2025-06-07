import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DocumentProcessor } from '@/lib/document-processing/document-processor';
import type { AdeOutput } from '@/lib/ade/types';
import { db } from '@/lib/db';
import { ragDocument, documentContent, documentChunk } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Mock ADE processor
vi.mock('@/lib/ade/processor', () => ({
  processDocumentWithAde: vi.fn(),
  groupElementsByPage: vi.fn(),
  extractTextFromAdeElements: vi.fn(),
}));

// Import mocked functions
import {
  processDocumentWithAde,
  groupElementsByPage,
} from '@/lib/ade/processor';

describe('ADE Chunk Integration', () => {
  let processor: DocumentProcessor;
  let mockDocumentId: string;
  let mockDocument: any;

  beforeEach(async () => {
    processor = new DocumentProcessor();
    mockDocumentId = `test-doc-${Date.now()}`;

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
        uploadedBy: 'test-user-id',
      })
      .returning();

    mockDocument = doc;
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

    vi.clearAllMocks();
  });

  describe('ADE Integration in Chunking', () => {
    it('should create chunks with ADE metadata when ADE output is available', async () => {
      // Mock ADE output
      const mockAdeOutput: AdeOutput = {
        documentId: mockDocumentId,
        elements: [
          {
            id: 'elem-1',
            type: 'title',
            content: 'Document Title',
            pageNumber: 1,
            bbox: [50, 50, 500, 80],
            confidence: 0.95,
            metadata: { is_primary_title: true },
          },
          {
            id: 'elem-2',
            type: 'paragraph',
            content:
              'This is a paragraph with important information about the document.',
            pageNumber: 1,
            bbox: [50, 100, 500, 150],
            confidence: 0.92,
          },
          {
            id: 'elem-3',
            type: 'table_text',
            content: 'Column 1\tColumn 2\nValue 1\tValue 2',
            pageNumber: 2,
            bbox: [50, 200, 500, 300],
            confidence: 0.88,
            metadata: { element_type: 'data_table' },
          },
        ],
        processingTimeMs: 2500,
        totalElements: 3,
        pageCount: 2,
        confidence: 0.92,
      };

      // Mock the ADE processor
      vi.mocked(processDocumentWithAde).mockResolvedValue(mockAdeOutput);
      vi.mocked(groupElementsByPage).mockReturnValue(
        new Map([
          [1, mockAdeOutput.elements.slice(0, 2)],
          [2, mockAdeOutput.elements.slice(2, 3)],
        ]),
      );

      // Create chunks with ADE integration
      const chunks = await processor.createChunks({
        documentId: mockDocumentId,
        content: 'fallback content',
        db,
        filePath: mockDocument.filePath,
        useADE: true,
      });

      // Verify chunks were created with ADE metadata
      expect(chunks).toHaveLength(3);

      // Check title chunk
      const titleChunk = chunks[0];
      expect(titleChunk.content).toBe('Document Title');
      expect(titleChunk.elementType).toBe('title');
      expect(titleChunk.pageNumber).toBe(1);
      expect(titleChunk.bbox).toEqual([50, 50, 500, 80]);
      expect(titleChunk.metadata).toMatchObject({
        adeElementId: 'elem-1',
        originalElementType: 'title',
        confidence: 0.95,
        is_primary_title: true,
      });

      // Check paragraph chunk
      const paragraphChunk = chunks[1];
      expect(paragraphChunk.content).toBe(
        'This is a paragraph with important information about the document.',
      );
      expect(paragraphChunk.elementType).toBe('paragraph');
      expect(paragraphChunk.pageNumber).toBe(1);

      // Check table chunk
      const tableChunk = chunks[2];
      expect(tableChunk.content).toBe('Column 1\tColumn 2\nValue 1\tValue 2');
      expect(tableChunk.elementType).toBe('table_text');
      expect(tableChunk.pageNumber).toBe(2);
      expect(tableChunk.metadata).toMatchObject({
        element_type: 'data_table',
      });
    });

    it('should fall back to traditional chunking when ADE fails', async () => {
      // Mock ADE processor to fail
      vi.mocked(processDocumentWithAde).mockRejectedValue(
        new Error('ADE processing failed'),
      );

      const testContent =
        'This is a test document with multiple sentences. It should be chunked traditionally when ADE is not available.';

      // Create chunks (should fall back to traditional)
      const chunks = await processor.createChunks({
        documentId: mockDocumentId,
        content: testContent,
        db,
        filePath: mockDocument.filePath,
        useADE: true,
      });

      // Verify traditional chunks were created
      expect(chunks.length).toBeGreaterThan(0);

      // All chunks should have null ADE metadata
      chunks.forEach((chunk) => {
        expect(chunk.elementType).toBeNull();
        expect(chunk.pageNumber).toBeNull();
        expect(chunk.bbox).toBeNull();
      });

      // Content should match traditional chunking
      expect(chunks[0].content).toContain('This is a test document');
    });

    it('should handle empty ADE output gracefully', async () => {
      // Mock empty ADE output
      const emptyAdeOutput: AdeOutput = {
        documentId: mockDocumentId,
        elements: [],
        processingTimeMs: 1000,
        totalElements: 0,
        pageCount: 1,
        confidence: 0.0,
      };

      vi.mocked(processDocumentWithAde).mockResolvedValue(emptyAdeOutput);
      vi.mocked(groupElementsByPage).mockReturnValue(new Map());

      const testContent = 'Test content for empty ADE output scenario.';

      // Create chunks (should fall back due to empty elements)
      const chunks = await processor.createChunks({
        documentId: mockDocumentId,
        content: testContent,
        db,
        filePath: mockDocument.filePath,
        useADE: true,
      });

      // Should fall back to traditional chunking
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].elementType).toBeNull();
      expect(chunks[0].content).toContain('Test content');
    });
  });

  describe('Enhanced Embeddings with ADE Context', () => {
    it('should create enriched text for embeddings with ADE metadata', async () => {
      const testChunks = [
        {
          id: 'chunk-1',
          content: 'This is a document title',
          elementType: 'title',
          pageNumber: 1,
          bbox: [50, 50, 500, 80],
          metadata: { is_primary_title: true },
        },
        {
          id: 'chunk-2',
          content: 'This is a regular paragraph',
          elementType: 'paragraph',
          pageNumber: 1,
          bbox: null,
          metadata: null,
        },
        {
          id: 'chunk-3',
          content: 'Header | Value\nRow 1 | Data 1',
          elementType: 'table_text',
          pageNumber: 2,
          bbox: null,
          metadata: { element_type: 'data_table' },
        },
      ];

      // Generate embeddings (mocked)
      const embeddings = await processor.generateEmbeddingsWithADE({
        chunks: testChunks,
        batchSize: 10,
        db,
      });

      // Should create embeddings for all chunks
      expect(embeddings).toHaveLength(3);

      // Embeddings should be created with proper chunk IDs
      embeddings.forEach((embedding, index) => {
        expect(embedding.chunkId).toBe(testChunks[index].id);
        expect(embedding.model).toBe('cohere-embed-v4.0');
      });
    });

    it('should handle chunks without ADE metadata in embeddings', async () => {
      const testChunks = [
        {
          id: 'chunk-1',
          content: 'Plain text without ADE metadata',
          elementType: null,
          pageNumber: null,
          bbox: null,
          metadata: null,
        },
      ];

      const embeddings = await processor.generateEmbeddingsWithADE({
        chunks: testChunks,
        batchSize: 10,
        db,
      });

      expect(embeddings).toHaveLength(1);
      expect(embeddings[0].chunkId).toBe('chunk-1');
    });
  });

  describe('Element Type Mapping', () => {
    it('should map ADE element types correctly', async () => {
      const testMappings = [
        { ade: 'paragraph', expected: 'paragraph' },
        { ade: 'title', expected: 'title' },
        { ade: 'header', expected: 'header' },
        { ade: 'table', expected: 'table_text' },
        { ade: 'table_text', expected: 'table_text' },
        { ade: 'figure', expected: 'figure_caption' },
        { ade: 'caption', expected: 'figure_caption' },
        { ade: 'list_item', expected: 'list_item' },
        { ade: 'unknown_type', expected: 'paragraph' }, // fallback
      ];

      // Create a test method to access the private mapAdeElementType
      const processorAny = processor as any;

      testMappings.forEach(({ ade, expected }) => {
        const mapped = processorAny.mapAdeElementType(ade);
        expect(mapped).toBe(expected);
      });
    });
  });

  describe('Bounding Box Mapping', () => {
    it('should handle different bounding box formats', async () => {
      const processorAny = processor as any;

      // Array format
      const arrayBbox = [10, 20, 100, 200];
      expect(processorAny.mapAdeBoundingBox(arrayBbox)).toEqual([
        10, 20, 100, 200,
      ]);

      // Object format
      const objectBbox = { x1: 10, y1: 20, x2: 100, y2: 200 };
      expect(processorAny.mapAdeBoundingBox(objectBbox)).toEqual([
        10, 20, 100, 200,
      ]);

      // Null/undefined
      expect(processorAny.mapAdeBoundingBox(null)).toBeNull();
      expect(processorAny.mapAdeBoundingBox(undefined)).toBeNull();

      // Invalid format
      expect(processorAny.mapAdeBoundingBox('invalid')).toBeNull();
    });
  });

  describe('Complete Document Processing', () => {
    it('should process document end-to-end with ADE integration', async () => {
      // Mock successful ADE output
      const mockAdeOutput: AdeOutput = {
        documentId: mockDocumentId,
        elements: [
          {
            id: 'elem-1',
            type: 'title',
            content: 'Test Document',
            pageNumber: 1,
            bbox: [50, 50, 500, 80],
            confidence: 0.95,
          },
        ],
        processingTimeMs: 1500,
        totalElements: 1,
        pageCount: 1,
        confidence: 0.95,
      };

      vi.mocked(processDocumentWithAde).mockResolvedValue(mockAdeOutput);
      vi.mocked(groupElementsByPage).mockReturnValue(
        new Map([[1, mockAdeOutput.elements]]),
      );

      // Mock document processing success
      const mockProcessingResult = {
        success: true,
        text: 'Test Document\n\nThis is the content of the test document.',
        metadata: { pageCount: 1, confidence: 0.95 },
      };

      // Spy on processDocument method
      vi.spyOn(processor as any, 'processDocument').mockResolvedValue(
        mockProcessingResult,
      );

      // Process document completely
      const result = await processor.processDocumentComplete({
        documentId: mockDocumentId,
        db,
        useADE: true,
        generateEmbeddings: true,
      });

      // Verify results
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.chunks).toHaveLength(1);

      // Verify chunk has ADE metadata
      const chunk = result.chunks[0];
      expect(chunk.elementType).toBe('title');
      expect(chunk.pageNumber).toBe(1);
      expect(chunk.content).toBe('Test Document');
    });
  });
});
