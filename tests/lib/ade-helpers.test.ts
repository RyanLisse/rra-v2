import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ragDocument, user } from '@/lib/db/schema';
import { ADEChunkHelpers } from '@/lib/db/ade-helpers';

describe('ADE Helpers', () => {
  let testUserId: string;
  let testDocumentId: string;
  const createdChunkIds: string[] = [];

  beforeAll(async () => {
    // Create test user
    const testUser = await db
      .insert(user)
      .values({
        email: 'test-ade-helpers@example.com',
        name: 'ADE Helpers Test User',
        type: 'regular',
        isAnonymous: false,
      })
      .returning();
    testUserId = testUser[0].id;

    // Create test document
    const testDoc = await db
      .insert(ragDocument)
      .values({
        fileName: 'test-ade-helpers-document.pdf',
        originalName: 'test-ade-helpers-document.pdf',
        filePath: '/test/path/test-ade-helpers-document.pdf',
        mimeType: 'application/pdf',
        fileSize: '2048',
        status: 'uploaded',
        uploadedBy: testUserId,
      })
      .returning();
    testDocumentId = testDoc[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    for (const chunkId of createdChunkIds) {
      await db
        .delete(ragDocument)
        .where(eq(ragDocument.id, chunkId))
        .catch(() => {});
    }
    await db.delete(ragDocument).where(eq(ragDocument.id, testDocumentId));
    await db.delete(user).where(eq(user.id, testUserId));
  });

  it('should create chunk with ADE metadata using helper', async () => {
    const chunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '1',
      content: 'Test title content',
      elementType: 'title',
      pageNumber: 1,
      bbox: [100, 200, 300, 250],
      metadata: { source: 'ade-helper-test' },
      tokenCount: '4',
    });

    createdChunkIds.push(chunk.id);

    expect(chunk.elementType).toBe('title');
    expect(chunk.pageNumber).toBe(1);
    expect(chunk.bbox).toEqual([100, 200, 300, 250]);
  });

  it('should get chunks by element type', async () => {
    // Create test chunks with different element types
    const titleChunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '2',
      content: 'Another title',
      elementType: 'title',
      pageNumber: 1,
    });

    const paragraphChunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '3',
      content: 'A paragraph',
      elementType: 'paragraph',
      pageNumber: 1,
    });

    createdChunkIds.push(titleChunk.id, paragraphChunk.id);

    const titleChunks = await ADEChunkHelpers.getChunksByElementType(
      testDocumentId,
      'title',
    );
    const foundTitles = titleChunks.filter(
      (chunk) =>
        chunk.id === titleChunk.id || createdChunkIds.includes(chunk.id),
    );

    expect(foundTitles.length).toBeGreaterThanOrEqual(1);
    expect(foundTitles.every((chunk) => chunk.elementType === 'title')).toBe(
      true,
    );
  });

  it('should get chunks by page number', async () => {
    const page2Chunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '4',
      content: 'Page 2 content',
      elementType: 'paragraph',
      pageNumber: 2,
    });

    createdChunkIds.push(page2Chunk.id);

    const page2Chunks = await ADEChunkHelpers.getChunksByPage(
      testDocumentId,
      2,
    );
    const foundChunk = page2Chunks.find((chunk) => chunk.id === page2Chunk.id);

    expect(foundChunk).toBeDefined();
    expect(foundChunk?.pageNumber).toBe(2);
  });

  it('should get document structure', async () => {
    // Create structured content
    const titleChunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '5',
      content: 'Main Title',
      elementType: 'title',
      pageNumber: 1,
    });

    const headerChunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '6',
      content: 'Section Header',
      elementType: 'header',
      pageNumber: 1,
    });

    const figureChunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '7',
      content: 'Figure 1: Test diagram',
      elementType: 'figure_caption',
      pageNumber: 2,
    });

    createdChunkIds.push(titleChunk.id, headerChunk.id, figureChunk.id);

    const structure =
      await ADEChunkHelpers.getDocumentStructure(testDocumentId);

    expect(structure.titles.length).toBeGreaterThanOrEqual(1);
    expect(structure.headers.length).toBeGreaterThanOrEqual(1);
    expect(structure.structure.length).toBeGreaterThanOrEqual(2);

    const foundTitle = structure.titles.find(
      (chunk) => chunk.id === titleChunk.id,
    );
    expect(foundTitle?.content).toBe('Main Title');
  });

  it('should update chunk with ADE metadata', async () => {
    const chunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '8',
      content: 'Chunk to update',
      elementType: 'paragraph',
      pageNumber: 1,
    });

    createdChunkIds.push(chunk.id);

    const updatedChunk = await ADEChunkHelpers.updateChunkADE(chunk.id, {
      elementType: 'title',
      pageNumber: 2,
      bbox: [50, 100, 200, 150],
    });

    expect(updatedChunk.elementType).toBe('title');
    expect(updatedChunk.pageNumber).toBe(2);
    expect(updatedChunk.bbox).toEqual([50, 100, 200, 150]);
  });

  it('should generate enriched context', async () => {
    // Create some sample content
    const titleChunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '9',
      content: 'Document Title',
      elementType: 'title',
      pageNumber: 1,
    });

    const paragraphChunk = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '10',
      content: 'This is the main content of the document.',
      elementType: 'paragraph',
      pageNumber: 1,
    });

    createdChunkIds.push(titleChunk.id, paragraphChunk.id);

    const context = await ADEChunkHelpers.generateEnrichedContext(
      testDocumentId,
      {
        includePageNumbers: true,
        includeElementTypes: true,
        includeStructuralContext: true,
        maxChunks: 10,
      },
    );

    expect(context).toContain('Document Structure:');
    expect(context).toContain('Document Title');
    expect(context).toContain('[TITLE]');
    expect(context).toContain('[PARAGRAPH]');
    expect(context).toContain('(Page 1)');
  });

  it('should validate bounding box formats', () => {
    // Valid formats
    expect(ADEChunkHelpers.validateBoundingBox(null)).toBe(true);
    expect(ADEChunkHelpers.validateBoundingBox([0, 0, 100, 100])).toBe(true);
    expect(
      ADEChunkHelpers.validateBoundingBox({ x1: 0, y1: 0, x2: 100, y2: 100 }),
    ).toBe(true);
    expect(
      ADEChunkHelpers.validateBoundingBox({
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        confidence: 0.95,
      }),
    ).toBe(true);

    // Invalid formats
    expect(ADEChunkHelpers.validateBoundingBox([0, 0, 100])).toBe(false);
    expect(ADEChunkHelpers.validateBoundingBox({ x1: 0, y1: 0 })).toBe(false);
    expect(ADEChunkHelpers.validateBoundingBox('invalid')).toBe(false);
    expect(ADEChunkHelpers.validateBoundingBox(123)).toBe(false);
  });

  it('should validate element types', () => {
    // Valid types
    expect(ADEChunkHelpers.isValidElementType('paragraph')).toBe(true);
    expect(ADEChunkHelpers.isValidElementType('title')).toBe(true);
    expect(ADEChunkHelpers.isValidElementType('figure_caption')).toBe(true);
    expect(ADEChunkHelpers.isValidElementType(null)).toBe(true);

    // Invalid types
    expect(ADEChunkHelpers.isValidElementType('invalid_type')).toBe(false);
    expect(ADEChunkHelpers.isValidElementType(123)).toBe(false);
    expect(ADEChunkHelpers.isValidElementType({})).toBe(false);
  });

  it('should get chunks in region', async () => {
    const chunk1 = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '11',
      content: 'Top left content',
      pageNumber: 1,
      bbox: [0, 0, 100, 100],
    });

    const chunk2 = await ADEChunkHelpers.createChunkWithADE({
      documentId: testDocumentId,
      chunkIndex: '12',
      content: 'Bottom right content',
      pageNumber: 1,
      bbox: [200, 200, 300, 300],
    });

    createdChunkIds.push(chunk1.id, chunk2.id);

    // Get chunks in top-left region
    const topLeftChunks = await ADEChunkHelpers.getChunksInRegion(
      testDocumentId,
      1,
      {
        maxX: 150,
        maxY: 150,
      },
    );

    const foundChunk1 = topLeftChunks.find((chunk) => chunk.id === chunk1.id);
    const foundChunk2 = topLeftChunks.find((chunk) => chunk.id === chunk2.id);

    expect(foundChunk1).toBeDefined();
    expect(foundChunk2).toBeUndefined(); // Should not be in top-left region
  });
});
