import { test, expect } from '@playwright/test';
import { setupNeonForPlaywright } from '../config/neon-branch-setup';
import { setupSlice17TestContext, slice17Assertions } from '../config/slice-17-test-config';
import { createAdeTestDataFactory } from '../fixtures/ade-test-data';
import type { AdeElementType } from '@/lib/ade/types';

test.describe('Slice 17: End-to-End Enhanced RAG Pipeline', () => {
  let testContext: Awaited<ReturnType<typeof setupSlice17TestContext>>;
  let neonConfig: Awaited<ReturnType<typeof setupNeonForPlaywright>>;

  test.beforeAll(async ({ browser }) => {
    // Setup Neon test branch for isolation
    neonConfig = await setupNeonForPlaywright({
      title: 'slice-17-e2e',
      project: { name: 'enhanced-rag' },
    });

    // Setup comprehensive test context
    testContext = await setupSlice17TestContext('slice-17-e2e', {
      adeProcessorConfig: 'perfect',
      enablePerformanceTracking: true,
      preloadTestData: false,
    });
  });

  test.afterAll(async () => {
    await testContext.cleanup();
    await neonConfig.cleanup();
  });

  test('Complete document processing pipeline with ADE enhancement', async ({ page }) => {
    // Create user and authenticate
    const { user } = await testContext.factories.createUserWithAuth();

    // Process a complex document with ADE
    const { document, adeOutput, chunks } = await testContext.factories.createDocumentWithAde(
      user.id,
      'complex',
    );

    // Verify ADE processing results
    expect(adeOutput.elements.length).toBeGreaterThan(10);
    expect(adeOutput.confidence).toBeGreaterThan(0.8);
    expect(adeOutput.pageCount).toBeGreaterThan(5);

    // Verify enhanced chunks were created
    expect(chunks.length).toBe(adeOutput.elements.length);
    slice17Assertions.assertEnhancedChunks(chunks);

    // Test various element types are present
    const elementTypes = [...new Set(chunks.map(c => c.elementType).filter(Boolean))];
    expect(elementTypes.length).toBeGreaterThan(3);
    expect(elementTypes).toContain('title');
    expect(elementTypes).toContain('paragraph');

    console.log('✓ Document processing with ADE enhancement completed successfully');
    console.log(`  - Document: ${document.originalName}`);
    console.log(`  - Elements extracted: ${adeOutput.elements.length}`);
    console.log(`  - Chunks created: ${chunks.length}`);
    console.log(`  - Element types: ${elementTypes.join(', ')}`);
  });

  test('Enhanced search functionality with structural metadata filtering', async ({ page }) => {
    // Create user and mixed document set
    const { user } = await testContext.factories.createUserWithAuth();
    const { enhancedDocs, legacyDocs, allChunks } = await testContext.factories.createMixedDocumentSet(user.id);

    // Test 1: Element type filtering
    const titleChunks = await testContext.utils.runEnhancedSearch('system overview', {
      elementTypes: ['title'],
    });

    expect(titleChunks.length).toBeGreaterThan(0);
    titleChunks.forEach(chunk => {
      expect(chunk.elementType).toBe('title');
    });

    // Test 2: Page range filtering
    const page1To3Chunks = await testContext.utils.runEnhancedSearch('configuration', {
      pageRange: { start: 1, end: 3 },
    });

    expect(page1To3Chunks.length).toBeGreaterThan(0);
    page1To3Chunks.forEach(chunk => {
      if (chunk.pageNumber) {
        expect(chunk.pageNumber).toBeGreaterThanOrEqual(1);
        expect(chunk.pageNumber).toBeLessThanOrEqual(3);
      }
    });

    // Test 3: Multiple element types
    const structuredContent = await testContext.utils.runEnhancedSearch('procedures', {
      elementTypes: ['paragraph', 'list_item', 'table'],
    });

    expect(structuredContent.length).toBeGreaterThan(0);
    const structuredTypes = [...new Set(structuredContent.map(c => c.elementType).filter(Boolean))];
    expect(structuredTypes.length).toBeGreaterThan(1);

    // Test 4: Spatial filtering
    const topAreaContent = await testContext.utils.runEnhancedSearch('header information', {
      spatialArea: { x1: 0, y1: 0, x2: 600, y2: 150 },
    });

    topAreaContent.forEach(chunk => {
      if (chunk.bbox && Array.isArray(chunk.bbox)) {
        expect(chunk.bbox[1]).toBeLessThan(150); // y1 < 150 (top area)
      }
    });

    console.log('✓ Enhanced search functionality tests completed');
    console.log(`  - Title chunks found: ${titleChunks.length}`);
    console.log(`  - Page 1-3 chunks: ${page1To3Chunks.length}`);
    console.log(`  - Structured content chunks: ${structuredContent.length}`);
    console.log(`  - Top area chunks: ${topAreaContent.length}`);
  });

  test('Context assembly with structural information for LLM prompts', async ({ page }) => {
    // Create user and test document
    const { user } = await testContext.factories.createUserWithAuth();
    const { document, chunks } = await testContext.factories.createDocumentWithAde(
      user.id,
      'table_heavy',
    );

    // Search for relevant content
    const relevantChunks = await testContext.utils.runEnhancedSearch('calibration procedures', {
      elementTypes: ['title', 'paragraph', 'list_item', 'table'],
    });

    expect(relevantChunks.length).toBeGreaterThan(3);

    // Format context for LLM
    const enhancedContext = testContext.utils.formatContextForLLM(
      relevantChunks,
      'What are the step-by-step calibration procedures?',
    );

    // Verify enhanced context formatting
    expect(enhancedContext).toContain('Document:');
    expect(enhancedContext).toContain('Pages Referenced:');
    expect(enhancedContext).toContain('Content Types:');
    expect(enhancedContext).toContain('Query:');
    expect(enhancedContext).toContain('Enhanced Context:');

    // Verify structural tags are present
    slice17Assertions.assertContextFormatting(enhancedContext, ['title', 'paragraph', 'table']);

    // Verify position information
    expect(enhancedContext).toContain(' at (');
    expect(enhancedContext).toContain('Page ');

    // Test context for different query types
    const safetyContext = testContext.utils.formatContextForLLM(
      relevantChunks.filter(c => c.content.toLowerCase().includes('warning') || c.content.toLowerCase().includes('safety')),
      'What safety precautions should I follow?',
    );

    expect(safetyContext).toContain('safety precautions');

    console.log('✓ Context assembly with structural information completed');
    console.log(`  - Relevant chunks: ${relevantChunks.length}`);
    console.log(`  - Enhanced context length: ${enhancedContext.length} characters`);
    console.log(`  - Structural tags included: [TITLE], [PARAGRAPH], [TABLE]`);
  });

  test('Enhanced citation display with element types and page numbers', async ({ page }) => {
    // Create test data for citation scenarios
    const testDataFactory = createAdeTestDataFactory();
    const { user } = await testContext.factories.createUserWithAuth();

    // Create document with diverse content types
    const docData = {
      fileName: 'citation_test.pdf',
      originalName: 'Citation Test Document.pdf',
      filePath: '/uploads/citation_test.pdf',
      mimeType: 'application/pdf',
      fileSize: '2048000',
      status: 'processed' as const,
      uploadedBy: user.id,
    };

    const [document] = await testContext.db.insert(testContext.db.schema.ragDocument).values(docData).returning();

    // Create citation test data
    const citationChunks = testDataFactory.createCitationTestData(
      document.id,
      document.originalName,
    );

    const insertedChunks = await testContext.db
      .insert(testContext.db.schema.documentChunk)
      .values(citationChunks.map(chunk => {
        const { expectedCitation, ...chunkData } = chunk;
        return chunkData;
      }))
      .returning();

    // Get chunks with document info for citation generation
    const chunksWithDocument = await testContext.db.query.documentChunk.findMany({
      where: (chunk, { eq }) => eq(chunk.documentId, document.id),
      with: {
        document: true,
      },
    });

    // Generate enhanced citations
    const citations = testContext.utils.generateCitations(chunksWithDocument);

    // Verify enhanced citations
    slice17Assertions.assertEnhancedCitations(citations);

    // Verify specific citation formats
    const titleCitation = citations.find(c => c.elementType === 'title');
    expect(titleCitation?.source).toContain('page 1 (title)');

    const tableCitation = citations.find(c => c.elementType === 'table');
    expect(tableCitation?.source).toContain('(table)');

    const listCitation = citations.find(c => c.elementType === 'list_item');
    expect(listCitation?.source).toContain('(list item)');

    // Test citation with legacy chunks (graceful fallback)
    const legacyChunkData = {
      documentId: document.id,
      chunkIndex: '999',
      content: 'Legacy content without metadata',
      metadata: { chunkIndex: 999 },
      tokenCount: '6',
      elementType: null,
      pageNumber: null,
      bbox: null,
    };

    const [legacyChunk] = await testContext.db
      .insert(testContext.db.schema.documentChunk)
      .values(legacyChunkData)
      .returning();

    const legacyChunkWithDoc = await testContext.db.query.documentChunk.findFirst({
      where: (chunk, { eq }) => eq(chunk.id, legacyChunk.id),
      with: { document: true },
    });

    const legacyCitations = testContext.utils.generateCitations([legacyChunkWithDoc!]);
    expect(legacyCitations[0].source).toContain('chunk 1000'); // 999 + 1

    console.log('✓ Enhanced citation display completed');
    console.log(`  - Citations generated: ${citations.length}`);
    console.log(`  - Element types in citations: ${[...new Set(citations.map(c => c.elementType).filter(Boolean))].join(', ')}`);
    console.log(`  - Legacy citation fallback tested`);
  });

  test('Performance validation: Enhanced vs legacy pipeline', async ({ page }) => {
    const { user } = await testContext.factories.createUserWithAuth();

    // Create performance test datasets
    const enhancedPerf = await testContext.utils.measureSearchPerformance(async () => {
      const { documents, chunks } = await testContext.factories.createPerformanceDataset(
        user.id,
        'medium',
      );

      // Search with enhanced metadata filtering
      return testContext.utils.runEnhancedSearch('system configuration', {
        elementTypes: ['title', 'paragraph'],
        pageRange: { start: 1, end: 10 },
      });
    });

    const legacyPerf = await testContext.utils.measureSearchPerformance(async () => {
      // Create legacy document for comparison
      const legacyDoc = {
        fileName: 'legacy_perf.pdf',
        originalName: 'Legacy Performance Test.pdf',
        filePath: '/uploads/legacy_perf.pdf',
        mimeType: 'application/pdf',
        fileSize: '5000000',
        status: 'processed' as const,
        uploadedBy: user.id,
      };

      const [document] = await testContext.db.insert(testContext.db.schema.ragDocument).values(legacyDoc).returning();

      // Create legacy chunks
      const legacyChunks = Array.from({ length: 50 }, (_, i) => ({
        documentId: document.id,
        chunkIndex: i.toString(),
        content: `Legacy performance test chunk ${i}`,
        metadata: { chunkIndex: i },
        tokenCount: '10',
        elementType: null,
        pageNumber: null,
        bbox: null,
      }));

      await testContext.db.insert(testContext.db.schema.documentChunk).values(legacyChunks);

      // Basic search without metadata filtering
      return testContext.db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        limit: 20,
      });
    });

    // Performance assertions
    expect(enhancedPerf.duration).toBeLessThan(5000); // Should complete in under 5 seconds
    expect(legacyPerf.duration).toBeLessThan(3000); // Legacy should be faster but less precise

    // Enhanced search should return more targeted results
    const enhancedResultCount = enhancedPerf.result.length;
    const legacyResultCount = legacyPerf.result.length;

    expect(enhancedResultCount).toBeGreaterThan(0);
    expect(legacyResultCount).toBeGreaterThan(0);

    // Enhanced pipeline should provide more precise results (fewer but more relevant)
    if (enhancedResultCount > 0 && legacyResultCount > 0) {
      // Enhanced results should have metadata
      const enhancedWithMetadata = enhancedPerf.result.filter(r => r.elementType || r.pageNumber);
      expect(enhancedWithMetadata.length).toBeGreaterThan(0);

      // Legacy results should not have metadata
      const legacyWithMetadata = legacyPerf.result.filter(r => r.elementType || r.pageNumber);
      expect(legacyWithMetadata.length).toBe(0);
    }

    // Memory usage should be reasonable for enhanced pipeline
    expect(enhancedPerf.memoryUsage.heapUsed).toBeLessThan(50 * 1024 * 1024); // Less than 50MB

    console.log('✓ Performance validation completed');
    console.log(`  Enhanced Pipeline:`);
    console.log(`    - Duration: ${enhancedPerf.duration}ms`);
    console.log(`    - Results: ${enhancedResultCount} (with metadata)`);
    console.log(`    - Memory: ${(enhancedPerf.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Legacy Pipeline:`);
    console.log(`    - Duration: ${legacyPerf.duration}ms`);
    console.log(`    - Results: ${legacyResultCount} (no metadata)`);
    console.log(`    - Memory: ${(legacyPerf.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  });

  test('LLM integration with enhanced system prompts', async ({ page }) => {
    const { user } = await testContext.factories.createUserWithAuth();
    
    // Create diverse document content for LLM testing
    const { document, chunks } = await testContext.factories.createDocumentWithAde(
      user.id,
      'mixed',
    );

    // Test different query scenarios
    const testScenarios = [
      {
        query: 'How do I install the system?',
        expectedElements: ['title', 'list_item', 'paragraph'],
        contextType: 'procedural',
      },
      {
        query: 'What are the technical specifications?',
        expectedElements: ['table', 'table_text'],
        contextType: 'specification',
      },
      {
        query: 'Show me the system architecture',
        expectedElements: ['figure', 'caption'],
        contextType: 'visual',
      },
    ];

    for (const scenario of testScenarios) {
      // Search for relevant content
      const relevantChunks = await testContext.utils.runEnhancedSearch(scenario.query, {
        elementTypes: scenario.expectedElements as AdeElementType[],
      });

      if (relevantChunks.length > 0) {
        // Generate enhanced LLM prompt
        const enhancedPrompt = testContext.utils.formatContextForLLM(
          relevantChunks,
          scenario.query,
        );

        // Verify prompt structure
        expect(enhancedPrompt).toContain('Document:');
        expect(enhancedPrompt).toContain('Pages Referenced:');
        expect(enhancedPrompt).toContain('Content Types:');
        expect(enhancedPrompt).toContain(scenario.query);

        // Verify structural information is included
        scenario.expectedElements.forEach(elementType => {
          if (relevantChunks.some(c => c.elementType === elementType)) {
            expect(enhancedPrompt).toContain(`[${elementType.toUpperCase()}]`);
          }
        });

        // Verify context is contextually appropriate
        expect(enhancedPrompt.length).toBeGreaterThan(500); // Substantial context
        expect(enhancedPrompt.length).toBeLessThan(10000); // Not overwhelming

        console.log(`✓ LLM prompt for "${scenario.query}" (${scenario.contextType}):`);
        console.log(`    - Relevant chunks: ${relevantChunks.length}`);
        console.log(`    - Prompt length: ${enhancedPrompt.length} chars`);
        console.log(`    - Element types: ${[...new Set(relevantChunks.map(c => c.elementType).filter(Boolean))].join(', ')}`);
      }
    }

    // Test backward compatibility with legacy chunks
    const mixedResults = await testContext.utils.runEnhancedSearch('system information');
    const mixedPrompt = testContext.utils.formatContextForLLM(
      mixedResults,
      'What information is available about the system?',
    );

    expect(mixedPrompt).toContain('system information');
    
    console.log('✓ LLM integration with enhanced system prompts completed');
    console.log(`  - Test scenarios: ${testScenarios.length}`);
    console.log(`  - Mixed content prompt length: ${mixedPrompt.length} chars`);
  });

  test('Complete workflow: Upload → Process → Search → Context → Citations', async ({ page }) => {
    // This test simulates the complete end-to-end workflow
    const { user } = await testContext.factories.createUserWithAuth();

    console.log('Starting complete workflow test...');

    // Step 1: Upload and process document
    console.log('Step 1: Document upload and ADE processing');
    const { document, adeOutput, chunks } = await testContext.factories.createDocumentWithAde(
      user.id,
      'complex',
    );

    expect(document.status).toBe('processed');
    expect(adeOutput.elements.length).toBeGreaterThan(0);
    expect(chunks.length).toBe(adeOutput.elements.length);

    // Step 2: Enhanced search with multiple filters
    console.log('Step 2: Enhanced search with structural filtering');
    const searchResults = await testContext.utils.runEnhancedSearch(
      'calibration and configuration procedures',
      {
        elementTypes: ['title', 'paragraph', 'list_item'],
        pageRange: { start: 1, end: 10 },
        confidence: { min: 0.7 },
      },
    );

    expect(searchResults.length).toBeGreaterThan(0);
    slice17Assertions.assertFilteredResults(searchResults, {
      elementTypes: ['title', 'paragraph', 'list_item'],
      pageRange: { start: 1, end: 10 },
    });

    // Step 3: Context assembly for LLM
    console.log('Step 3: Context assembly with structural metadata');
    const enhancedContext = testContext.utils.formatContextForLLM(
      searchResults,
      'Provide detailed calibration and configuration procedures',
    );

    expect(enhancedContext).toContain('calibration and configuration procedures');
    slice17Assertions.assertContextFormatting(enhancedContext, ['title', 'paragraph', 'list_item']);

    // Step 4: Citation generation
    console.log('Step 4: Enhanced citation generation');
    const citations = testContext.utils.generateCitations(searchResults);

    expect(citations.length).toBe(searchResults.length);
    slice17Assertions.assertEnhancedCitations(citations);

    // Step 5: Verify complete integration
    console.log('Step 5: Integration verification');
    
    // Verify data consistency across the pipeline
    const documentChunks = await testContext.db.query.documentChunk.findMany({
      where: (chunk, { eq }) => eq(chunk.documentId, document.id),
      with: {
        document: true,
        embedding: true,
      },
    });

    // All chunks should have embeddings
    expect(documentChunks.every(chunk => chunk.embedding)).toBe(true);

    // Enhanced chunks should have ADE metadata
    const enhancedChunks = documentChunks.filter(chunk => chunk.elementType);
    expect(enhancedChunks.length).toBeGreaterThan(0);

    enhancedChunks.forEach(chunk => {
      expect(chunk.elementType).toBeTruthy();
      expect(chunk.pageNumber).toBeGreaterThan(0);
      expect(chunk.bbox).toBeDefined();
    });

    // Citations should reference the correct document
    citations.forEach(citation => {
      expect(citation.source).toContain(document.originalName);
    });

    console.log('✓ Complete workflow test completed successfully');
    console.log(`  - Document processed: ${document.originalName}`);
    console.log(`  - ADE elements: ${adeOutput.elements.length}`);
    console.log(`  - Chunks created: ${chunks.length}`);
    console.log(`  - Search results: ${searchResults.length}`);
    console.log(`  - Context length: ${enhancedContext.length} chars`);
    console.log(`  - Citations generated: ${citations.length}`);
    console.log(`  - Enhanced chunks: ${enhancedChunks.length}/${documentChunks.length}`);
  });
});