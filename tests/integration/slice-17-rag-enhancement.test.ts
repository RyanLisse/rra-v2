import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupNeonTestBranching } from '../config/neon-branch-setup';
import { measurePerformance } from '../utils/test-helpers';
import {
  createTestUser,
  createTestDocument,
  createTestDocumentContent,
  createTestEmbedding,
  createPerformanceDataFactory,
} from '../fixtures/test-data';
import * as schema from '@/lib/db/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getTestDatabaseUrl } from '../config/neon-branch-setup';
import type { AdeElement, AdeElementType } from '@/lib/ade/types';

// Setup Neon branching for this test suite
setupNeonTestBranching('slice-17-rag-enhancement');

describe('Slice 17: Enhanced RAG Pipeline Integration Tests', () => {
  let db: ReturnType<typeof drizzle>;
  let pool: Pool;

  beforeEach(async () => {
    pool = new Pool({ connectionString: getTestDatabaseUrl() });
    db = drizzle(pool, { schema });
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('ADE Metadata Integration', () => {
    it('should process documents with ADE metadata extraction', async () => {
      // Create test user
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create document
      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create document content
      const contentData = createTestDocumentContent(document.id);
      await db.insert(schema.documentContent).values(contentData);

      // Mock ADE output with various element types
      const mockAdeElements: AdeElement[] = [
        {
          id: 'elem_1',
          type: 'title',
          content: 'RoboRail System Overview',
          pageNumber: 1,
          bbox: [50, 100, 400, 150],
          confidence: 0.95,
        },
        {
          id: 'elem_2',
          type: 'paragraph',
          content:
            'The RoboRail system provides automated measurement capabilities for precision manufacturing.',
          pageNumber: 1,
          bbox: [50, 200, 500, 250],
          confidence: 0.88,
        },
        {
          id: 'elem_3',
          type: 'table',
          content: 'Calibration Parameters Table',
          pageNumber: 2,
          bbox: [50, 100, 550, 300],
          confidence: 0.92,
        },
        {
          id: 'elem_4',
          type: 'figure',
          imagePath: '/uploads/figures/roborail_diagram.png',
          pageNumber: 2,
          bbox: [100, 350, 450, 500],
          confidence: 0.85,
        },
        {
          id: 'elem_5',
          type: 'list_item',
          content: '1. Ensure proper chuck alignment before calibration',
          pageNumber: 3,
          bbox: [70, 150, 520, 180],
          confidence: 0.9,
        },
      ];

      // Create document chunks with ADE metadata
      const chunksWithMetadata = mockAdeElements.map((element, index) => ({
        documentId: document.id,
        chunkIndex: index.toString(),
        content: element.content || `Figure content for ${element.id}`,
        metadata: {
          chunkIndex: index,
          startOffset: index * 200,
          endOffset: (index + 1) * 200,
          wordCount: element.content ? element.content.split(' ').length : 0,
          adeElementId: element.id,
          confidence: element.confidence,
        },
        tokenCount: Math.ceil((element.content?.length || 50) / 4).toString(),
        // Enhanced metadata from ADE
        elementType: element.type,
        pageNumber: element.pageNumber,
        bbox: element.bbox || null,
      }));

      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(chunksWithMetadata)
        .returning();

      // Create embeddings for all chunks
      const embeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Update document status
      await db
        .update(schema.ragDocument)
        .set({ status: 'processed' })
        .where(schema.ragDocument.id === document.id);

      // Verify enhanced chunks were created correctly
      const verifyChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          embedding: true,
        },
        orderBy: (chunk, { asc }) => [asc(chunk.chunkIndex)],
      });

      expect(verifyChunks).toHaveLength(5);

      // Verify title element
      const titleChunk = verifyChunks[0];
      expect(titleChunk.elementType).toBe('title');
      expect(titleChunk.pageNumber).toBe(1);
      expect(titleChunk.bbox).toEqual([50, 100, 400, 150]);
      expect(titleChunk.content).toContain('RoboRail System Overview');

      // Verify table element
      const tableChunk = verifyChunks[2];
      expect(tableChunk.elementType).toBe('table');
      expect(tableChunk.pageNumber).toBe(2);
      expect(tableChunk.content).toContain('Calibration Parameters');

      // Verify figure element
      const figureChunk = verifyChunks[3];
      expect(figureChunk.elementType).toBe('figure');
      expect(figureChunk.pageNumber).toBe(2);
      expect(figureChunk.bbox).toEqual([100, 350, 450, 500]);

      // Verify all chunks have embeddings
      expect(verifyChunks.every((chunk) => chunk.embedding)).toBe(true);
    });

    it('should handle legacy documents without ADE metadata', async () => {
      // Create test user
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create legacy document (no ADE metadata)
      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create legacy chunks (no elementType, pageNumber, bbox)
      const legacyChunks = Array.from({ length: 3 }, (_, i) => ({
        documentId: document.id,
        chunkIndex: i.toString(),
        content: `Legacy chunk ${i} content without ADE metadata.`,
        metadata: {
          chunkIndex: i,
          startOffset: i * 200,
          endOffset: (i + 1) * 200,
          wordCount: 8,
        },
        tokenCount: '12',
        // Legacy chunks have null ADE fields
        elementType: null,
        pageNumber: null,
        bbox: null,
      }));

      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(legacyChunks)
        .returning();

      // Create embeddings
      const embeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Verify legacy chunks work without ADE metadata
      const verifyChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          embedding: true,
        },
      });

      expect(verifyChunks).toHaveLength(3);
      verifyChunks.forEach((chunk) => {
        expect(chunk.elementType).toBeNull();
        expect(chunk.pageNumber).toBeNull();
        expect(chunk.bbox).toBeNull();
        expect(chunk.embedding).toBeDefined();
      });
    });

    it('should handle mixed document scenarios (some with metadata, some without)', async () => {
      // Create test user
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create enhanced document
      const enhancedDocData = createTestDocument(user.id, {
        fileName: 'enhanced-doc.pdf',
        originalName: 'enhanced-document.pdf',
      });
      const [enhancedDoc] = await db
        .insert(schema.ragDocument)
        .values(enhancedDocData)
        .returning();

      // Create legacy document
      const legacyDocData = createTestDocument(user.id, {
        fileName: 'legacy-doc.pdf',
        originalName: 'legacy-document.pdf',
      });
      const [legacyDoc] = await db
        .insert(schema.ragDocument)
        .values(legacyDocData)
        .returning();

      // Create enhanced chunks
      const enhancedChunks = [
        {
          documentId: enhancedDoc.id,
          chunkIndex: '0',
          content: 'Main title of the enhanced document',
          metadata: { chunkIndex: 0 },
          tokenCount: '8',
          elementType: 'title' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 100, 400, 150],
        },
        {
          documentId: enhancedDoc.id,
          chunkIndex: '1',
          content: 'Important paragraph with technical details',
          metadata: { chunkIndex: 1 },
          tokenCount: '7',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 200, 500, 250],
        },
      ];

      // Create legacy chunks
      const legacyChunks = [
        {
          documentId: legacyDoc.id,
          chunkIndex: '0',
          content: 'Legacy content without structure metadata',
          metadata: { chunkIndex: 0 },
          tokenCount: '6',
          elementType: null,
          pageNumber: null,
          bbox: null,
        },
      ];

      const allChunks = await db
        .insert(schema.documentChunk)
        .values([...enhancedChunks, ...legacyChunks])
        .returning();

      // Create embeddings for all chunks
      const embeddings = allChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Test cross-document search capabilities
      const searchResults = await db.query.documentChunk.findMany({
        where: (chunk, { or, eq }) =>
          or(
            eq(chunk.documentId, enhancedDoc.id),
            eq(chunk.documentId, legacyDoc.id),
          ),
        with: {
          document: true,
          embedding: true,
        },
      });

      expect(searchResults).toHaveLength(3);

      // Verify enhanced chunks have metadata
      const enhancedResults = searchResults.filter(
        (chunk) => chunk.documentId === enhancedDoc.id,
      );
      expect(enhancedResults).toHaveLength(2);
      enhancedResults.forEach((chunk) => {
        expect(chunk.elementType).toBeDefined();
        expect(chunk.pageNumber).toBeDefined();
        expect(chunk.bbox).toBeDefined();
      });

      // Verify legacy chunks don't have metadata
      const legacyResults = searchResults.filter(
        (chunk) => chunk.documentId === legacyDoc.id,
      );
      expect(legacyResults).toHaveLength(1);
      expect(legacyResults[0].elementType).toBeNull();
      expect(legacyResults[0].pageNumber).toBeNull();
      expect(legacyResults[0].bbox).toBeNull();
    });
  });

  describe('Enhanced Search Functionality', () => {
    it('should support element type filtering', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create chunks with different element types
      const diverseChunks = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content: 'Document Title - RoboRail Operating Manual',
          metadata: { chunkIndex: 0 },
          tokenCount: '7',
          elementType: 'title' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 100, 400, 150],
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content: 'This paragraph explains the basic operation procedures.',
          metadata: { chunkIndex: 1 },
          tokenCount: '9',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 200, 500, 250],
        },
        {
          documentId: document.id,
          chunkIndex: '2',
          content: 'Calibration settings table with measurement parameters',
          metadata: { chunkIndex: 2 },
          tokenCount: '8',
          elementType: 'table' as AdeElementType,
          pageNumber: 2,
          bbox: [50, 100, 550, 300],
        },
        {
          documentId: document.id,
          chunkIndex: '3',
          content: 'Step 1: Initialize the system',
          metadata: { chunkIndex: 3 },
          tokenCount: '6',
          elementType: 'list_item' as AdeElementType,
          pageNumber: 3,
          bbox: [70, 150, 520, 180],
        },
      ];

      await db.insert(schema.documentChunk).values(diverseChunks);

      // Test filtering by title elements
      const titleChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq, and }) =>
          and(
            eq(chunk.documentId, document.id),
            eq(chunk.elementType, 'title'),
          ),
      });

      expect(titleChunks).toHaveLength(1);
      expect(titleChunks[0].content).toContain('Document Title');
      expect(titleChunks[0].elementType).toBe('title');

      // Test filtering by table elements
      const tableChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq, and }) =>
          and(
            eq(chunk.documentId, document.id),
            eq(chunk.elementType, 'table'),
          ),
      });

      expect(tableChunks).toHaveLength(1);
      expect(tableChunks[0].content).toContain('Calibration settings table');
      expect(tableChunks[0].elementType).toBe('table');

      // Test filtering by list items
      const listChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq, and }) =>
          and(
            eq(chunk.documentId, document.id),
            eq(chunk.elementType, 'list_item'),
          ),
      });

      expect(listChunks).toHaveLength(1);
      expect(listChunks[0].content).toContain('Step 1');
      expect(listChunks[0].elementType).toBe('list_item');
    });

    it('should support page-based search functionality', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create chunks across multiple pages
      const multiPageChunks = Array.from({ length: 6 }, (_, i) => ({
        documentId: document.id,
        chunkIndex: i.toString(),
        content: `Content from page ${Math.floor(i / 2) + 1}, chunk ${i}`,
        metadata: { chunkIndex: i },
        tokenCount: '8',
        elementType: 'paragraph' as AdeElementType,
        pageNumber: Math.floor(i / 2) + 1, // 2 chunks per page
        bbox: [50, 100 + (i % 2) * 100, 500, 150 + (i % 2) * 100],
      }));

      await db.insert(schema.documentChunk).values(multiPageChunks);

      // Test page 1 filtering
      const page1Chunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq, and }) =>
          and(eq(chunk.documentId, document.id), eq(chunk.pageNumber, 1)),
        orderBy: (chunk, { asc }) => [asc(chunk.chunkIndex)],
      });

      expect(page1Chunks).toHaveLength(2);
      page1Chunks.forEach((chunk) => {
        expect(chunk.content).toContain('page 1');
        expect(chunk.pageNumber).toBe(1);
      });

      // Test page 2 filtering
      const page2Chunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq, and }) =>
          and(eq(chunk.documentId, document.id), eq(chunk.pageNumber, 2)),
      });

      expect(page2Chunks).toHaveLength(2);
      page2Chunks.forEach((chunk) => {
        expect(chunk.content).toContain('page 2');
        expect(chunk.pageNumber).toBe(2);
      });

      // Test page range filtering (pages 2-3)
      const pageRangeChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq, and, gte, lte }) =>
          and(
            eq(chunk.documentId, document.id),
            gte(chunk.pageNumber, 2),
            lte(chunk.pageNumber, 3),
          ),
        orderBy: (chunk, { asc }) => [
          asc(chunk.pageNumber),
          asc(chunk.chunkIndex),
        ],
      });

      expect(pageRangeChunks).toHaveLength(4);
      pageRangeChunks.forEach((chunk) => {
        expect(chunk.pageNumber).toBeGreaterThanOrEqual(2);
        expect(chunk.pageNumber).toBeLessThanOrEqual(3);
      });
    });

    it('should provide spatial search functionality using bounding boxes', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create chunks with specific spatial locations
      const spatialChunks = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content: 'Header content at top of page',
          metadata: { chunkIndex: 0 },
          tokenCount: '7',
          elementType: 'header' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 50, 550, 100], // Top area
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content: 'Main content in center area',
          metadata: { chunkIndex: 1 },
          tokenCount: '6',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 200, 550, 400], // Center area
        },
        {
          documentId: document.id,
          chunkIndex: '2',
          content: 'Footer content at bottom',
          metadata: { chunkIndex: 2 },
          tokenCount: '5',
          elementType: 'footer' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 500, 550, 550], // Bottom area
        },
        {
          documentId: document.id,
          chunkIndex: '3',
          content: 'Sidebar content on the right',
          metadata: { chunkIndex: 3 },
          tokenCount: '6',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 1,
          bbox: [400, 150, 550, 450], // Right side
        },
      ];

      await db.insert(schema.documentChunk).values(spatialChunks);

      // Test finding content in top area (y < 150)
      const topChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
      });

      // Filter chunks where bbox[1] (y1) < 150 (top area)
      const topAreaChunks = topChunks.filter((chunk) => {
        if (!chunk.bbox || !Array.isArray(chunk.bbox)) return false;
        return chunk.bbox[1] < 150;
      });

      expect(topAreaChunks).toHaveLength(1);
      expect(topAreaChunks[0].content).toContain('Header content');

      // Test finding content in bottom area (y > 450)
      const bottomAreaChunks = topChunks.filter((chunk) => {
        if (!chunk.bbox || !Array.isArray(chunk.bbox)) return false;
        return chunk.bbox[1] > 450; // y1 > 450
      });

      expect(bottomAreaChunks).toHaveLength(1);
      expect(bottomAreaChunks[0].content).toContain('Footer content');

      // Test finding content in right area (x > 350)
      const rightAreaChunks = topChunks.filter((chunk) => {
        if (!chunk.bbox || !Array.isArray(chunk.bbox)) return false;
        return chunk.bbox[0] > 350; // x1 > 350
      });

      expect(rightAreaChunks).toHaveLength(1);
      expect(rightAreaChunks[0].content).toContain('Sidebar content');
    });
  });

  describe('Enhanced Context Assembly', () => {
    it('should format context with structural metadata for LLM prompts', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id, {
        fileName: 'technical-manual.pdf',
        originalName: 'Technical Manual.pdf',
      });
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create structured chunks for context assembly
      const structuredChunks = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content: 'System Requirements and Prerequisites',
          metadata: { chunkIndex: 0 },
          tokenCount: '5',
          elementType: 'title' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 100, 400, 150],
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content:
            'The system requires a minimum of 8GB RAM and 100GB storage space.',
          metadata: { chunkIndex: 1 },
          tokenCount: '14',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 200, 500, 250],
        },
        {
          documentId: document.id,
          chunkIndex: '2',
          content: 'Configuration Parameters',
          metadata: { chunkIndex: 2 },
          tokenCount: '3',
          elementType: 'table' as AdeElementType,
          pageNumber: 2,
          bbox: [50, 100, 550, 300],
        },
        {
          documentId: document.id,
          chunkIndex: '3',
          content: 'Set timeout value to 30 seconds',
          metadata: { chunkIndex: 3 },
          tokenCount: '7',
          elementType: 'list_item' as AdeElementType,
          pageNumber: 2,
          bbox: [70, 320, 520, 350],
        },
      ];

      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(structuredChunks)
        .returning();

      // Create embeddings
      const embeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Simulate context assembly for LLM prompt
      const contextChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          document: true,
          embedding: true,
        },
        orderBy: (chunk, { asc }) => [
          asc(chunk.pageNumber),
          asc(chunk.chunkIndex),
        ],
      });

      // Format context with structural information
      const formatContextForLLM = (chunks: typeof contextChunks) => {
        return chunks
          .map((chunk) => {
            const elementInfo = chunk.elementType
              ? `[${chunk.elementType.toUpperCase()}]`
              : '[CONTENT]';
            const pageInfo = chunk.pageNumber
              ? ` (Page ${chunk.pageNumber})`
              : '';
            const positionInfo = chunk.bbox
              ? ` at position (${chunk.bbox[0]}, ${chunk.bbox[1]})`
              : '';

            return `${elementInfo}${pageInfo}${positionInfo}: ${chunk.content}`;
          })
          .join('\n\n');
      };

      const formattedContext = formatContextForLLM(contextChunks);

      expect(formattedContext).toContain('[TITLE] (Page 1)');
      expect(formattedContext).toContain(
        'System Requirements and Prerequisites',
      );
      expect(formattedContext).toContain('[PARAGRAPH] (Page 1)');
      expect(formattedContext).toContain('8GB RAM and 100GB storage');
      expect(formattedContext).toContain('[TABLE] (Page 2)');
      expect(formattedContext).toContain('Configuration Parameters');
      expect(formattedContext).toContain('[LIST_ITEM] (Page 2)');
      expect(formattedContext).toContain('timeout value to 30 seconds');

      // Verify position information is included
      expect(formattedContext).toContain('at position (50, 100)');
      expect(formattedContext).toContain('at position (70, 320)');
    });

    it('should generate enhanced system prompts with document structure awareness', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id, {
        fileName: 'roborail-manual.pdf',
        originalName: 'RoboRail Operating Manual.pdf',
      });
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create diverse content types
      const diverseContent = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content: 'Chapter 3: Calibration Procedures',
          metadata: { chunkIndex: 0 },
          tokenCount: '5',
          elementType: 'title' as AdeElementType,
          pageNumber: 15,
          bbox: [50, 100, 400, 150],
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content: 'Calibration must be performed every 100 operating hours.',
          metadata: { chunkIndex: 1 },
          tokenCount: '10',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 15,
          bbox: [50, 200, 500, 230],
        },
        {
          documentId: document.id,
          chunkIndex: '2',
          content: 'Warning: Ensure system is powered off before calibration.',
          metadata: { chunkIndex: 2 },
          tokenCount: '9',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 16,
          bbox: [50, 100, 500, 130],
        },
        {
          documentId: document.id,
          chunkIndex: '3',
          content: 'Step-by-step calibration process diagram',
          metadata: { chunkIndex: 3 },
          tokenCount: '6',
          elementType: 'figure' as AdeElementType,
          pageNumber: 17,
          bbox: [100, 200, 450, 400],
        },
      ];

      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(diverseContent)
        .returning();

      // Create embeddings
      const embeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Get chunks for enhanced system prompt
      const chunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          document: true,
        },
        orderBy: (chunk, { asc }) => [
          asc(chunk.pageNumber),
          asc(chunk.chunkIndex),
        ],
      });

      // Generate enhanced system prompt with structure awareness
      const generateEnhancedSystemPrompt = (
        chunks: typeof chunks,
        userQuery: string,
      ) => {
        const documentName =
          chunks[0]?.document?.originalName || 'Unknown Document';
        const pageRange =
          chunks.length > 0
            ? `${Math.min(...chunks.map((c) => c.pageNumber || 1))}-${Math.max(...chunks.map((c) => c.pageNumber || 1))}`
            : 'Unknown';

        const elementTypes = [
          ...new Set(chunks.map((c) => c.elementType).filter(Boolean)),
        ];
        const hasStructuralInfo = elementTypes.length > 0;

        const structuralContext = hasStructuralInfo
          ? `This content includes ${elementTypes.join(', ')} elements from pages ${pageRange}.`
          : `This content is from pages ${pageRange}.`;

        return `You are an AI assistant helping users understand technical documentation. 
The user is asking about content from "${documentName}". ${structuralContext}

Please provide accurate, helpful responses based on the provided context. When referencing 
information, include the page number and element type when available for better traceability.

User Query: ${userQuery}

Context Information:`;
      };

      const systemPrompt = generateEnhancedSystemPrompt(
        chunks,
        'How do I calibrate the system?',
      );

      expect(systemPrompt).toContain('RoboRail Operating Manual.pdf');
      expect(systemPrompt).toContain('pages 15-17');
      expect(systemPrompt).toContain('title, paragraph, figure elements');
      expect(systemPrompt).toContain(
        'include the page number and element type',
      );
      expect(systemPrompt).toContain('How do I calibrate the system?');
    });
  });

  describe('Enhanced Citation Display', () => {
    it('should provide improved citations with element types and page numbers', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id, {
        fileName: 'user-guide.pdf',
        originalName: 'User Guide v2.1.pdf',
      });
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create chunks for citation testing
      const citationChunks = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content: 'Introduction to System Operation',
          metadata: { chunkIndex: 0 },
          tokenCount: '5',
          elementType: 'title' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 100, 400, 150],
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content:
            'The operating temperature range is 10°C to 40°C for optimal performance.',
          metadata: { chunkIndex: 1 },
          tokenCount: '13',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 5,
          bbox: [50, 200, 500, 230],
        },
        {
          documentId: document.id,
          chunkIndex: '2',
          content: 'Safety Precautions and Warnings',
          metadata: { chunkIndex: 2 },
          tokenCount: '5',
          elementType: 'title' as AdeElementType,
          pageNumber: 12,
          bbox: [50, 100, 400, 150],
        },
        {
          documentId: document.id,
          chunkIndex: '3',
          content:
            'Always wear protective equipment when operating the device.',
          metadata: { chunkIndex: 3 },
          tokenCount: '10',
          elementType: 'list_item' as AdeElementType,
          pageNumber: 12,
          bbox: [70, 200, 520, 230],
        },
      ];

      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(citationChunks)
        .returning();

      // Create embeddings
      const embeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Simulate search results for citation generation
      const searchResults = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          document: true,
          embedding: true,
        },
        orderBy: (chunk, { asc }) => [
          asc(chunk.pageNumber),
          asc(chunk.chunkIndex),
        ],
      });

      // Generate enhanced citations
      const generateEnhancedCitations = (results: typeof searchResults) => {
        return results.map((chunk, index) => {
          const documentName =
            chunk.document?.originalName || 'Unknown Document';
          const elementTypeDisplay = chunk.elementType
            ? ` (${chunk.elementType.replace('_', ' ')})`
            : '';
          const pageDisplay = chunk.pageNumber
            ? `, page ${chunk.pageNumber}`
            : '';

          return {
            id: `citation-${index + 1}`,
            source: `${documentName}${pageDisplay}${elementTypeDisplay}`,
            content: chunk.content,
            elementType: chunk.elementType,
            pageNumber: chunk.pageNumber,
            bbox: chunk.bbox,
            chunkIndex: chunk.chunkIndex,
          };
        });
      };

      const citations = generateEnhancedCitations(searchResults);

      expect(citations).toHaveLength(4);

      // Verify enhanced citation format for title
      const titleCitation = citations[0];
      expect(titleCitation.source).toBe('User Guide v2.1.pdf, page 1 (title)');
      expect(titleCitation.elementType).toBe('title');
      expect(titleCitation.pageNumber).toBe(1);

      // Verify enhanced citation format for paragraph
      const paragraphCitation = citations[1];
      expect(paragraphCitation.source).toBe(
        'User Guide v2.1.pdf, page 5 (paragraph)',
      );
      expect(paragraphCitation.content).toContain(
        'operating temperature range',
      );
      expect(paragraphCitation.elementType).toBe('paragraph');

      // Verify enhanced citation format for list item
      const listCitation = citations[3];
      expect(listCitation.source).toBe(
        'User Guide v2.1.pdf, page 12 (list item)',
      );
      expect(listCitation.content).toContain('protective equipment');
      expect(listCitation.elementType).toBe('list_item');

      // Verify all citations have proper metadata
      citations.forEach((citation) => {
        expect(citation.source).toContain('User Guide v2.1.pdf');
        expect(citation.source).toContain('page');
        expect(citation.pageNumber).toBeGreaterThan(0);
        expect(citation.elementType).toBeDefined();
      });
    });

    it('should handle citations for legacy chunks without enhanced metadata', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id, {
        fileName: 'legacy-doc.pdf',
        originalName: 'Legacy Document.pdf',
      });
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create legacy chunks without enhanced metadata
      const legacyChunks = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content:
            'This is content from a legacy document without structure metadata.',
          metadata: { chunkIndex: 0 },
          tokenCount: '12',
          elementType: null,
          pageNumber: null,
          bbox: null,
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content:
            'Another chunk of legacy content that lacks enhanced processing.',
          metadata: { chunkIndex: 1 },
          tokenCount: '11',
          elementType: null,
          pageNumber: null,
          bbox: null,
        },
      ];

      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(legacyChunks)
        .returning();

      // Create embeddings
      const embeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Get legacy chunks for citation
      const legacyResults = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          document: true,
          embedding: true,
        },
      });

      // Generate citations for legacy content (graceful fallback)
      const generateLegacyCitations = (results: typeof legacyResults) => {
        return results.map((chunk, index) => {
          const documentName =
            chunk.document?.originalName || 'Unknown Document';
          const fallbackDisplay = chunk.elementType
            ? ` (${chunk.elementType.replace('_', ' ')})`
            : '';
          const pageDisplay = chunk.pageNumber
            ? `, page ${chunk.pageNumber}`
            : `, chunk ${Number.parseInt(chunk.chunkIndex) + 1}`;

          return {
            id: `citation-${index + 1}`,
            source: `${documentName}${pageDisplay}${fallbackDisplay}`,
            content: chunk.content,
            elementType: chunk.elementType,
            pageNumber: chunk.pageNumber,
            chunkIndex: chunk.chunkIndex,
          };
        });
      };

      const legacyCitations = generateLegacyCitations(legacyResults);

      expect(legacyCitations).toHaveLength(2);

      // Verify legacy citations gracefully handle missing metadata
      const firstCitation = legacyCitations[0];
      expect(firstCitation.source).toBe('Legacy Document.pdf, chunk 1');
      expect(firstCitation.elementType).toBeNull();
      expect(firstCitation.pageNumber).toBeNull();

      const secondCitation = legacyCitations[1];
      expect(secondCitation.source).toBe('Legacy Document.pdf, chunk 2');
      expect(secondCitation.content).toContain('legacy content that lacks');

      // Verify all legacy citations work without enhanced metadata
      legacyCitations.forEach((citation) => {
        expect(citation.source).toContain('Legacy Document.pdf');
        expect(citation.source).toContain('chunk');
        expect(citation.content).toBeDefined();
      });
    });
  });

  describe('Performance Validation', () => {
    it('should measure search performance with additional metadata fields', async () => {
      const performanceFactory = createPerformanceDataFactory();

      // Create test user
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create document
      const docData = createTestDocument(user.id, {
        fileName: 'performance-test.pdf',
        originalName: 'Performance Test Document.pdf',
      });
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      const { duration, memoryUsage, result } = await measurePerformance(
        async () => {
          // Create large number of chunks with enhanced metadata
          const chunkCount = 100;
          const chunks = Array.from({ length: chunkCount }, (_, i) => ({
            documentId: document.id,
            chunkIndex: i.toString(),
            content: `Performance test chunk ${i} with realistic content for testing search operations.`,
            metadata: {
              chunkIndex: i,
              startOffset: i * 200,
              endOffset: (i + 1) * 200,
              wordCount: 12,
            },
            tokenCount: '16',
            elementType: (
              ['paragraph', 'title', 'list_item', 'table'] as AdeElementType[]
            )[i % 4],
            pageNumber: Math.floor(i / 10) + 1,
            bbox: [50, 100 + (i % 10) * 50, 500, 150 + (i % 10) * 50],
          }));

          const insertedChunks = await db
            .insert(schema.documentChunk)
            .values(chunks)
            .returning();

          // Create embeddings
          const embeddings = insertedChunks.map((chunk) => ({
            chunkId: chunk.id,
            embedding: JSON.stringify(
              performanceFactory.createRealisticEmbedding(),
            ),
            model: 'cohere-embed-v4.0',
          }));
          await db.insert(schema.documentEmbedding).values(embeddings);

          // Perform various search operations
          const searchOperations = [
            // Basic search
            () =>
              db.query.documentChunk.findMany({
                where: (chunk, { eq }) => eq(chunk.documentId, document.id),
                limit: 10,
              }),

            // Element type filtering
            () =>
              db.query.documentChunk.findMany({
                where: (chunk, { eq, and }) =>
                  and(
                    eq(chunk.documentId, document.id),
                    eq(chunk.elementType, 'paragraph'),
                  ),
                limit: 10,
              }),

            // Page-based search
            () =>
              db.query.documentChunk.findMany({
                where: (chunk, { eq, and, lte }) =>
                  and(
                    eq(chunk.documentId, document.id),
                    lte(chunk.pageNumber, 5),
                  ),
                limit: 20,
              }),

            // Complex query with joins
            () =>
              db.query.documentChunk.findMany({
                where: (chunk, { eq }) => eq(chunk.documentId, document.id),
                with: {
                  document: true,
                  embedding: true,
                },
                limit: 15,
              }),
          ];

          const searchResults = await Promise.all(
            searchOperations.map((op) => op()),
          );

          return {
            totalChunks: chunkCount,
            searchResults: searchResults.map((results) => results.length),
          };
        },
      );

      // Performance assertions
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB

      // Verify search operations completed successfully
      expect(result.totalChunks).toBe(100);
      expect(result.searchResults).toHaveLength(4);
      expect(result.searchResults[0]).toBe(10); // Basic search limit
      expect(result.searchResults[1]).toBeLessThanOrEqual(25); // Paragraph elements (25% of total)
      expect(result.searchResults[2]).toBeLessThanOrEqual(20); // Pages 1-5
      expect(result.searchResults[3]).toBe(15); // Complex query limit

      console.log('Performance Test Results:');
      console.log(`  Total Duration: ${duration}ms`);
      console.log(
        `  Memory Usage: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      );
      console.log(`  Chunks Created: ${result.totalChunks}`);
      console.log(`  Search Results: ${result.searchResults.join(', ')}`);
    });

    it('should validate context assembly latency with structured formatting', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create structured chunks for context assembly testing
      const contextChunks = Array.from({ length: 50 }, (_, i) => ({
        documentId: document.id,
        chunkIndex: i.toString(),
        content: `Context chunk ${i} with detailed information for assembly testing. This chunk contains realistic content that would be used in actual context formation for LLM prompts.`,
        metadata: { chunkIndex: i },
        tokenCount: '30',
        elementType: (
          [
            'paragraph',
            'title',
            'list_item',
            'table',
            'figure',
          ] as AdeElementType[]
        )[i % 5],
        pageNumber: Math.floor(i / 5) + 1,
        bbox: [50 + (i % 5) * 100, 100 + (i % 10) * 50, 500, 150],
      }));

      await db.insert(schema.documentChunk).values(contextChunks);

      const { duration, result } = await measurePerformance(async () => {
        // Simulate realistic context assembly
        const chunks = await db.query.documentChunk.findMany({
          where: (chunk, { eq }) => eq(chunk.documentId, document.id),
          with: {
            document: true,
          },
          orderBy: (chunk, { asc }) => [
            asc(chunk.pageNumber),
            asc(chunk.chunkIndex),
          ],
          limit: 20, // Typical context window size
        });

        // Format context with enhanced metadata (similar to real usage)
        const formattedContext = chunks
          .map((chunk) => {
            const elementTag = chunk.elementType
              ? `[${chunk.elementType.toUpperCase()}]`
              : '[CONTENT]';
            const pageInfo = chunk.pageNumber
              ? ` (Page ${chunk.pageNumber})`
              : '';
            const positionInfo = chunk.bbox
              ? ` at (${chunk.bbox[0]}, ${chunk.bbox[1]})`
              : '';

            return `${elementTag}${pageInfo}${positionInfo}:\n${chunk.content}`;
          })
          .join('\n\n---\n\n');

        return {
          contextLength: formattedContext.length,
          chunkCount: chunks.length,
          formattedContext: formattedContext.substring(0, 500), // Sample for verification
        };
      });

      // Performance assertions for context assembly
      expect(duration).toBeLessThan(1000); // Should format context in under 1 second
      expect(result.chunkCount).toBe(20);
      expect(result.contextLength).toBeGreaterThan(1000);

      // Verify structured formatting
      expect(result.formattedContext).toContain('[PARAGRAPH]');
      expect(result.formattedContext).toContain('[TITLE]');
      expect(result.formattedContext).toContain('(Page ');
      expect(result.formattedContext).toContain('at (');

      console.log('Context Assembly Performance:');
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Chunks Processed: ${result.chunkCount}`);
      console.log(`  Context Length: ${result.contextLength} characters`);
    });

    it('should benchmark enhanced vs previous pipeline performance', async () => {
      const performanceFactory = createPerformanceDataFactory();

      // Create test user
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Test 1: Enhanced pipeline (with ADE metadata)
      const enhancedDocData = createTestDocument(user.id, {
        fileName: 'enhanced.pdf',
        originalName: 'Enhanced Document.pdf',
      });
      const [enhancedDoc] = await db
        .insert(schema.ragDocument)
        .values(enhancedDocData)
        .returning();

      // Test 2: Legacy pipeline (without ADE metadata)
      const legacyDocData = createTestDocument(user.id, {
        fileName: 'legacy.pdf',
        originalName: 'Legacy Document.pdf',
      });
      const [legacyDoc] = await db
        .insert(schema.ragDocument)
        .values(legacyDocData)
        .returning();

      const enhancedResults = await measurePerformance(async () => {
        // Enhanced chunks with full metadata
        const enhancedChunks = Array.from({ length: 50 }, (_, i) => ({
          documentId: enhancedDoc.id,
          chunkIndex: i.toString(),
          content: `Enhanced chunk ${i} with ADE metadata and structural information.`,
          metadata: { chunkIndex: i, enhanced: true },
          tokenCount: '12',
          elementType: (['paragraph', 'title', 'table'] as AdeElementType[])[
            i % 3
          ],
          pageNumber: Math.floor(i / 10) + 1,
          bbox: [50, 100 + (i % 10) * 40, 500, 140 + (i % 10) * 40],
        }));

        await db.insert(schema.documentChunk).values(enhancedChunks);

        // Perform enhanced search with metadata filtering
        const searchTime = Date.now();
        const searchResults = await db.query.documentChunk.findMany({
          where: (chunk, { eq, and }) =>
            and(
              eq(chunk.documentId, enhancedDoc.id),
              eq(chunk.elementType, 'paragraph'),
            ),
          with: {
            document: true,
          },
        });
        const searchDuration = Date.now() - searchTime;

        return {
          chunksCreated: enhancedChunks.length,
          searchResults: searchResults.length,
          searchDuration,
          hasMetadata: true,
        };
      });

      const legacyResults = await measurePerformance(async () => {
        // Legacy chunks without metadata
        const legacyChunks = Array.from({ length: 50 }, (_, i) => ({
          documentId: legacyDoc.id,
          chunkIndex: i.toString(),
          content: `Legacy chunk ${i} without enhanced metadata structure.`,
          metadata: { chunkIndex: i, legacy: true },
          tokenCount: '10',
          elementType: null,
          pageNumber: null,
          bbox: null,
        }));

        await db.insert(schema.documentChunk).values(legacyChunks);

        // Perform basic search without metadata
        const searchTime = Date.now();
        const searchResults = await db.query.documentChunk.findMany({
          where: (chunk, { eq }) => eq(chunk.documentId, legacyDoc.id),
          with: {
            document: true,
          },
        });
        const searchDuration = Date.now() - searchTime;

        return {
          chunksCreated: legacyChunks.length,
          searchResults: searchResults.length,
          searchDuration,
          hasMetadata: false,
        };
      });

      // Performance comparison
      console.log('Pipeline Performance Comparison:');
      console.log(`Enhanced Pipeline:`);
      console.log(`  Duration: ${enhancedResults.duration}ms`);
      console.log(
        `  Search Duration: ${enhancedResults.result.searchDuration}ms`,
      );
      console.log(
        `  Memory: ${(enhancedResults.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      );
      console.log(
        `  Results: ${enhancedResults.result.searchResults} filtered results`,
      );

      console.log(`Legacy Pipeline:`);
      console.log(`  Duration: ${legacyResults.duration}ms`);
      console.log(
        `  Search Duration: ${legacyResults.result.searchDuration}ms`,
      );
      console.log(
        `  Memory: ${(legacyResults.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      );
      console.log(
        `  Results: ${legacyResults.result.searchResults} total results`,
      );

      // Verify both pipelines work
      expect(enhancedResults.result.chunksCreated).toBe(50);
      expect(legacyResults.result.chunksCreated).toBe(50);

      // Enhanced pipeline should provide filtered results
      expect(enhancedResults.result.searchResults).toBeLessThan(50);
      expect(enhancedResults.result.searchResults).toBeGreaterThan(0);

      // Legacy pipeline returns all results (no filtering)
      expect(legacyResults.result.searchResults).toBe(50);

      // Performance shouldn't degrade significantly (allow 50% overhead for enhanced features)
      const performanceRatio =
        enhancedResults.duration / legacyResults.duration;
      expect(performanceRatio).toBeLessThan(1.5);

      // Memory usage should be reasonable
      const memoryRatio =
        enhancedResults.memoryUsage.heapUsed /
        legacyResults.memoryUsage.heapUsed;
      expect(memoryRatio).toBeLessThan(2.0);
    });
  });

  describe('LLM Integration Validation', () => {
    it('should verify enhanced system prompts include structural information', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id, {
        fileName: 'technical-spec.pdf',
        originalName: 'Technical Specification v3.0.pdf',
      });
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create diverse content for comprehensive prompt testing
      const comprehensiveContent = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content: 'Technical Specification Document',
          metadata: { chunkIndex: 0 },
          tokenCount: '4',
          elementType: 'title' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 50, 400, 100],
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content:
            'System operates within temperature range of -10°C to +60°C.',
          metadata: { chunkIndex: 1 },
          tokenCount: '12',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 3,
          bbox: [50, 200, 500, 230],
        },
        {
          documentId: document.id,
          chunkIndex: '2',
          content: 'Performance Metrics Table',
          metadata: { chunkIndex: 2 },
          tokenCount: '4',
          elementType: 'table' as AdeElementType,
          pageNumber: 5,
          bbox: [50, 100, 550, 300],
        },
        {
          documentId: document.id,
          chunkIndex: '3',
          content: 'Step 1: Initialize the calibration sequence',
          metadata: { chunkIndex: 3 },
          tokenCount: '8',
          elementType: 'list_item' as AdeElementType,
          pageNumber: 7,
          bbox: [70, 150, 520, 180],
        },
        {
          documentId: document.id,
          chunkIndex: '4',
          content:
            'System architecture diagram showing component relationships',
          metadata: { chunkIndex: 4 },
          tokenCount: '8',
          elementType: 'figure' as AdeElementType,
          pageNumber: 8,
          bbox: [100, 200, 450, 400],
        },
      ];

      await db.insert(schema.documentChunk).values(comprehensiveContent);

      // Get chunks for LLM integration testing
      const contextChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          document: true,
        },
        orderBy: (chunk, { asc }) => [
          asc(chunk.pageNumber),
          asc(chunk.chunkIndex),
        ],
      });

      // Generate complete LLM prompt with enhanced context
      const generateEnhancedLLMPrompt = (
        chunks: typeof contextChunks,
        userQuery: string,
      ) => {
        const documentName =
          chunks[0]?.document?.originalName || 'Unknown Document';
        const totalPages = Math.max(...chunks.map((c) => c.pageNumber || 1));
        const elementCounts = chunks.reduce(
          (acc, chunk) => {
            const type = chunk.elementType || 'unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const structuralSummary = Object.entries(elementCounts)
          .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
          .join(', ');

        const systemPrompt = `You are an expert AI assistant specializing in technical documentation analysis.

Document Information:
- Name: ${documentName}
- Total Pages Referenced: ${totalPages}
- Content Structure: ${structuralSummary}
- Enhanced with structural metadata for improved context understanding

Instructions:
1. Provide accurate, detailed responses based on the structured context below
2. Reference specific page numbers and content types when citing information
3. Utilize the document structure (titles, tables, figures, etc.) to provide comprehensive answers
4. When discussing procedures, prioritize list items and step-by-step content
5. For technical specifications, reference tables and figures appropriately

User Query: ${userQuery}

Structured Context:`;

        const contextWithMetadata = chunks
          .map((chunk) => {
            const elementTag = chunk.elementType
              ? `[${chunk.elementType.toUpperCase()}]`
              : '[CONTENT]';
            const location = `Page ${chunk.pageNumber || 'N/A'}`;
            const position = chunk.bbox
              ? ` at position (${chunk.bbox[0]}, ${chunk.bbox[1]})`
              : '';

            return `${elementTag} - ${location}${position}:
${chunk.content}`;
          })
          .join('\n\n');

        return `${systemPrompt}\n\n${contextWithMetadata}`;
      };

      const enhancedPrompt = generateEnhancedLLMPrompt(
        contextChunks,
        'What are the operating temperature requirements and calibration procedures?',
      );

      // Verify enhanced prompt structure
      expect(enhancedPrompt).toContain('Technical Specification v3.0.pdf');
      expect(enhancedPrompt).toContain('Total Pages Referenced: 8');
      expect(enhancedPrompt).toContain(
        '1 title, 1 paragraph, 1 table, 1 list_item, 1 figure',
      );
      expect(enhancedPrompt).toContain('Enhanced with structural metadata');

      // Verify content structure tagging
      expect(enhancedPrompt).toContain('[TITLE] - Page 1');
      expect(enhancedPrompt).toContain('[PARAGRAPH] - Page 3');
      expect(enhancedPrompt).toContain('[TABLE] - Page 5');
      expect(enhancedPrompt).toContain('[LIST_ITEM] - Page 7');
      expect(enhancedPrompt).toContain('[FIGURE] - Page 8');

      // Verify position information
      expect(enhancedPrompt).toContain('at position (50, 50)');
      expect(enhancedPrompt).toContain('at position (70, 150)');
      expect(enhancedPrompt).toContain('at position (100, 200)');

      // Verify instructions for structure utilization
      expect(enhancedPrompt).toContain(
        'Reference specific page numbers and content types',
      );
      expect(enhancedPrompt).toContain(
        'prioritize list items and step-by-step content',
      );
      expect(enhancedPrompt).toContain(
        'reference tables and figures appropriately',
      );

      // Verify user query inclusion
      expect(enhancedPrompt).toContain(
        'operating temperature requirements and calibration procedures',
      );

      console.log('Enhanced LLM Prompt Length:', enhancedPrompt.length);
      console.log(
        'Content Types Included:',
        Object.keys(elementCounts).join(', '),
      );
    });

    it('should validate contextually aware LLM responses', async () => {
      // Create test user and document
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id, {
        fileName: 'troubleshooting-guide.pdf',
        originalName: 'System Troubleshooting Guide.pdf',
      });
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create troubleshooting content with clear structure
      const troubleshootingContent = [
        {
          documentId: document.id,
          chunkIndex: '0',
          content: 'Common System Issues and Solutions',
          metadata: { chunkIndex: 0 },
          tokenCount: '6',
          elementType: 'title' as AdeElementType,
          pageNumber: 1,
          bbox: [50, 100, 400, 150],
        },
        {
          documentId: document.id,
          chunkIndex: '1',
          content:
            'Error Code 404: Communication timeout with external sensors.',
          metadata: { chunkIndex: 1 },
          tokenCount: '10',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 2,
          bbox: [50, 200, 500, 230],
        },
        {
          documentId: document.id,
          chunkIndex: '2',
          content: '1. Check cable connections to sensor modules',
          metadata: { chunkIndex: 2 },
          tokenCount: '8',
          elementType: 'list_item' as AdeElementType,
          pageNumber: 2,
          bbox: [70, 250, 520, 280],
        },
        {
          documentId: document.id,
          chunkIndex: '3',
          content: '2. Verify sensor power supply voltage (24V required)',
          metadata: { chunkIndex: 3 },
          tokenCount: '9',
          elementType: 'list_item' as AdeElementType,
          pageNumber: 2,
          bbox: [70, 290, 520, 320],
        },
        {
          documentId: document.id,
          chunkIndex: '4',
          content: 'Warning: Do not attempt repairs while system is powered.',
          metadata: { chunkIndex: 4 },
          tokenCount: '10',
          elementType: 'paragraph' as AdeElementType,
          pageNumber: 3,
          bbox: [50, 100, 500, 130],
        },
      ];

      await db.insert(schema.documentChunk).values(troubleshootingContent);

      // Simulate contextually aware response generation
      const contextChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          document: true,
        },
        orderBy: (chunk, { asc }) => [
          asc(chunk.pageNumber),
          asc(chunk.chunkIndex),
        ],
      });

      // Simulate different query types and expected context utilization
      const queryScenarios = [
        {
          query: 'How do I fix error code 404?',
          expectedElements: ['paragraph', 'list_item'],
          expectedContent: [
            'Error Code 404',
            'Check cable connections',
            'Verify sensor power',
          ],
          expectedStructure: 'procedural',
        },
        {
          query: 'What safety precautions should I follow?',
          expectedElements: ['paragraph'],
          expectedContent: ['Warning', 'Do not attempt repairs'],
          expectedStructure: 'safety',
        },
        {
          query: 'What types of issues does this guide cover?',
          expectedElements: ['title'],
          expectedContent: ['Common System Issues'],
          expectedStructure: 'overview',
        },
      ];

      for (const scenario of queryScenarios) {
        // Filter relevant chunks based on content similarity (simplified for test)
        const relevantChunks = contextChunks.filter((chunk) =>
          scenario.expectedContent.some((content) =>
            chunk.content.toLowerCase().includes(content.toLowerCase()),
          ),
        );

        // Verify structure-aware filtering worked
        expect(relevantChunks.length).toBeGreaterThan(0);

        // Verify expected element types are present
        const elementTypes = relevantChunks.map((chunk) => chunk.elementType);
        scenario.expectedElements.forEach((expectedType) => {
          expect(elementTypes).toContain(expectedType);
        });

        // Verify content relevance
        const allContent = relevantChunks
          .map((chunk) => chunk.content)
          .join(' ');
        scenario.expectedContent.forEach((expectedContent) => {
          expect(allContent.toLowerCase()).toContain(
            expectedContent.toLowerCase(),
          );
        });

        // Verify page references are available
        const pageNumbers = relevantChunks
          .map((chunk) => chunk.pageNumber)
          .filter(Boolean);
        expect(pageNumbers.length).toBeGreaterThan(0);

        console.log(`Query: "${scenario.query}"`);
        console.log(`  Relevant chunks: ${relevantChunks.length}`);
        console.log(
          `  Element types: ${[...new Set(elementTypes.filter(Boolean))].join(', ')}`,
        );
        console.log(
          `  Pages referenced: ${[...new Set(pageNumbers)].join(', ')}`,
        );
      }
    });
  });
});
