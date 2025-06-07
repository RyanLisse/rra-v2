import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { documentChunk, ragDocument, user } from '@/lib/db/schema';
import type { DocumentChunk } from '@/lib/db/schema';

describe('ADE Schema Changes', () => {
  let testUserId: string;
  let testDocumentId: string;
  let testChunkId: string;

  beforeAll(async () => {
    // Create test user
    const testUser = await db.insert(user).values({
      email: 'test-ade@example.com',
      name: 'ADE Test User',
      type: 'regular',
      isAnonymous: false,
    }).returning();
    testUserId = testUser[0].id;

    // Create test document
    const testDoc = await db.insert(ragDocument).values({
      fileName: 'test-ade-document.pdf',
      originalName: 'test-ade-document.pdf',
      filePath: '/test/path/test-ade-document.pdf',
      mimeType: 'application/pdf',
      fileSize: '1024',
      status: 'uploaded',
      uploadedBy: testUserId,
    }).returning();
    testDocumentId = testDoc[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testChunkId) {
      await db.delete(documentChunk).where(eq(documentChunk.id, testChunkId));
    }
    await db.delete(ragDocument).where(eq(ragDocument.id, testDocumentId));
    await db.delete(user).where(eq(user.id, testUserId));
  });

  it('should create chunks with legacy fields only (backward compatibility)', async () => {
    // Test that existing chunks without ADE metadata continue to work
    const legacyChunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '0',
      content: 'This is a legacy chunk without ADE metadata.',
      metadata: { source: 'legacy' },
      tokenCount: '10',
      // No ADE fields - they should be null
    }).returning();

    expect(legacyChunk).toBeDefined();
    expect(legacyChunk[0].id).toBeDefined();
    expect(legacyChunk[0].elementType).toBeNull();
    expect(legacyChunk[0].pageNumber).toBeNull();
    expect(legacyChunk[0].bbox).toBeNull();

    // Clean up
    await db.delete(documentChunk).where(eq(documentChunk.id, legacyChunk[0].id));
  });

  it('should create chunks with ADE metadata fields', async () => {
    // Test that new ADE metadata fields can be populated
    const adeChunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '1',
      content: 'This is a title from the document.',
      metadata: { source: 'ade' },
      tokenCount: '8',
      // ADE metadata fields
      elementType: 'title',
      pageNumber: 1,
      bbox: [100, 200, 300, 250], // [x1, y1, x2, y2]
    }).returning();

    testChunkId = adeChunk[0].id;

    expect(adeChunk).toBeDefined();
    expect(adeChunk[0].id).toBeDefined();
    expect(adeChunk[0].elementType).toBe('title');
    expect(adeChunk[0].pageNumber).toBe(1);
    expect(adeChunk[0].bbox).toEqual([100, 200, 300, 250]);
  });

  it('should handle different element types', async () => {
    const elementTypes = ['paragraph', 'figure_caption', 'table_text', 'list_item'];
    
    for (let i = 0; i < elementTypes.length; i++) {
      const chunk = await db.insert(documentChunk).values({
        documentId: testDocumentId,
        chunkIndex: `${i + 2}`,
        content: `This is a ${elementTypes[i]} element.`,
        elementType: elementTypes[i],
        pageNumber: i + 1,
        bbox: [10 * i, 20 * i, 30 * i, 40 * i],
      }).returning();

      expect(chunk[0].elementType).toBe(elementTypes[i]);
      expect(chunk[0].pageNumber).toBe(i + 1);

      // Clean up
      await db.delete(documentChunk).where(eq(documentChunk.id, chunk[0].id));
    }
  });

  it('should query chunks by element type', async () => {
    // Create test chunks with different element types
    const titleChunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '10',
      content: 'Title content',
      elementType: 'title',
      pageNumber: 1,
    }).returning();

    const paragraphChunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '11',
      content: 'Paragraph content',
      elementType: 'paragraph',
      pageNumber: 1,
    }).returning();

    // Query by element type
    const titleChunks = await db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.elementType, 'title'));

    const foundTitleChunk = titleChunks.find(chunk => chunk.id === titleChunk[0].id);
    expect(foundTitleChunk).toBeDefined();
    expect(foundTitleChunk?.elementType).toBe('title');

    // Clean up
    await db.delete(documentChunk).where(eq(documentChunk.id, titleChunk[0].id));
    await db.delete(documentChunk).where(eq(documentChunk.id, paragraphChunk[0].id));
  });

  it('should query chunks by page number', async () => {
    // Create chunks on different pages
    const page1Chunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '20',
      content: 'Page 1 content',
      pageNumber: 1,
    }).returning();

    const page2Chunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '21',
      content: 'Page 2 content',
      pageNumber: 2,
    }).returning();

    // Query by page number
    const page1Chunks = await db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.pageNumber, 1));

    const foundPage1Chunk = page1Chunks.find(chunk => chunk.id === page1Chunk[0].id);
    expect(foundPage1Chunk).toBeDefined();
    expect(foundPage1Chunk?.pageNumber).toBe(1);

    // Clean up
    await db.delete(documentChunk).where(eq(documentChunk.id, page1Chunk[0].id));
    await db.delete(documentChunk).where(eq(documentChunk.id, page2Chunk[0].id));
  });

  it('should handle bbox coordinates as JSONB', async () => {
    const bboxChunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '30',
      content: 'Content with bounding box',
      elementType: 'paragraph',
      pageNumber: 1,
      bbox: [50.5, 100.2, 200.8, 150.3], // Test with decimal coordinates
    }).returning();

    expect(bboxChunk[0].bbox).toEqual([50.5, 100.2, 200.8, 150.3]);

    // Test complex bbox structure (if needed in the future)
    const complexBboxChunk = await db.insert(documentChunk).values({
      documentId: testDocumentId,
      chunkIndex: '31',
      content: 'Content with complex bbox',
      bbox: { x1: 50, y1: 100, x2: 200, y2: 150, confidence: 0.95 },
    }).returning();

    expect(complexBboxChunk[0].bbox).toMatchObject({
      x1: 50,
      y1: 100,
      x2: 200,
      y2: 150,
      confidence: 0.95,
    });

    // Clean up
    await db.delete(documentChunk).where(eq(documentChunk.id, bboxChunk[0].id));
    await db.delete(documentChunk).where(eq(documentChunk.id, complexBboxChunk[0].id));
  });

  it('should verify TypeScript types include new fields', () => {
    // This test verifies that the TypeScript types are correctly updated
    const chunkType: DocumentChunk = {
      id: 'test-id',
      documentId: 'test-doc-id',
      chunkIndex: '0',
      content: 'test content',
      metadata: null,
      tokenCount: null,
      elementType: 'paragraph',
      pageNumber: 1,
      bbox: [0, 0, 100, 100],
      createdAt: new Date(),
    };

    expect(chunkType.elementType).toBe('paragraph');
    expect(chunkType.pageNumber).toBe(1);
    expect(chunkType.bbox).toEqual([0, 0, 100, 100]);
  });
});