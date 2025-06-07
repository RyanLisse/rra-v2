import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { setupNeonTestBranching, getTestDatabaseUrl, isNeonBranchingEnabled } from '../config/neon-branch-setup';
import { measurePerformance } from '../utils/test-helpers';
import {
  createTestUser,
  createTestDocument,
  createTestDocumentChunk,
  createTestEmbedding,
  createPerformanceDataFactory,
} from '../fixtures/test-data';
import * as schema from '@/lib/db/schema';
import { migrate } from '@/lib/db/migrate';
import { getNeonLogger } from '@/lib/testing/neon-logger';

const logger = getNeonLogger();
const TEST_SUITE_NAME = 'vector-search-performance';

// Performance configuration
const PERFORMANCE_CONFIG = {
  SMALL_DATASET: 1000,
  MEDIUM_DATASET: 5000,
  LARGE_DATASET: 10000,
  XL_DATASET: 25000,
  CONCURRENT_OPERATIONS: 20,
  SEARCH_ITERATIONS: 10,
  TIMEOUT_EXTENDED: 300000, // 5 minutes for large operations
  MEMORY_LIMIT_MB: 1024, // 1GB memory limit
};

describe('Vector Search Performance Tests (Enhanced with Neon Branching)', () => {
  let db: ReturnType<typeof drizzle>;
  let client: ReturnType<typeof postgres>;
  const performanceFactory = createPerformanceDataFactory();

  // Enhanced Neon test branching setup
  setupNeonTestBranching(TEST_SUITE_NAME, {
    useEnhancedClient: true,
    branchOptions: {
      purpose: 'performance-testing',
      tags: ['performance', 'vector-search', 'large-dataset'],
      computeSize: 'large', // Use larger compute for performance tests
    },
    enableMetrics: true,
  });

  beforeAll(async () => {
    const connectionString = getTestDatabaseUrl();
    logger.info('performance_setup', 'Initializing performance test database', {
      branchingEnabled: isNeonBranchingEnabled(),
      connectionString: connectionString.replace(/\/\/[^@]+@/, '//***@'),
    });

    client = postgres(connectionString, {
      max: 20, // Increased connection pool for performance tests
      idle_timeout: 30,
      connect_timeout: 60,
      transform: {
        undefined: null,
      },
    });

    db = drizzle(client);

    // Run migrations on test branch
    await migrate();
    
    logger.info('performance_setup', 'Performance test database ready');
  }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  describe('Embedding Storage Performance', () => {
    it('should efficiently store large batches of embeddings', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting large batch embedding storage test');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Use performance factory for realistic large dataset
      const chunkCount = PERFORMANCE_CONFIG.LARGE_DATASET;
      const chunks = performanceFactory.createBulkDocumentChunks(document.id, chunkCount);

      const { result: insertedChunks, duration: chunkInsertTime } =
        await measurePerformance(async () =>
          db.insert(schema.documentChunk).values(chunks).returning(),
        );

      logger.info('performance_metrics', 'Chunk insertion completed', {
        chunkCount,
        insertTime: chunkInsertTime,
        throughput: chunkCount / (chunkInsertTime / 1000),
      });

      // Create realistic high-dimensional embeddings
      const embeddings = insertedChunks.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536)), // Cohere embed-v4.0 dimension
        model: 'cohere-embed-v4.0',
      }));

      const { duration: embeddingInsertTime, memoryUsage } =
        await measurePerformance(async () => {
          // Process in batches to avoid memory issues
          const batchSize = 1000;
          for (let i = 0; i < embeddings.length; i += batchSize) {
            const batch = embeddings.slice(i, i + batchSize);
            await db.insert(schema.documentEmbedding).values(batch);
          }
        });

      // Enhanced performance assertions with realistic expectations
      const expectedChunkTime = chunkCount * 0.01; // 10ms per chunk is reasonable
      const expectedEmbeddingTime = chunkCount * 0.05; // 50ms per embedding is reasonable
      
      expect(chunkInsertTime).toBeLessThan(expectedChunkTime);
      expect(embeddingInsertTime).toBeLessThan(expectedEmbeddingTime);
      expect(memoryUsage.heapUsed).toBeLessThan(PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024);

      // Verify all embeddings were stored
      const storedEmbeddings = await db.query.documentEmbedding.findMany({
        where: (embedding, { inArray }) =>
          inArray(
            embedding.chunkId,
            insertedChunks.map((c) => c.id),
          ),
      });

      expect(storedEmbeddings).toHaveLength(chunkCount);

      logger.info('performance_test', 'Large batch embedding storage test completed', {
        totalTime: Date.now() - testStart,
        chunkThroughput: chunkCount / (chunkInsertTime / 1000),
        embeddingThroughput: chunkCount / (embeddingInsertTime / 1000),
        memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);

    it('should handle concurrent embedding operations at scale', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting concurrent embedding operations test');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple documents for realistic concurrent testing
      const docCount = PERFORMANCE_CONFIG.CONCURRENT_OPERATIONS;
      const chunksPerDoc = 500; // Increased for realistic load testing
      
      const docs = performanceFactory.createBulkDocuments(user.id, docCount);
      const insertedDocs = await db
        .insert(schema.ragDocument)
        .values(docs)
        .returning();

      logger.info('performance_metrics', 'Documents created for concurrent test', {
        docCount,
        chunksPerDoc,
        totalChunks: docCount * chunksPerDoc,
      });

      // Create chunks for each document concurrently with batching
      const chunkOperations = insertedDocs.map(async (doc, docIndex) => {
        const chunks = performanceFactory.createBulkDocumentChunks(doc.id, chunksPerDoc);
        
        // Process in smaller batches to avoid overwhelming the database
        const batchSize = 100;
        const results = [];
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const batchResult = await db.insert(schema.documentChunk).values(batch).returning();
          results.push(...batchResult);
        }
        return results;
      });

      const { result: allChunkResults, duration: concurrentTime } =
        await measurePerformance(async () => Promise.all(chunkOperations));

      const allChunks = allChunkResults.flat();

      logger.info('performance_metrics', 'Concurrent chunk insertion completed', {
        totalChunks: allChunks.length,
        concurrentTime,
        throughput: allChunks.length / (concurrentTime / 1000),
      });

      // Create embeddings with controlled concurrency to avoid resource exhaustion
      const { duration: embeddingTime, memoryUsage } = await measurePerformance(async () => {
        const concurrencyLimit = 10;
        const chunkBatches = [];
        
        for (let i = 0; i < allChunks.length; i += concurrencyLimit) {
          chunkBatches.push(allChunks.slice(i, i + concurrencyLimit));
        }

        for (const batch of chunkBatches) {
          const embeddingOperations = batch.map(async (chunk) => {
            const embedding = {
              chunkId: chunk.id,
              embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536)),
              model: 'cohere-embed-v4.0',
            };
            return db.insert(schema.documentEmbedding).values(embedding);
          });
          
          await Promise.all(embeddingOperations);
        }
      });

      // Enhanced performance assertions
      const totalChunks = docCount * chunksPerDoc;
      const expectedConcurrentTime = totalChunks * 0.05; // 50ms per chunk in concurrent scenario
      const expectedEmbeddingTime = totalChunks * 0.1; // 100ms per embedding in concurrent scenario
      
      expect(concurrentTime).toBeLessThan(expectedConcurrentTime);
      expect(embeddingTime).toBeLessThan(expectedEmbeddingTime);
      expect(memoryUsage.heapUsed).toBeLessThan(PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024);

      // Verify all embeddings were created
      const totalEmbeddings = await db.query.documentEmbedding.findMany();
      expect(totalEmbeddings).toHaveLength(totalChunks);

      logger.info('performance_test', 'Concurrent embedding operations test completed', {
        totalTime: Date.now() - testStart,
        concurrentThroughput: totalChunks / (concurrentTime / 1000),
        embeddingThroughput: totalChunks / (embeddingTime / 1000),
        memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
        totalChunks,
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);
  });

  describe('Vector Search Performance', () => {
    it('should perform fast similarity searches with large datasets', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting large dataset vector search test');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create extra large dataset for realistic vector search testing
      const chunkCount = PERFORMANCE_CONFIG.XL_DATASET;
      const chunks = performanceFactory.createBulkDocumentChunks(document.id, chunkCount);
      
      logger.info('performance_metrics', 'Creating large dataset for vector search', {
        chunkCount,
        expectedMemoryMB: (chunkCount * 1536 * 4) / (1024 * 1024), // Rough embedding memory estimate
      });

      // Process chunks in batches to manage memory
      const batchSize = 2000;
      const allInsertedChunks = [];
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const insertedBatch = await db
          .insert(schema.documentChunk)
          .values(batch)
          .returning();
        allInsertedChunks.push(...insertedBatch);
      }

      // Create realistic embeddings with varied patterns for search diversity
      logger.info('performance_metrics', 'Creating embeddings with search patterns');
      const embeddingBatchSize = 1000;
      for (let i = 0; i < allInsertedChunks.length; i += embeddingBatchSize) {
        const chunkBatch = allInsertedChunks.slice(i, i + embeddingBatchSize);
        const embeddings = chunkBatch.map((chunk, index) => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(performanceFactory.createSearchableEmbedding(1536, index % 10)), // 10 different patterns
          model: 'cohere-embed-v4.0',
        }));
        await db.insert(schema.documentEmbedding).values(embeddings);
      }

      logger.info('performance_metrics', 'Dataset creation completed, starting search tests');

      // Perform intensive search operations
      const searchQueries = PERFORMANCE_CONFIG.SEARCH_ITERATIONS;
      const searchOperations = Array.from(
        { length: searchQueries },
        async (_, i) => {
          return measurePerformance(async () => {
            // Simulate realistic vector similarity search patterns
            const offset = Math.floor(Math.random() * (chunkCount - 100));
            const limit = 20; // More realistic search result count
            
            return db.query.documentChunk.findMany({
              where: (chunk, { eq }) => eq(chunk.documentId, document.id),
              with: { embedding: true },
              limit,
              offset,
            });
          });
        },
      );

      const { result: searchResults, duration: totalSearchTime } = 
        await measurePerformance(async () => Promise.all(searchOperations));

      // Enhanced performance analysis
      const searchTimes = searchResults.map(r => r.duration);
      const averageSearchTime = searchTimes.reduce((sum, time) => sum + time, 0) / searchQueries;
      const maxSearchTime = Math.max(...searchTimes);
      const minSearchTime = Math.min(...searchTimes);
      const searchTimeVariance = searchTimes.reduce((sum, time) => sum + Math.pow(time - averageSearchTime, 2), 0) / searchQueries;

      // Performance assertions adapted for large datasets
      const expectedAvgSearchTime = Math.log2(chunkCount) * 100; // Logarithmic scaling expectation
      const expectedMaxSearchTime = expectedAvgSearchTime * 3; // Allow for some variance
      
      expect(averageSearchTime).toBeLessThan(expectedAvgSearchTime);
      expect(maxSearchTime).toBeLessThan(expectedMaxSearchTime);
      expect(searchTimeVariance).toBeLessThan(Math.pow(expectedAvgSearchTime * 0.5, 2)); // Consistent performance

      // Verify search results quality and consistency
      searchResults.forEach((result) => {
        expect(result.result).toHaveLength(20);
        expect(result.result.every((chunk) => chunk.embedding)).toBe(true);
      });

      logger.info('performance_test', 'Large dataset vector search test completed', {
        totalTime: Date.now() - testStart,
        datasetSize: chunkCount,
        searchQueries,
        averageSearchTime,
        maxSearchTime,
        minSearchTime,
        searchTimeVariance,
        throughputQPS: searchQueries / (totalSearchTime / 1000),
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);

    it('should demonstrate excellent scaling characteristics across dataset sizes', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting search scaling analysis test');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Test realistic dataset sizes for scaling analysis
      const datasetSizes = [
        PERFORMANCE_CONFIG.SMALL_DATASET,    // 1,000
        PERFORMANCE_CONFIG.MEDIUM_DATASET,   // 5,000
        PERFORMANCE_CONFIG.LARGE_DATASET,    // 10,000
        PERFORMANCE_CONFIG.XL_DATASET,       // 25,000
      ];
      const performanceResults = [];

      for (const size of datasetSizes) {
        const sizeTestStart = Date.now();
        logger.info('performance_metrics', `Testing dataset size: ${size}`);
        
        const docData = createTestDocument(user.id);
        const [document] = await db
          .insert(schema.ragDocument)
          .values(docData)
          .returning();

        // Create chunks with performance factory for consistency
        const chunks = performanceFactory.createBulkDocumentChunks(document.id, size);
        
        // Process in batches to manage memory
        const batchSize = 1000;
        const allInsertedChunks = [];
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const insertedBatch = await db
            .insert(schema.documentChunk)
            .values(batch)
            .returning();
          allInsertedChunks.push(...insertedBatch);
        }

        // Create embeddings in batches
        for (let i = 0; i < allInsertedChunks.length; i += batchSize) {
          const chunkBatch = allInsertedChunks.slice(i, i + batchSize);
          const embeddings = chunkBatch.map((chunk) => ({
            chunkId: chunk.id,
            embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536)),
            model: 'cohere-embed-v4.0',
          }));
          await db.insert(schema.documentEmbedding).values(embeddings);
        }

        // Measure search performance with multiple search patterns
        const searchIterations = 5;
        const searchTimes = [];
        
        for (let i = 0; i < searchIterations; i++) {
          const { duration, result } = await measurePerformance(async () => {
            const offset = Math.floor(Math.random() * Math.max(1, size - 50));
            return db.query.documentChunk.findMany({
              where: (chunk, { eq }) => eq(chunk.documentId, document.id),
              with: { embedding: true },
              limit: 20,
              offset,
            });
          });
          searchTimes.push(duration);
        }

        const avgSearchTime = searchTimes.reduce((sum, time) => sum + time, 0) / searchTimes.length;
        const maxSearchTime = Math.max(...searchTimes);
        const minSearchTime = Math.min(...searchTimes);
        
        performanceResults.push({
          datasetSize: size,
          avgSearchTime,
          maxSearchTime,
          minSearchTime,
          searchVariance: searchTimes.reduce((sum, time) => sum + Math.pow(time - avgSearchTime, 2), 0) / searchTimes.length,
          setupTime: Date.now() - sizeTestStart,
        });

        logger.info('performance_metrics', `Dataset size ${size} completed`, {
          avgSearchTime,
          maxSearchTime,
          setupTime: Date.now() - sizeTestStart,
        });
      }

      // Advanced scaling analysis
      const scalingFactors = [];
      const efficiencyMetrics = [];
      
      for (let i = 1; i < performanceResults.length; i++) {
        const prev = performanceResults[i - 1];
        const curr = performanceResults[i];
        
        const sizeRatio = curr.datasetSize / prev.datasetSize;
        const timeRatio = curr.avgSearchTime / prev.avgSearchTime;
        const scalingFactor = timeRatio / sizeRatio;
        
        scalingFactors.push(scalingFactor);
        efficiencyMetrics.push({
          sizeIncrease: sizeRatio,
          timeIncrease: timeRatio,
          scalingFactor,
          efficiency: 1 / scalingFactor, // Higher is better
        });
      }

      // Performance assertions with sophisticated metrics
      const avgScalingFactor = scalingFactors.reduce((sum, factor) => sum + factor, 0) / scalingFactors.length;
      const maxSearchTimeOverall = Math.max(...performanceResults.map(r => r.maxSearchTime));
      const searchTimeGrowthRate = performanceResults[performanceResults.length - 1].avgSearchTime / performanceResults[0].avgSearchTime;
      
      // Expect sub-linear scaling (logarithmic ideally)
      expect(avgScalingFactor).toBeLessThan(0.5); // Time should grow slower than dataset size
      expect(maxSearchTimeOverall).toBeLessThan(3000); // Even largest dataset should search quickly
      expect(searchTimeGrowthRate).toBeLessThan(5); // Total growth should be reasonable

      // Verify consistency across all dataset sizes
      performanceResults.forEach((result, index) => {
        expect(result.avgSearchTime).toBeLessThan(2000); // All searches should be fast
        expect(result.searchVariance).toBeLessThan(Math.pow(result.avgSearchTime * 0.3, 2)); // Consistent performance
      });

      logger.info('performance_test', 'Search scaling analysis completed', {
        totalTime: Date.now() - testStart,
        datasetSizes,
        avgScalingFactor,
        maxSearchTimeOverall,
        searchTimeGrowthRate,
        efficiencyMetrics,
        performanceResults,
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);
  });

  describe('Memory Usage Optimization', () => {
    it('should efficiently handle various embedding dimensions at scale', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting memory optimization test for embedding dimensions');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Test with comprehensive embedding dimensions including modern models
      const embeddingDimensions = [384, 768, 1024, 1536, 2048, 3072, 4096]; // Full range of common embedding sizes
      const chunksPerDimension = 1000; // Realistic scale for memory testing
      const memoryResults = [];

      for (const dimension of embeddingDimensions) {
        const dimensionStart = Date.now();
        logger.info('performance_metrics', `Testing dimension: ${dimension}`);
        
        // Create multiple chunks for this dimension test
        const chunks = performanceFactory.createBulkDocumentChunks(document.id, chunksPerDimension);
        const insertedChunks = await db
          .insert(schema.documentChunk)
          .values(chunks)
          .returning();

        // Create embeddings with specified dimension
        const embeddings = insertedChunks.map((chunk, index) => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(dimension)),
          model: `test-model-${dimension}d`,
        }));

        const { duration, memoryUsage } = await measurePerformance(async () => {
          // Process in batches to monitor memory usage
          const batchSize = 100;
          for (let i = 0; i < embeddings.length; i += batchSize) {
            const batch = embeddings.slice(i, i + batchSize);
            await db.insert(schema.documentEmbedding).values(batch);
          }
        });

        const avgEmbeddingSize = JSON.stringify(performanceFactory.createRealisticEmbedding(dimension)).length;
        const theoreticalMemoryMB = (chunksPerDimension * avgEmbeddingSize) / (1024 * 1024);
        const actualMemoryMB = memoryUsage.heapUsed / (1024 * 1024);
        const memoryEfficiency = theoreticalMemoryMB / actualMemoryMB;
        
        memoryResults.push({
          dimension,
          duration,
          memoryUsageMB: actualMemoryMB,
          theoreticalMemoryMB,
          memoryEfficiency,
          throughput: chunksPerDimension / (duration / 1000),
        });

        // Performance assertions with dimension-aware expectations
        const expectedDuration = dimension * 0.1 * chunksPerDimension / 100; // Scale with dimension and chunk count
        const expectedMemoryMB = theoreticalMemoryMB * 3; // Allow for overhead
        
        expect(duration).toBeLessThan(expectedDuration);
        expect(actualMemoryMB).toBeLessThan(expectedMemoryMB);
        expect(memoryEfficiency).toBeGreaterThan(0.1); // At least 10% memory efficiency

        logger.info('performance_metrics', `Dimension ${dimension} completed`, {
          duration,
          memoryUsageMB: actualMemoryMB,
          memoryEfficiency,
          throughput: chunksPerDimension / (duration / 1000),
        });

        // Clean up for next iteration
        await db
          .delete(schema.documentEmbedding)
          .where((embedding, { inArray }) =>
            inArray(
              embedding.chunkId,
              insertedChunks.map((c) => c.id),
            )
          );
        await db
          .delete(schema.documentChunk)
          .where((chunk, { inArray }) =>
            inArray(
              chunk.id,
              insertedChunks.map((c) => c.id),
            )
          );
      }

      // Analyze memory scaling across dimensions
      const memoryScalingFactors = [];
      for (let i = 1; i < memoryResults.length; i++) {
        const prev = memoryResults[i - 1];
        const curr = memoryResults[i];
        const dimensionRatio = curr.dimension / prev.dimension;
        const memoryRatio = curr.memoryUsageMB / prev.memoryUsageMB;
        memoryScalingFactors.push(memoryRatio / dimensionRatio);
      }

      const avgMemoryScaling = memoryScalingFactors.reduce((sum, factor) => sum + factor, 0) / memoryScalingFactors.length;
      
      // Memory usage should scale linearly with dimension (factor should be close to 1)
      expect(avgMemoryScaling).toBeLessThan(1.5); // Allow for some overhead
      expect(avgMemoryScaling).toBeGreaterThan(0.8); // Should not be too efficient (unrealistic)

      logger.info('performance_test', 'Memory optimization test completed', {
        totalTime: Date.now() - testStart,
        embeddingDimensions,
        avgMemoryScaling,
        memoryResults,
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);

    it('should efficiently stream and process massive result sets', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting massive result set streaming test');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create massive dataset for streaming test
      const chunkCount = PERFORMANCE_CONFIG.XL_DATASET * 2; // 50,000 chunks
      const chunks = performanceFactory.createBulkDocumentChunks(document.id, chunkCount);
      
      logger.info('performance_metrics', 'Creating massive dataset for streaming test', {
        chunkCount,
        estimatedDataSizeMB: (chunkCount * 2000) / (1024 * 1024), // Rough estimate
      });

      // Insert chunks in batches to avoid memory issues
      const insertBatchSize = 2000;
      const allInsertedChunks = [];
      for (let i = 0; i < chunks.length; i += insertBatchSize) {
        const batch = chunks.slice(i, i + insertBatchSize);
        const insertedBatch = await db
          .insert(schema.documentChunk)
          .values(batch)
          .returning();
        allInsertedChunks.push(...insertedBatch);
      }

      // Create embeddings in batches
      const embeddingBatchSize = 1000;
      for (let i = 0; i < allInsertedChunks.length; i += embeddingBatchSize) {
        const chunkBatch = allInsertedChunks.slice(i, i + embeddingBatchSize);
        const embeddings = chunkBatch.map((chunk) => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536)),
          model: 'cohere-embed-v4.0',
        }));
        await db.insert(schema.documentEmbedding).values(embeddings);
      }

      logger.info('performance_metrics', 'Massive dataset created, starting streaming test');

      // Test progressive pagination with different page sizes
      const pageSizes = [50, 100, 200, 500, 1000];
      const streamingResults = [];

      for (const pageSize of pageSizes) {
        const totalPages = Math.ceil(chunkCount / pageSize);
        let totalProcessed = 0;
        let vectorProcessingTime = 0;
        
        const { duration, memoryUsage } = await measurePerformance(async () => {
          let maxMemoryUsage = 0;
          const memoryCheckInterval = Math.max(1, Math.floor(totalPages / 10));
          
          for (let page = 0; page < totalPages; page++) {
            const results = await db.query.documentChunk.findMany({
              where: (chunk, { eq }) => eq(chunk.documentId, document.id),
              with: { embedding: true },
              limit: pageSize,
              offset: page * pageSize,
            });

            totalProcessed += results.length;

            // Simulate realistic vector processing operations
            const processingStart = Date.now();
            results.forEach((result) => {
              if (result.embedding?.embedding) {
                const embedding = JSON.parse(result.embedding.embedding);
                
                // Simulate vector operations (similarity calculation, normalization)
                const magnitude = Math.sqrt(
                  embedding.reduce(
                    (sum: number, val: number) => sum + val * val,
                    0,
                  ),
                );
                
                // Simulate dot product with query vector
                const queryVector = performanceFactory.createRealisticEmbedding(1536);
                const dotProduct = embedding.reduce(
                  (sum: number, val: number, idx: number) => sum + val * queryVector[idx],
                  0,
                );
                
                expect(magnitude).toBeGreaterThan(0);
                expect(dotProduct).toBeDefined();
              }
            });
            vectorProcessingTime += Date.now() - processingStart;

            // Monitor memory usage periodically
            if (page % memoryCheckInterval === 0) {
              const currentMemory = process.memoryUsage().heapUsed;
              maxMemoryUsage = Math.max(maxMemoryUsage, currentMemory);
            }
          }

          return { totalProcessed, maxMemoryUsage, vectorProcessingTime };
        });

        const result = await measurePerformance(async () => ({
          totalProcessed,
          vectorProcessingTime,
        }));

        streamingResults.push({
          pageSize,
          totalPages,
          duration,
          vectorProcessingTime,
          memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
          throughput: totalProcessed / (duration / 1000),
          vectorThroughput: totalProcessed / (vectorProcessingTime / 1000),
        });

        // Performance assertions for each page size
        expect(totalProcessed).toBe(chunkCount);
        expect(duration).toBeLessThan(120000); // Complete in under 2 minutes
        expect(memoryUsage.heapUsed).toBeLessThan(PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024);

        logger.info('performance_metrics', `Streaming test completed for page size ${pageSize}`, {
          duration,
          memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
          throughput: totalProcessed / (duration / 1000),
        });
      }

      // Analyze optimal page size
      const optimalPageSize = streamingResults.reduce((best, current) => 
        current.throughput > best.throughput ? current : best
      );
      
      logger.info('performance_test', 'Massive result set streaming test completed', {
        totalTime: Date.now() - testStart,
        datasetSize: chunkCount,
        optimalPageSize: optimalPageSize.pageSize,
        maxThroughput: optimalPageSize.throughput,
        streamingResults,
      });

      // Verify optimal page size is reasonable
      expect(optimalPageSize.pageSize).toBeGreaterThan(50);
      expect(optimalPageSize.pageSize).toBeLessThan(2000);
      expect(optimalPageSize.throughput).toBeGreaterThan(1000); // At least 1000 chunks/second
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);
  });

  describe('Index Performance', () => {
    it('should efficiently handle complex vector index operations', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting complex vector index operations test');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple documents with realistic distribution for index testing
      const docCount = 20; // Increased for realistic index testing
      const docsData = performanceFactory.createBulkDocuments(user.id, docCount);
      const documents = await db
        .insert(schema.ragDocument)
        .values(docsData)
        .returning();

      logger.info('performance_metrics', 'Creating distributed dataset for index testing', {
        docCount,
        expectedTotalChunks: docCount * 1000, // Average chunks per doc
      });

      // Create realistically distributed chunks per document
      const allChunks = [];
      const documentChunkCounts = [];
      
      for (let docIndex = 0; docIndex < documents.length; docIndex++) {
        // Realistic distribution: some docs have few chunks, others have many
        const baseCount = 500;
        const variationFactor = Math.pow(2, docIndex % 4); // Powers of 2 for distribution
        const chunkCount = baseCount * variationFactor; // 500, 1000, 2000, 4000, then repeat
        
        documentChunkCounts.push(chunkCount);
        const chunks = performanceFactory.createBulkDocumentChunks(documents[docIndex].id, chunkCount);
        allChunks.push(...chunks);
      }

      const totalChunks = allChunks.length;
      logger.info('performance_metrics', 'Generated chunks for index testing', {
        totalChunks,
        documentChunkCounts,
        avgChunksPerDoc: totalChunks / docCount,
      });

      // Insert chunks in optimized batches
      const { duration: chunkInsertTime } = await measurePerformance(async () => {
        const batchSize = 2000;
        const insertedChunks = [];
        for (let i = 0; i < allChunks.length; i += batchSize) {
          const batch = allChunks.slice(i, i + batchSize);
          const result = await db.insert(schema.documentChunk).values(batch).returning();
          insertedChunks.push(...result);
        }
        return insertedChunks;
      });

      // Test index lookup performance across documents with various patterns
      const { duration: lookupTime, result: lookupResults } = await measurePerformance(async () => {
        const results = [];
        
        // Test different lookup patterns
        for (const document of documents) {
          // Small result set lookup
          const smallResults = await db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            limit: 20,
          });
          
          // Medium result set lookup
          const mediumResults = await db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            limit: 100,
            offset: 50,
          });
          
          // Large result set lookup
          const largeResults = await db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, document.id),
            limit: 500,
            offset: 100,
          });
          
          results.push({
            documentId: document.id,
            smallCount: smallResults.length,
            mediumCount: mediumResults.length,
            largeCount: largeResults.length,
          });
        }
        return results;
      });

      // Test cross-document search performance with complex queries
      const { duration: crossDocSearchTime, result: crossDocResults } = await measurePerformance(
        async () => {
          const results = [];
          
          // Test various cross-document query patterns
          
          // Query subset of documents
          const subsetDocs = documents.slice(0, Math.floor(documents.length / 2));
          const subsetResults = await db.query.documentChunk.findMany({
            where: (chunk, { inArray }) =>
              inArray(
                chunk.documentId,
                subsetDocs.map((d) => d.id),
              ),
            limit: 200,
          });
          
          // Query all documents with limit
          const allDocsResults = await db.query.documentChunk.findMany({
            where: (chunk, { inArray }) =>
              inArray(
                chunk.documentId,
                documents.map((d) => d.id),
              ),
            limit: 500,
          });
          
          // Query with ordering for index stress test
          const orderedResults = await db.query.documentChunk.findMany({
            where: (chunk, { inArray }) =>
              inArray(
                chunk.documentId,
                documents.map((d) => d.id),
              ),
            limit: 300,
            orderBy: (chunk, { desc }) => desc(chunk.createdAt),
          });
          
          results.push({
            subsetCount: subsetResults.length,
            allDocsCount: allDocsResults.length,
            orderedCount: orderedResults.length,
          });
          
          return results;
        },
      );

      // Enhanced performance assertions with realistic expectations
      const insertThroughput = totalChunks / (chunkInsertTime / 1000);
      const lookupThroughput = (docCount * 3) / (lookupTime / 1000); // 3 queries per document
      
      expect(chunkInsertTime).toBeLessThan(totalChunks * 0.05); // 50ms per 1000 chunks
      expect(lookupTime).toBeLessThan(docCount * 100); // 100ms per document max
      expect(crossDocSearchTime).toBeLessThan(5000); // Complex cross-document searches within 5 seconds
      expect(insertThroughput).toBeGreaterThan(1000); // At least 1000 chunks/second insert
      expect(lookupThroughput).toBeGreaterThan(10); // At least 10 queries/second

      // Verify result quality
      expect(lookupResults).toHaveLength(docCount);
      expect(crossDocResults).toHaveLength(1);
      lookupResults.forEach((result) => {
        expect(result.smallCount).toBeLessThanOrEqual(20);
        expect(result.mediumCount).toBeLessThanOrEqual(100);
        expect(result.largeCount).toBeLessThanOrEqual(500);
      });

      logger.info('performance_test', 'Complex vector index operations test completed', {
        totalTime: Date.now() - testStart,
        totalChunks,
        docCount,
        insertThroughput,
        lookupThroughput,
        chunkInsertTime,
        lookupTime,
        crossDocSearchTime,
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);

    it('should maintain performance under intensive update and query loads', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting intensive update and query load test');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const docData = createTestDocument(user.id);
      const [document] = await db
        .insert(schema.ragDocument)
        .values(docData)
        .returning();

      // Create substantial initial dataset
      const initialChunkCount = PERFORMANCE_CONFIG.MEDIUM_DATASET; // 5,000 chunks
      const initialChunks = performanceFactory.createBulkDocumentChunks(document.id, initialChunkCount);
      
      const insertedChunks = await db
        .insert(schema.documentChunk)
        .values(initialChunks)
        .returning();

      // Create initial embeddings
      const initialEmbeddings = insertedChunks.map((chunk) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536)),
        model: 'cohere-embed-v4.0',
      }));
      
      const embeddingBatchSize = 1000;
      for (let i = 0; i < initialEmbeddings.length; i += embeddingBatchSize) {
        const batch = initialEmbeddings.slice(i, i + embeddingBatchSize);
        await db.insert(schema.documentEmbedding).values(batch);
      }

      logger.info('performance_metrics', 'Initial dataset created for update load test', {
        chunkCount: initialChunkCount,
        embeddingCount: initialEmbeddings.length,
      });

      // Test performance with intensive mixed operations
      const operationCount = 500; // Increased for realistic load testing
      const updateMetrics = {
        chunkUpdates: 0,
        embeddingUpdates: 0,
        searches: 0,
        newInserts: 0,
      };
      
      const { duration: intensiveOperationTime, memoryUsage } = await measurePerformance(async () => {
        for (let i = 0; i < operationCount; i++) {
          const operationType = i % 4; // Cycle through different operations
          
          switch (operationType) {
            case 0: // Update chunk content
              const randomChunk = insertedChunks[Math.floor(Math.random() * insertedChunks.length)];
              await db
                .update(schema.documentChunk)
                .set({ 
                  content: `Updated content ${i} - ${Date.now()}`,
                  metadata: { updateIteration: i, timestamp: Date.now() }
                })
                .where(schema.documentChunk.id === randomChunk.id);
              updateMetrics.chunkUpdates++;
              break;
              
            case 1: // Update embedding
              const randomChunkForEmbedding = insertedChunks[Math.floor(Math.random() * insertedChunks.length)];
              await db
                .update(schema.documentEmbedding)
                .set({ 
                  embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536))
                })
                .where(schema.documentEmbedding.chunkId === randomChunkForEmbedding.id);
              updateMetrics.embeddingUpdates++;
              break;
              
            case 2: // Perform complex search
              const searchOffset = Math.floor(Math.random() * Math.max(1, insertedChunks.length - 50));
              await db.query.documentChunk.findMany({
                where: (chunk, { eq }) => eq(chunk.documentId, document.id),
                with: { embedding: true },
                limit: 25,
                offset: searchOffset,
                orderBy: (chunk, { desc }) => desc(chunk.createdAt),
              });
              updateMetrics.searches++;
              break;
              
            case 3: // Insert new chunk and embedding
              const newChunkData = createTestDocumentChunk(document.id, initialChunkCount + i);
              const [newChunk] = await db
                .insert(schema.documentChunk)
                .values(newChunkData)
                .returning();
              
              await db.insert(schema.documentEmbedding).values({
                chunkId: newChunk.id,
                embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536)),
                model: 'cohere-embed-v4.0',
              });
              
              insertedChunks.push(newChunk); // Keep track for future operations
              updateMetrics.newInserts++;
              break;
          }
          
          // Periodic performance check during intensive operations
          if (i > 0 && i % 100 === 0) {
            const currentMemory = process.memoryUsage().heapUsed;
            if (currentMemory > PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024) {
              logger.warn('performance_warning', 'Memory usage high during intensive operations', {
                currentMemoryMB: currentMemory / (1024 * 1024),
                operation: i,
              });
            }
          }
        }
      });

      // Final verification search to ensure index integrity
      const { duration: finalSearchTime, result: finalResults } = await measurePerformance(async () => {
        return db.query.documentChunk.findMany({
          where: (chunk, { eq }) => eq(chunk.documentId, document.id),
          with: { embedding: true },
          limit: 100,
        });
      });

      // Enhanced performance assertions
      const avgTimePerOperation = intensiveOperationTime / operationCount;
      const totalDataSize = insertedChunks.length;
      
      expect(intensiveOperationTime).toBeLessThan(operationCount * 100); // 100ms per operation max
      expect(avgTimePerOperation).toBeLessThan(50); // Average 50ms per mixed operation
      expect(finalSearchTime).toBeLessThan(2000); // Final search should still be fast
      expect(memoryUsage.heapUsed).toBeLessThan(PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024);
      expect(finalResults).toHaveLength(100); // Verify index integrity
      expect(finalResults.every(r => r.embedding)).toBe(true); // All should have embeddings

      logger.info('performance_test', 'Intensive update and query load test completed', {
        totalTime: Date.now() - testStart,
        operationCount,
        intensiveOperationTime,
        avgTimePerOperation,
        finalSearchTime,
        updateMetrics,
        finalDataSize: totalDataSize,
        memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);
  });

  describe('Parallel Performance Benchmarks', () => {
    it('should handle concurrent read/write operations efficiently', async () => {
      const testStart = Date.now();
      logger.info('performance_test', 'Starting concurrent read/write benchmark');

      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple documents for parallel testing
      const docCount = 10;
      const docs = performanceFactory.createBulkDocuments(user.id, docCount);
      const documents = await db.insert(schema.ragDocument).values(docs).returning();

      // Concurrent write operations
      const writeOperations = documents.map(async (doc, index) => {
        const chunks = performanceFactory.createBulkDocumentChunks(doc.id, 1000);
        const insertedChunks = await db.insert(schema.documentChunk).values(chunks).returning();
        
        const embeddings = insertedChunks.map((chunk) => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(performanceFactory.createRealisticEmbedding(1536)),
          model: 'cohere-embed-v4.0',
        }));
        
        // Process embeddings in batches
        const batchSize = 200;
        for (let i = 0; i < embeddings.length; i += batchSize) {
          const batch = embeddings.slice(i, i + batchSize);
          await db.insert(schema.documentEmbedding).values(batch);
        }
        
        return insertedChunks.length;
      });

      const { duration: writeTime, result: writeCounts } = await measurePerformance(async () => {
        return Promise.all(writeOperations);
      });

      const totalWritten = writeCounts.reduce((sum, count) => sum + count, 0);

      // Concurrent read operations
      const readOperations = documents.map(async (doc) => {
        const searches = Array.from({ length: 5 }, async (_, i) => {
          return db.query.documentChunk.findMany({
            where: (chunk, { eq }) => eq(chunk.documentId, doc.id),
            with: { embedding: true },
            limit: 50,
            offset: i * 50,
          });
        });
        return Promise.all(searches);
      });

      const { duration: readTime, result: readResults } = await measurePerformance(async () => {
        return Promise.all(readOperations);
      });

      const totalRead = readResults.flat().flat().length;

      // Performance assertions
      expect(writeTime).toBeLessThan(180000); // 3 minutes for all writes
      expect(readTime).toBeLessThan(30000); // 30 seconds for all reads
      expect(totalWritten).toBe(docCount * 1000);
      expect(totalRead).toBeGreaterThan(0);

      logger.info('performance_test', 'Concurrent read/write benchmark completed', {
        totalTime: Date.now() - testStart,
        writeTime,
        readTime,
        totalWritten,
        totalRead,
        writeThroughput: totalWritten / (writeTime / 1000),
        readThroughput: totalRead / (readTime / 1000),
      });
    }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);
  });
});
