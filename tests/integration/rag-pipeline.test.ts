import { describe, it, expect, } from 'vitest';
import { setupTestDb } from '../utils/test-db';
import { measurePerformance, } from '../utils/test-helpers';
import {
  createTestUser,
  createTestDocument,
  createTestDocumentContent,
  createTestDocumentChunk,
  createTestEmbedding,
} from '../fixtures/test-data';
import * as schema from '@/lib/db/schema';

describe('RAG Pipeline Integration Tests', () => {
  const getDb = setupTestDb();

  describe('Document Processing Pipeline', () => {
    it('should process document through complete pipeline', async () => {
      const db = getDb();
      
      // 1. Create test user
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // 2. Upload document
      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();
      
      expect(document.status).toBe('uploaded');

      // 3. Extract text content
      const contentData = createTestDocumentContent(document.id);
      const [content] = await db.insert(schema.documentContent).values(contentData).returning();
      
      // Update document status
      await db
        .update(schema.ragDocument)
        .set({ status: 'text_extracted' })
        .where(schema.ragDocument.id === document.id);

      // 4. Create chunks
      const chunks = Array.from({ length: 5 }, (_, i) => 
        createTestDocumentChunk(document.id, i)
      );
      const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();
      
      // Update document status
      await db
        .update(schema.ragDocument)
        .set({ status: 'chunked' })
        .where(schema.ragDocument.id === document.id);

      // 5. Create embeddings
      const embeddings = insertedChunks.map(chunk => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);
      
      // Update document status to final state
      await db
        .update(schema.ragDocument)
        .set({ status: 'processed' })
        .where(schema.ragDocument.id === document.id);

      // 6. Verify complete pipeline
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
      expect(finalDocument?.chunks).toHaveLength(5);
      expect(finalDocument?.chunks.every(chunk => chunk.embedding)).toBe(true);
    });

    it('should handle pipeline failures gracefully', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Simulate processing failure
      await db
        .update(schema.ragDocument)
        .set({ status: 'error' })
        .where(schema.ragDocument.id === document.id);

      const failedDocument = await db.query.ragDocument.findFirst({
        where: (doc, { eq }) => eq(doc.id, document.id),
      });

      expect(failedDocument?.status).toBe('error');
    });

    it('should measure pipeline performance', async () => {
      const db = getDb();
      
      const { result: performanceMetrics } = await measurePerformance(async () => {
        const userData = createTestUser();
        const [user] = await db.insert(schema.user).values(userData).returning();

        const docData = createTestDocument(user.id);
        const [document] = await db.insert(schema.ragDocument).values(docData).returning();

        const contentData = createTestDocumentContent(document.id);
        await db.insert(schema.documentContent).values(contentData);

        const chunks = Array.from({ length: 10 }, (_, i) => 
          createTestDocumentChunk(document.id, i)
        );
        const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();

        const embeddings = insertedChunks.map(chunk => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(createTestEmbedding()),
          model: 'cohere-embed-v4.0',
        }));
        await db.insert(schema.documentEmbedding).values(embeddings);

        return { chunksCreated: chunks.length, embeddingsCreated: embeddings.length };
      });

      expect(performanceMetrics.duration).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(performanceMetrics.memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
    });
  });

  describe('Vector Search Operations', () => {
    it('should perform semantic search on document chunks', async () => {
      const db = getDb();
      
      // Setup test data
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Create chunks with specific content for testing search
      const searchableChunks = [
        {
          ...createTestDocumentChunk(document.id, 0),
          content: 'This is about machine learning and artificial intelligence',
        },
        {
          ...createTestDocumentChunk(document.id, 1),
          content: 'This section discusses database management and optimization',
        },
        {
          ...createTestDocumentChunk(document.id, 2),
          content: 'Here we explore web development and user interface design',
        },
      ];

      const insertedChunks = await db.insert(schema.documentChunk).values(searchableChunks).returning();

      // Create embeddings for each chunk
      const embeddings = insertedChunks.map(chunk => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Perform search (mocked similarity search)
      const searchResults = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
        with: {
          embedding: true,
        },
        limit: 3,
      });

      expect(searchResults).toHaveLength(3);
      expect(searchResults.every(result => result.embedding)).toBe(true);
    });

    it('should handle large-scale vector operations', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Create a large number of chunks to test scalability
      const chunkCount = 100;
      const chunks = Array.from({ length: chunkCount }, (_, i) => 
        createTestDocumentChunk(document.id, i)
      );

      const { duration } = await measurePerformance(async () => {
        const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();
        
        // Batch insert embeddings
        const embeddings = insertedChunks.map(chunk => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(createTestEmbedding()),
          model: 'cohere-embed-v4.0',
        }));
        
        await db.insert(schema.documentEmbedding).values(embeddings);
        
        return insertedChunks.length;
      });

      // Verify all chunks and embeddings were created
      const totalChunks = await db.query.documentChunk.findMany({
        where: (chunk, { eq }) => eq(chunk.documentId, document.id),
      });
      
      const totalEmbeddings = await db.query.documentEmbedding.findMany();

      expect(totalChunks).toHaveLength(chunkCount);
      expect(totalEmbeddings).toHaveLength(chunkCount);
      expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
    });
  });

  describe('Multi-Document Operations', () => {
    it('should handle multiple documents from different users', async () => {
      const db = getDb();
      
      // Create multiple users
      const user1Data = createTestUser();
      const user2Data = createTestUser();
      const [user1, user2] = await db.insert(schema.user).values([user1Data, user2Data]).returning();

      // Create documents for each user
      const doc1Data = createTestDocument(user1.id);
      const doc2Data = createTestDocument(user2.id);
      const [doc1, doc2] = await db.insert(schema.ragDocument).values([doc1Data, doc2Data]).returning();

      // Create chunks for both documents
      const doc1Chunks = Array.from({ length: 3 }, (_, i) => 
        createTestDocumentChunk(doc1.id, i)
      );
      const doc2Chunks = Array.from({ length: 3 }, (_, i) => 
        createTestDocumentChunk(doc2.id, i)
      );

      await db.insert(schema.documentChunk).values([...doc1Chunks, ...doc2Chunks]);

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
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple documents
      const doc1Data = createTestDocument(user.id);
      const doc2Data = createTestDocument(user.id);
      const [doc1, doc2] = await db.insert(schema.ragDocument).values([doc1Data, doc2Data]).returning();

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

      const insertedChunks = await db.insert(schema.documentChunk).values(allChunks).returning();

      // Create embeddings
      const embeddings = insertedChunks.map(chunk => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Search across all user documents
      const searchResults = await db.query.documentChunk.findMany({
        where: (chunk, { eq, inArray }) => inArray(chunk.documentId, [doc1.id, doc2.id]),
        with: {
          embedding: true,
          document: true,
        },
      });

      expect(searchResults).toHaveLength(4);
      expect(searchResults.some(result => result.documentId === doc1.id)).toBe(true);
      expect(searchResults.some(result => result.documentId === doc2.id)).toBe(true);
    });
  });

  describe('Database Transaction Integrity', () => {
    it('should maintain referential integrity during cascading deletes', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      const contentData = createTestDocumentContent(document.id);
      await db.insert(schema.documentContent).values(contentData);

      const chunkData = createTestDocumentChunk(document.id, 0);
      const [chunk] = await db.insert(schema.documentChunk).values(chunkData).returning();

      const embeddingData = {
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      };
      await db.insert(schema.documentEmbedding).values(embeddingData);

      // Delete document should cascade to all related records
      await db.delete(schema.ragDocument).where(schema.ragDocument.id === document.id);

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
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Simulate concurrent document uploads
      const concurrentOperations = Array.from({ length: 5 }, (_, i) => 
        db.insert(schema.ragDocument)
          .values(createTestDocument(user.id))
          .returning()
      );

      const results = await Promise.all(concurrentOperations);
      
      // Verify all operations completed successfully
      expect(results).toHaveLength(5);
      expect(results.every(result => result.length === 1)).toBe(true);

      // Verify all documents exist in database
      const allDocuments = await db.query.ragDocument.findMany({
        where: (doc, { eq }) => eq(doc.uploadedBy, user.id),
      });

      expect(allDocuments).toHaveLength(5);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial pipeline failures', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Simulate partial processing - content extracted but chunking failed
      const contentData = createTestDocumentContent(document.id);
      await db.insert(schema.documentContent).values(contentData);
      
      await db
        .update(schema.ragDocument)
        .set({ status: 'text_extracted' })
        .where(schema.ragDocument.id === document.id);

      // Attempt recovery - complete the chunking process
      const chunks = Array.from({ length: 3 }, (_, i) => 
        createTestDocumentChunk(document.id, i)
      );
      const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();

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
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      const chunkData = createTestDocumentChunk(document.id, 0);
      const [chunk] = await db.insert(schema.documentChunk).values(chunkData).returning();

      // Create orphaned embedding (simulate chunk deletion without embedding cleanup)
      const embeddingData = {
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      };
      await db.insert(schema.documentEmbedding).values(embeddingData);

      // Delete chunk manually (simulating orphaned embedding)
      await db.delete(schema.documentChunk).where(schema.documentChunk.id === chunk.id);

      // Verify embedding is also removed due to cascade
      const orphanedEmbeddings = await db.query.documentEmbedding.findMany({
        where: (embedding, { eq }) => eq(embedding.chunkId, chunk.id),
      });

      expect(orphanedEmbeddings).toHaveLength(0);
    });
  });
});