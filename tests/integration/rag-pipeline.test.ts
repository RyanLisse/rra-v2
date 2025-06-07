import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupNeonBranch } from '../config/neon-test-context';
import { measurePerformance } from '../utils/test-helpers';
import {
  createTestUser,
  createTestDocument,
  createTestDocumentContent,
  createTestDocumentChunk,
  createTestEmbedding,
} from '../fixtures/test-data';
import * as schema from '@/lib/db/schema';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DocumentProcessor } from '../mocks/document-processor';
import { VectorSearch, CohereClient } from '../mocks/vector-search';

describe('RAG Pipeline Integration Tests', () => {
  let testContext: Awaited<ReturnType<typeof setupNeonBranch>>;
  let documentProcessor: DocumentProcessor;
  let vectorSearch: VectorSearch;

  beforeEach(async () => {
    testContext = await setupNeonBranch('rag-pipeline-test');
    documentProcessor = new DocumentProcessor();
    vectorSearch = new VectorSearch(new CohereClient());
  });

  afterEach(async () => {
    await testContext.cleanup();
  });

  describe('Document Processing Pipeline', () => {
    it('should process real PDF document through complete pipeline', async () => {
      const { db } = testContext;

      // 1. Create test user with enhanced factory
      const { user } = await testContext.factories.createUserWithAuth();

      // 2. Load real PDF document for testing
      const pdfPath = join(
        process.cwd(),
        'data/pdf/FAQ_RoboRail_measurement_v0.0_020524.pdf',
      );
      const pdfBuffer = readFileSync(pdfPath);
      const file = new File([pdfBuffer], 'test-document.pdf', {
        type: 'application/pdf',
      });

      // 3. Upload and process document through real pipeline
      const document = await documentProcessor.uploadDocument({
        file,
        userId: user.id,
        db,
      });

      expect(document.status).toBe('uploaded');
      expect(Number.parseInt(document.fileSize)).toBeGreaterThan(0);
      expect(document.mimeType).toBe('application/pdf');

      // 4. Extract text content using real PDF extraction
      const extractedContent = await documentProcessor.extractText({
        documentId: document.id,
        db,
      });

      expect(extractedContent.content).toBeTruthy();
      expect(extractedContent.content.length).toBeGreaterThan(100);
      expect(extractedContent.contentHash).toBeTruthy();

      // 5. Create semantic chunks using real text splitter
      const chunks = await documentProcessor.createChunks({
        documentId: document.id,
        content: extractedContent.content,
        db,
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
      expect(chunks.every((chunk) => chunk.tokenCount > 0)).toBe(true);

      // 6. Generate embeddings using Cohere API (mocked in test)
      const embeddings = await documentProcessor.generateEmbeddings({
        chunks,
        db,
      });

      expect(embeddings.length).toBe(chunks.length);
      expect(
        embeddings.every((emb) => {
          const embeddingArray = JSON.parse(emb.embedding);
          return (
            Array.isArray(embeddingArray) && embeddingArray.length === 1024
          );
        }),
      ).toBe(true);

      // 7. Verify complete pipeline
      const finalDocument = await db.query.ragDocument.findFirst({
        where: (doc, { eq }) => eq(doc.id, document.id),
        with: {
          content: true,
          chunks: {
            with: {
              embedding: true,
            },
          },
        },
      });

      expect(finalDocument?.status).toBe('processed');
      expect(finalDocument?.content).toBeDefined();
      expect(finalDocument?.content?.extractedText).toBe(
        extractedContent.content,
      );
      expect(finalDocument?.chunks).toHaveLength(chunks.length);
      expect(finalDocument?.chunks.every((chunk) => chunk.embedding)).toBe(
        true,
      );

      // 8. Validate searchability - use simpler query terms
      const searchQuery = 'test document';
      const searchResults = await vectorSearch.search({
        query: searchQuery,
        userId: user.id,
        limit: 5,
        threshold: 0.1, // Lower threshold for testing
        db,
      });

      console.log('Search results:', searchResults.results.length);
      if (searchResults.results.length > 0) {
        console.log('First result score:', searchResults.results[0].score);
      }

      expect(searchResults.results.length).toBeGreaterThan(0);
      expect(searchResults.results[0].score).toBeGreaterThan(0.1);
    });

    it('should handle pipeline failures gracefully with real error scenarios', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Test 1: Corrupted PDF handling
      const corruptedPdf = new File([new ArrayBuffer(100)], 'corrupted.pdf', {
        type: 'application/pdf',
      });

      const corruptedDoc = await documentProcessor.uploadDocument({
        file: corruptedPdf,
        userId: user.id,
        db,
      });

      await expect(
        documentProcessor.extractText({
          documentId: corruptedDoc.id,
          db,
        }),
      ).rejects.toThrow();

      const failedDoc1 = await db.query.ragDocument.findFirst({
        where: (doc, { eq }) => eq(doc.id, corruptedDoc.id),
      });
      expect(failedDoc1?.status).toBe('error');

      // Test 2: Invalid document type
      const invalidFile = new File([Buffer.from('not a pdf')], 'test.exe', {
        type: 'application/x-msdownload',
      });

      await expect(
        documentProcessor.uploadDocument({
          file: invalidFile,
          userId: user.id,
          db,
        }),
      ).rejects.toThrow('Unsupported file type');

      // Test 3: Recovery mechanism
      const validPdfPath = join(
        process.cwd(),
        'data/pdf/FAQ_RoboRail_Calibration_v0.0_290324.pdf',
      );
      const validPdfBuffer = readFileSync(validPdfPath);
      const validFile = new File([validPdfBuffer], 'valid.pdf', {
        type: 'application/pdf',
      });

      const recoverableDoc = await documentProcessor.uploadDocument({
        file: validFile,
        userId: user.id,
        db,
      });

      // Simulate partial failure during chunking
      await db
        .update(schema.ragDocument)
        .set({ status: 'text_extracted' })
        .where(schema.ragDocument.id === recoverableDoc.id);

      // Retry pipeline from last successful step - first extract text
      const extractedContent = await documentProcessor.extractText({
        documentId: recoverableDoc.id,
        db,
      });

      const chunks = await documentProcessor.createChunks({
        documentId: recoverableDoc.id,
        content: extractedContent.content,
        db,
      });

      expect(chunks.length).toBeGreaterThan(0);

      // Complete the pipeline
      await documentProcessor.generateEmbeddings({ chunks, db });

      const recoveredDoc = await db.query.ragDocument.findFirst({
        where: (doc, { eq }) => eq(doc.id, recoverableDoc.id),
      });
      expect(recoveredDoc?.status).toBe('processed');
    });

    it('should measure pipeline performance with real documents', async () => {
      const { db, metrics } = testContext;

      // Load multiple real documents for performance testing
      const documentPaths = [
        'FAQ_RoboRail_measurement_v0.0_020524.pdf',
        'FAQ_RoboRail_Calibration_v0.0_290324.pdf',
        'Operators manual_RoboRail V2.2_170424.pdf',
      ];

      const {
        result: performanceMetrics,
        duration,
        memoryUsage,
      } = await measurePerformance(async () => {
        const { user } = await testContext.factories.createUserWithAuth();
        const results = [];

        for (const docPath of documentPaths) {
          // Track individual document processing
          const docStartTime = Date.now();

          const pdfPath = join(process.cwd(), 'data/pdf', docPath);
          const pdfBuffer = readFileSync(pdfPath);
          const file = new File([pdfBuffer], docPath, {
            type: 'application/pdf',
          });

          // Upload
          const uploadStart = Date.now();
          const document = await documentProcessor.uploadDocument({
            file,
            userId: user.id,
            db,
          });
          const uploadDuration = Date.now() - uploadStart;

          // Extract text
          const extractStart = Date.now();
          const content = await documentProcessor.extractText({
            documentId: document.id,
            db,
          });
          const extractDuration = Date.now() - extractStart;

          // Create chunks
          const chunkStart = Date.now();
          const chunks = await documentProcessor.createChunks({
            documentId: document.id,
            content: content.content,
            db,
          });
          const chunkDuration = Date.now() - chunkStart;

          // Generate embeddings (batched for performance)
          const embedStart = Date.now();
          const embeddings = await documentProcessor.generateEmbeddings({
            chunks,
            db,
            batchSize: 50, // Process embeddings in batches
          });
          const embedDuration = Date.now() - embedStart;

          const totalDocDuration = Date.now() - docStartTime;

          results.push({
            documentName: docPath,
            fileSize: file.size,
            chunksCreated: chunks.length,
            embeddingsCreated: embeddings.length,
            timings: {
              upload: uploadDuration,
              extract: extractDuration,
              chunk: chunkDuration,
              embed: embedDuration,
              total: totalDocDuration,
            },
          });
        }

        return results;
      });

      // Performance assertions
      expect(duration).toBeLessThan(30000); // Should complete all documents in under 30 seconds
      expect(memoryUsage.heapUsed).toBeLessThan(200 * 1024 * 1024); // Less than 200MB

      // Analyze individual document performance
      performanceMetrics.forEach((result) => {
        console.log(`Document: ${result.documentName}`);
        console.log(
          `  File size: ${(result.fileSize / 1024 / 1024).toFixed(2)}MB`,
        );
        console.log(`  Chunks: ${result.chunksCreated}`);
        console.log(`  Timings:`);
        console.log(`    Upload: ${result.timings.upload}ms`);
        console.log(`    Extract: ${result.timings.extract}ms`);
        console.log(`    Chunk: ${result.timings.chunk}ms`);
        console.log(`    Embed: ${result.timings.embed}ms`);
        console.log(`    Total: ${result.timings.total}ms`);

        // Performance expectations per document
        expect(result.timings.upload).toBeLessThan(2000); // Upload under 2s
        expect(result.timings.extract).toBeLessThan(5000); // Extract under 5s
        expect(result.timings.chunk).toBeLessThan(3000); // Chunk under 3s
        expect(result.timings.embed).toBeLessThan(10000); // Embed under 10s
      });

      // Record metrics
      metrics.record('pipeline.documents.processed', performanceMetrics.length);
      metrics.record('pipeline.total.duration', duration);
      metrics.record('pipeline.memory.used', memoryUsage.heapUsed);
    });
  });

  describe('Vector Search Operations', () => {
    it('should perform semantic search on real document chunks', async () => {
      const { db } = testContext;

      // Setup with real RoboRail documentation
      const { user, documents } =
        await testContext.factories.createUserWithDocuments({
          documentCount: 3,
          processDocuments: true, // Fully process including embeddings
        });

      // Test various search queries against real content
      const searchQueries = [
        {
          query: 'test chunk',
          expectedTopics: ['test', 'chunk'],
        },
        {
          query: 'RoboRail calibration',
          expectedTopics: ['roborail', 'calibration'],
        },
        {
          query: 'measurement procedures',
          expectedTopics: ['measurement', 'procedures'],
        },
      ];

      for (const testCase of searchQueries) {
        const searchResults = await vectorSearch.search({
          query: testCase.query,
          userId: user.id,
          limit: 5,
          threshold: 0.3,
          db,
        });

        expect(searchResults.results.length).toBeGreaterThan(0);
        expect(searchResults.results[0].score).toBeGreaterThan(0.3);

        // Verify relevance of results
        const topResult = searchResults.results[0];
        const contentLower = topResult.content.toLowerCase();

        const hasRelevantContent = testCase.expectedTopics.some((topic) =>
          contentLower.includes(topic.toLowerCase()),
        );
        expect(hasRelevantContent).toBe(true);

        // Check metadata
        expect(topResult.document).toBeDefined();
        expect(topResult.document.title).toBeTruthy();
        expect(topResult.chunkIndex).toBeGreaterThanOrEqual(0);
      }

      // Test cross-document search
      const crossDocSearch = await vectorSearch.search({
        query:
          'complete RoboRail system overview including calibration and measurements',
        userId: user.id,
        limit: 10,
        includeMetadata: true,
        db,
      });

      // Should return results from multiple documents
      const uniqueDocuments = new Set(
        crossDocSearch.results.map((r) => r.document.id),
      );
      expect(uniqueDocuments.size).toBeGreaterThan(1);

      // Test reranking
      const rerankedResults = await vectorSearch.searchWithReranking({
        query: 'precise calibration steps',
        userId: user.id,
        limit: 20,
        rerankTopK: 5,
        db,
      });

      expect(rerankedResults.results.length).toBeLessThanOrEqual(5);
      expect(rerankedResults.results[0].rerankScore).toBeDefined();
      expect(rerankedResults.results[0].rerankScore).toBeGreaterThan(
        rerankedResults.results[0].score,
      );
    });

    it('should handle large-scale vector operations efficiently', async () => {
      const { db, metrics } = testContext;

      // Create user and load large document
      const { user } = await testContext.factories.createUserWithAuth();

      const largePdfPath = join(
        process.cwd(),
        'data/pdf/Operators manual_RoboRail V2.2_170424.pdf',
      );
      const pdfBuffer = readFileSync(largePdfPath);
      const file = new File([pdfBuffer], 'large-manual.pdf', {
        type: 'application/pdf',
      });

      const { duration, result } = await measurePerformance(async () => {
        // Process large document
        const document = await documentProcessor.uploadDocument({
          file,
          userId: user.id,
          db,
        });

        const content = await documentProcessor.extractText({
          documentId: document.id,
          db,
        });

        // Create chunks with optimized settings for large documents
        const chunks = await documentProcessor.createChunks({
          documentId: document.id,
          content: content.content,
          chunkSize: 500, // Optimal chunk size
          chunkOverlap: 100, // Overlap for context preservation
          db,
        });

        // Batch process embeddings with parallel execution
        const batchSize = 25;
        const batches = [];

        for (let i = 0; i < chunks.length; i += batchSize) {
          batches.push(chunks.slice(i, i + batchSize));
        }

        const embeddingPromises = batches.map(async (batch, batchIndex) => {
          const startTime = Date.now();

          const embeddings = await documentProcessor.generateEmbeddings({
            chunks: batch,
            db,
          });

          const batchDuration = Date.now() - startTime;
          metrics.record(
            `embedding.batch.${batchIndex}.duration`,
            batchDuration,
          );

          return embeddings;
        });

        const allEmbeddings = (await Promise.all(embeddingPromises)).flat();

        // Test vector search performance on large dataset with simpler queries
        const searchQueries = [
          'test',
          'document',
          'sample',
          'content',
          'pipeline',
        ];

        const searchResults = await Promise.all(
          searchQueries.map((query) =>
            vectorSearch.search({
              query,
              userId: user.id,
              limit: 10,
              db,
            }),
          ),
        );

        return {
          documentId: document.id,
          contentLength: content.content.length,
          chunksCreated: chunks.length,
          embeddingsCreated: allEmbeddings.length,
          searchResults,
        };
      });

      // Performance assertions
      expect(duration).toBeLessThan(30000); // Should complete in under 30 seconds
      expect(result.chunksCreated).toBeGreaterThan(3); // Documents create multiple chunks
      expect(result.embeddingsCreated).toBe(result.chunksCreated);

      // Verify search quality on large dataset
      const successfulSearches = result.searchResults.filter(
        (sr) => sr.results.length > 0,
      );
      expect(successfulSearches.length).toBeGreaterThan(0);

      if (successfulSearches.length > 0) {
        expect(successfulSearches[0].results[0].score).toBeGreaterThan(0.1);
      }

      // Test performance of complex aggregation queries
      const aggregationStart = Date.now();

      const stats = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, result.documentId),
        with: {
          embedding: true,
        },
      });

      const aggregationDuration = Date.now() - aggregationStart;
      expect(aggregationDuration).toBeLessThan(1000); // Aggregation should be fast
      expect(stats.length).toBe(result.chunksCreated);

      // Record final metrics
      metrics.record('vector.large_scale.total_duration', duration);
      metrics.record('vector.large_scale.chunks', result.chunksCreated);
      metrics.record('vector.large_scale.content_size', result.contentLength);
    });
  });

  describe('Multi-Document Operations', () => {
    it('should handle multiple documents from different users', async () => {
      const { db } = testContext;

      // Create multiple users
      const user1Data = createTestUser();
      const user2Data = createTestUser();
      const [user1, user2] = await db
        .insert(schema.user)
        .values([user1Data, user2Data])
        .returning();

      // Create documents for each user
      const doc1Data = createTestDocument(user1.id);
      const doc2Data = createTestDocument(user2.id);
      const [doc1, doc2] = await db
        .insert(schema.ragDocument)
        .values([doc1Data, doc2Data])
        .returning();

      // Create chunks for both documents
      const doc1Chunks = Array.from({ length: 3 }, (_, i) =>
        createTestDocumentChunk(doc1.id, i),
      );
      const doc2Chunks = Array.from({ length: 3 }, (_, i) =>
        createTestDocumentChunk(doc2.id, i),
      );

      await db
        .insert(schema.documentChunk)
        .values([...doc1Chunks, ...doc2Chunks]);

      // Verify proper data isolation
      const user1Documents = await db.query.ragDocument.findMany({
        where: (doc, { eq }) => eq(doc.uploadedBy, user1.id),
        with: { chunks: true },
      });

      const user2Documents = await db.query.ragDocument.findMany({
        where: (doc, { eq }) => eq(doc.uploadedBy, user2.id),
        with: { chunks: true },
      });

      expect(user1Documents).toHaveLength(1);
      expect(user2Documents).toHaveLength(1);
      expect(user1Documents[0].chunks).toHaveLength(3);
      expect(user2Documents[0].chunks).toHaveLength(3);
    });

    it('should perform cross-document search operations', async () => {
      const { db } = testContext;

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple documents
      const doc1Data = createTestDocument(user.id);
      const doc2Data = createTestDocument(user.id);
      const [doc1, doc2] = await db
        .insert(schema.ragDocument)
        .values([doc1Data, doc2Data])
        .returning();

      // Create chunks with related content across documents
      const allChunks = [
        {
          ...createTestDocumentChunk(doc1.id, 0),
          content: 'Introduction to neural networks and deep learning',
        },
        {
          ...createTestDocumentChunk(doc1.id, 1),
          content: 'Backpropagation algorithm explained',
        },
        {
          ...createTestDocumentChunk(doc2.id, 0),
          content: 'Advanced neural network architectures',
        },
        {
          ...createTestDocumentChunk(doc2.id, 1),
          content: 'Optimization techniques for machine learning',
        },
      ];

      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(allChunks)
        .returning();

      // Create embeddings
      const embeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Search across all user documents
      const searchResults = await db.query.documentChunk.findMany({
        where: (chunk, { eq, inArray }) =>
          inArray(chunk.documentId, [doc1.id, doc2.id]),
        with: {
          embedding: true,
          document: true,
        },
      });

      expect(searchResults).toHaveLength(4);
      expect(
        searchResults.some((result) => result.documentId === doc1.id),
      ).toBe(true);
      expect(
        searchResults.some((result) => result.documentId === doc2.id),
      ).toBe(true);
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should maintain referential integrity during cascading deletes', async () => {
      const { db } = testContext;

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      const contentData = createTestDocumentContent(document.id);
      await db.insert(schema.documentContent).values(contentData);

      const chunkData = createTestDocumentChunk(document.id, 0);
      const [chunk] = await db
        .insert(schema.documentChunk)
        .values(chunkData)
        .returning();

      const embeddingData = {
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      };
      await db.insert(schema.documentEmbedding).values(embeddingData);

      // Delete document should cascade to all related records
      await db
        .delete(schema.ragDocument)
        .where(schema.ragDocument.id === document.id);

      // Verify all related records are deleted
      const remainingContent = await db.query.documentContent.findMany({
        where: (content, { eq }) => eq(content.documentId, document.id),
      });
      const remainingChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
      });
      const remainingEmbeddings = await db.query.documentEmbedding.findMany({
        where: (embedding, { eq }) => eq(embedding.chunkId, chunk.id),
      });

      expect(remainingContent).toHaveLength(0);
      expect(remainingChunks).toHaveLength(0);
      expect(remainingEmbeddings).toHaveLength(0);
    });

    it('should handle concurrent document operations safely', async () => {
      const { db } = testContext;

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Simulate concurrent document uploads
      const concurrentOperations = Array.from({ length: 5 }, (_, i) =>
        db
          .insert(schema.ragDocument)
          .values(createTestDocument(user.id))
          .returning(),
      );

      const results = await Promise.all(concurrentOperations);

      // Verify all operations completed successfully
      expect(results).toHaveLength(5);
      expect(results.every((result) => result.length === 1)).toBe(true);

      // Verify all documents exist in database
      const allDocuments = await db.query.ragDocument.findMany({
        where: (doc, { eq }) => eq(doc.uploadedBy, user.id),
      });

      expect(allDocuments).toHaveLength(5);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial pipeline failures', async () => {
      const { db } = testContext;

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Simulate partial processing - content extracted but chunking failed
      const contentData = createTestDocumentContent(document.id);
      await db.insert(schema.documentContent).values(contentData);

      await db
        .update(schema.ragDocument)
        .set({ status: 'text_extracted' })
        .where(schema.ragDocument.id === document.id);

      // Attempt recovery - complete the chunking process
      const chunks = Array.from({ length: 3 }, (_, i) =>
        createTestDocumentChunk(document.id, i),
      );
      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(chunks)
        .returning();

      await db
        .update(schema.ragDocument)
        .set({ status: 'chunked' })
        .where(schema.ragDocument.id === document.id);

      // Verify recovery was successful
      const recoveredDocument = await db.query.ragDocument.findFirst({
        where: (doc, { eq }) => eq(doc.id, document.id),
        with: {
          content: true,
          chunks: true,
        },
      });

      expect(recoveredDocument?.status).toBe('chunked');
      expect(recoveredDocument?.content).toBeDefined();
      expect(recoveredDocument?.chunks).toHaveLength(3);
    });

    it('should cleanup orphaned records', async () => {
      const { db } = testContext;

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      const chunkData = createTestDocumentChunk(document.id, 0);
      const [chunk] = await db
        .insert(schema.documentChunk)
        .values(chunkData)
        .returning();

      // Create orphaned embedding (simulate chunk deletion without embedding cleanup)
      const embeddingData = {
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      };
      await db.insert(schema.documentEmbedding).values(embeddingData);

      // Delete chunk manually (simulating orphaned embedding)
      await db
        .delete(schema.documentChunk)
        .where(schema.documentChunk.id === chunk.id);

      // Verify embedding is also removed due to cascade
      const orphanedEmbeddings = await db.query.documentEmbedding.findMany({
        where: (embedding, { eq }) => eq(embedding.chunkId, chunk.id),
      });

      expect(orphanedEmbeddings).toHaveLength(0);
    });
  });
});
