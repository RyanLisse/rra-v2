import { describe, it, expect, } from 'vitest';
import { setupTestDb } from '../utils/test-db';
import { measurePerformance } from '../utils/test-helpers';
import {
  createTestUser,
  createTestDocument,
  createTestDocumentChunk,
  createTestEmbedding,
} from '../fixtures/test-data';
import * as schema from '@/lib/db/schema';

describe('Vector Search Performance Tests', () => {
  const getDb = setupTestDb();

  describe('Embedding Storage Performance', () => {
    it('should efficiently store large batches of embeddings', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Create a large number of chunks
      const chunkCount = 1000;
      const chunks = Array.from({ length: chunkCount }, (_, i) => 
        createTestDocumentChunk(document.id, i)
      );

      const { result: insertedChunks, duration: chunkInsertTime } = await measurePerformance(
        async () => db.insert(schema.documentChunk).values(chunks).returning()
      );

      // Create embeddings for all chunks
      const embeddings = insertedChunks.map(chunk => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));

      const { duration: embeddingInsertTime, memoryUsage } = await measurePerformance(
        async () => db.insert(schema.documentEmbedding).values(embeddings)
      );

      // Performance assertions
      expect(chunkInsertTime).toBeLessThan(5000); // Less than 5 seconds
      expect(embeddingInsertTime).toBeLessThan(10000); // Less than 10 seconds
      expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Less than 500MB

      // Verify all embeddings were stored
      const storedEmbeddings = await db.query.documentEmbedding.findMany({
        where: (embedding, { inArray }) => 
          inArray(embedding.chunkId, insertedChunks.map(c => c.id))
      });

      expect(storedEmbeddings).toHaveLength(chunkCount);
    });

    it('should handle concurrent embedding operations', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple documents
      const docCount = 10;
      const docs = Array.from({ length: docCount }, () => createTestDocument(user.id));
      const insertedDocs = await db.insert(schema.ragDocument).values(docs).returning();

      // Create chunks for each document concurrently
      const chunkOperations = insertedDocs.map(async (doc, docIndex) => {
        const chunks = Array.from({ length: 100 }, (_, i) => 
          createTestDocumentChunk(doc.id, i)
        );
        return db.insert(schema.documentChunk).values(chunks).returning();
      });

      const { result: allChunkResults, duration: concurrentTime } = await measurePerformance(
        async () => Promise.all(chunkOperations)
      );

      const allChunks = allChunkResults.flat();

      // Create embeddings concurrently for all chunks
      const embeddingOperations = allChunks.map(async (chunk) => {
        const embedding = {
          chunkId: chunk.id,
          embedding: JSON.stringify(createTestEmbedding()),
          model: 'cohere-embed-v4.0',
        };
        return db.insert(schema.documentEmbedding).values(embedding);
      });

      const { duration: embeddingTime } = await measurePerformance(
        async () => Promise.all(embeddingOperations)
      );

      expect(concurrentTime).toBeLessThan(15000); // Less than 15 seconds
      expect(embeddingTime).toBeLessThan(20000); // Less than 20 seconds

      // Verify all embeddings were created
      const totalEmbeddings = await db.query.documentEmbedding.findMany();
      expect(totalEmbeddings).toHaveLength(docCount * 100);
    });
  });

  describe('Vector Search Performance', () => {
    it('should perform fast similarity searches', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Create a substantial dataset for search testing
      const chunkCount = 5000;
      const chunks = Array.from({ length: chunkCount }, (_, i) => 
        createTestDocumentChunk(document.id, i)
      );
      const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();

      // Create embeddings with varied content for realistic search scenarios
      const embeddings = insertedChunks.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Perform search operations
      const searchQueries = 10;
      const searchOperations = Array.from({ length: searchQueries }, async (_, i) => {
        return measurePerformance(async () => {
          // Simulate vector similarity search (in real implementation, this would use pgvector)
          return db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            with: { embedding: true },
            limit: 10, // Top 10 results
            offset: i * 100, // Vary search space
          });
        });
      });

      const searchResults = await Promise.all(searchOperations);
      
      // Performance assertions for search operations
      const averageSearchTime = searchResults.reduce((sum, result) => sum + result.duration, 0) / searchQueries;
      const maxSearchTime = Math.max(...searchResults.map(result => result.duration));

      expect(averageSearchTime).toBeLessThan(1000); // Average search under 1 second
      expect(maxSearchTime).toBeLessThan(2000); // Max search under 2 seconds

      // Verify search results quality
      searchResults.forEach(result => {
        expect(result.result).toHaveLength(10);
        expect(result.result.every(chunk => chunk.embedding)).toBe(true);
      });
    });

    it('should scale search performance with dataset size', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Test different dataset sizes
      const datasetSizes = [100, 500, 1000, 2000];
      const performanceResults = [];

      for (const size of datasetSizes) {
        const docData = createTestDocument(user.id);
        const [document] = await db.insert(schema.ragDocument).values(docData).returning();

        const chunks = Array.from({ length: size }, (_, i) => 
          createTestDocumentChunk(document.id, i)
        );
        const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();

        const embeddings = insertedChunks.map(chunk => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(createTestEmbedding()),
          model: 'cohere-embed-v4.0',
        }));
        await db.insert(schema.documentEmbedding).values(embeddings);

        // Measure search performance for this dataset size
        const { duration, result } = await measurePerformance(async () => {
          return db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            with: { embedding: true },
            limit: 10,
          });
        });

        performanceResults.push({
          datasetSize: size,
          searchTime: duration,
          resultCount: result.length,
        });
      }

      // Analyze scaling characteristics
      const timeIncreases = [];
      for (let i = 1; i < performanceResults.length; i++) {
        const prev = performanceResults[i - 1];
        const curr = performanceResults[i];
        const timeIncrease = curr.searchTime / prev.searchTime;
        timeIncreases.push(timeIncrease);
      }

      // Search time should scale sub-linearly (better than O(n))
      const averageTimeIncrease = timeIncreases.reduce((sum, inc) => sum + inc, 0) / timeIncreases.length;
      expect(averageTimeIncrease).toBeLessThan(3); // Should not triple with each doubling of data
    });
  });

  describe('Memory Usage Optimization', () => {
    it('should efficiently handle large embedding vectors', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Test with different embedding dimensions
      const embeddingDimensions = [768, 1536, 3072]; // Common embedding sizes
      
      for (const dimension of embeddingDimensions) {
        const chunkData = createTestDocumentChunk(document.id, 0);
        const [chunk] = await db.insert(schema.documentChunk).values(chunkData).returning();

        // Create high-dimensional embedding
        const largeEmbedding = Array.from({ length: dimension }, () => Math.random() * 2 - 1);
        
        const { duration, memoryUsage } = await measurePerformance(async () => {
          return db.insert(schema.documentEmbedding).values({
            chunkId: chunk.id,
            embedding: JSON.stringify(largeEmbedding),
            model: `test-model-${dimension}d`,
          });
        });

        expect(duration).toBeLessThan(5000); // Should store quickly regardless of dimension
        expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // Memory efficient
        
        // Clean up for next iteration
        await db.delete(schema.documentEmbedding).where(
          schema.documentEmbedding.chunkId === chunk.id
        );
        await db.delete(schema.documentChunk).where(
          schema.documentChunk.id === chunk.id
        );
      }
    });

    it('should efficiently stream large result sets', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Create a large dataset
      const chunkCount = 10000;
      const chunks = Array.from({ length: chunkCount }, (_, i) => 
        createTestDocumentChunk(document.id, i)
      );
      const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();

      const embeddings = insertedChunks.map(chunk => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(createTestEmbedding()),
        model: 'cohere-embed-v4.0',
      }));
      await db.insert(schema.documentEmbedding).values(embeddings);

      // Test paginated retrieval for memory efficiency
      const pageSize = 100;
      const totalPages = Math.ceil(chunkCount / pageSize);
      let totalProcessed = 0;

      const { duration, memoryUsage } = await measurePerformance(async () => {
        for (let page = 0; page < totalPages; page++) {
          const results = await db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            with: { embedding: true },
            limit: pageSize,
            offset: page * pageSize,
          });
          
          totalProcessed += results.length;
          
          // Simulate processing results (e.g., for search ranking)
          results.forEach(result => {
            const embedding = JSON.parse(result.embedding?.embedding || '[]');
            // Simulate vector operations
            const magnitude = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
            expect(magnitude).toBeGreaterThan(0);
          });
        }
        
        return totalProcessed;
      });

      expect(totalProcessed).toBe(chunkCount);
      expect(duration).toBeLessThan(30000); // Complete in under 30 seconds
      expect(memoryUsage.heapUsed).toBeLessThan(200 * 1024 * 1024); // Stay under 200MB
    });
  });

  describe('Index Performance', () => {
    it('should efficiently handle vector index operations', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple documents for index testing
      const docCount = 5;
      const docsData = Array.from({ length: docCount }, () => createTestDocument(user.id));
      const documents = await db.insert(schema.ragDocument).values(docsData).returning();

      // Create varying numbers of chunks per document
      const allChunks = [];
      for (let docIndex = 0; docIndex < documents.length; docIndex++) {
        const chunkCount = (docIndex + 1) * 200; // 200, 400, 600, 800, 1000 chunks
        const chunks = Array.from({ length: chunkCount }, (_, i) => 
          createTestDocumentChunk(documents[docIndex].id, i)
        );
        allChunks.push(...chunks);
      }

      const { duration: chunkInsertTime } = await measurePerformance(
        async () => db.insert(schema.documentChunk).values(allChunks).returning()
      );

      // Test index lookup performance across documents
      const { duration: lookupTime } = await measurePerformance(async () => {
        const results = [];
        for (const document of documents) {
          const documentChunks = await db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            limit: 50,
          });
          results.push(documentChunks);
        }
        return results;
      });

      expect(chunkInsertTime).toBeLessThan(10000); // Insert within 10 seconds
      expect(lookupTime).toBeLessThan(2000); // Lookups within 2 seconds

      // Test cross-document search performance
      const { duration: crossDocSearchTime } = await measurePerformance(async () => {
        return db.query.documentChunk.findMany({
          where: (chunk, { inArray }) => 
            inArray(chunk.documentId, documents.map(d => d.id)),
          limit: 100,
        });
      });

      expect(crossDocSearchTime).toBeLessThan(3000); // Cross-document search within 3 seconds
    });

    it('should maintain performance with frequent updates', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db.insert(schema.ragDocument).values(docData).returning();

      // Create initial dataset
      const initialChunks = Array.from({ length: 1000 }, (_, i) => 
        createTestDocumentChunk(document.id, i)
      );
      const insertedChunks = await db.insert(schema.documentChunk).values(initialChunks).returning();

      // Test performance with frequent updates
      const updateOperations = 100;
      const { duration: updateTime } = await measurePerformance(async () => {
        for (let i = 0; i < updateOperations; i++) {
          const randomChunk = insertedChunks[Math.floor(Math.random() * insertedChunks.length)];
          
          // Update chunk content
          await db
            .update(schema.documentChunk)
            .set({ content: `Updated content ${i}` })
            .where(schema.documentChunk.id === randomChunk.id);
          
          // Perform search to test index performance
          await db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            limit: 10,
          });
        }
      });

      expect(updateTime).toBeLessThan(20000); // Updates and searches within 20 seconds
    });
  });
});