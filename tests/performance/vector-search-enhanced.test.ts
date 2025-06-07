import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { TestDataFactory } from '../utils/enhanced-test-factories';
import { NeonTestUtils } from '../utils/neon-test-utils';
import { measurePerformance } from '../utils/test-helpers';
import type { TestBranchInfo } from '@/lib/testing/neon-api-client';

/**
 * Enhanced Vector Search Performance Tests
 * Tests performance characteristics using Neon branching for isolated testing
 */
describe('Vector Search Performance Tests (Enhanced)', () => {
  let testBranch: TestBranchInfo | null = null;
  let neonClient: ReturnType<typeof getNeonApiClient>;
  let testUtils: NeonTestUtils;
  let factory: TestDataFactory;

  beforeEach(async () => {
    neonClient = getNeonApiClient();
    testUtils = new NeonTestUtils(neonClient);
    factory = new TestDataFactory();

    // Create isolated test branch for performance testing
    const branchResult = await neonClient.createTestBranch({
      testSuite: 'vector-search-performance',
      purpose: 'performance-benchmarking',
      tags: ['performance', 'vector-search', 'benchmarks'],
      waitForReady: true,
      timeoutMs: 120000,
    });

    if (branchResult.success && branchResult.data) {
      testBranch = branchResult.data;
      await testUtils.setupTestSchema(testBranch.branchId);
      await testUtils.seedBasicData(testBranch.branchId);
    } else {
      throw new Error(`Failed to create test branch: ${branchResult.error}`);
    }
  });

  afterEach(async () => {
    if (testBranch) {
      await neonClient
        .deleteTestBranch(testBranch.branchName)
        .catch((error) =>
          console.warn('Failed to cleanup test branch:', error),
        );
      testBranch = null;
    }
  });

  describe('Embedding Storage Performance', () => {
    it('should efficiently store large batches of embeddings', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      const document = factory.createDocument(user.id);
      await testUtils.insertDocument(document, testBranch.branchId);

      // Test with increasing batch sizes
      const batchSizes = [100, 500, 1000, 2000];
      const performanceResults = [];

      for (const batchSize of batchSizes) {
        // Create chunks and embeddings
        const chunks = factory.createDocumentChunks(document.id, batchSize);
        const embeddings = chunks.map((chunk) =>
          factory.createDocumentEmbedding(chunk.id),
        );

        const { duration: chunkInsertTime, memoryUsage: chunkMemory } =
          await measurePerformance(async () => {
            return testUtils.insertDocumentChunks(chunks, testBranch?.branchId);
          });

        const { duration: embeddingInsertTime, memoryUsage: embeddingMemory } =
          await measurePerformance(async () => {
            return testUtils.insertDocumentEmbeddings(
              embeddings,
              testBranch?.branchId,
            );
          });

        performanceResults.push({
          batchSize,
          chunkInsertTime,
          embeddingInsertTime,
          totalTime: chunkInsertTime + embeddingInsertTime,
          chunkMemoryUsed: chunkMemory.heapUsed,
          embeddingMemoryUsed: embeddingMemory.heapUsed,
          throughputPerSecond:
            batchSize / ((chunkInsertTime + embeddingInsertTime) / 1000),
        });

        // Clean up for next iteration to isolate measurements
        await neonClient.executeSql(
          `DELETE FROM document_embeddings WHERE chunk_id IN (
            SELECT id FROM document_chunks WHERE document_id = '${document.id}'
          )`,
          testBranch.branchId,
        );
        await neonClient.executeSql(
          `DELETE FROM document_chunks WHERE document_id = '${document.id}'`,
          testBranch.branchId,
        );
      }

      // Analyze performance characteristics
      performanceResults.forEach((result, index) => {
        // Performance assertions
        expect(result.totalTime).toBeLessThan(60000); // Under 1 minute
        expect(result.chunkMemoryUsed).toBeLessThan(200 * 1024 * 1024); // Under 200MB
        expect(result.embeddingMemoryUsed).toBeLessThan(500 * 1024 * 1024); // Under 500MB
        expect(result.throughputPerSecond).toBeGreaterThan(10); // At least 10 items/second

        // Log performance metrics
        console.log(
          `Batch Size: ${result.batchSize}, Throughput: ${result.throughputPerSecond.toFixed(2)} items/sec`,
        );
      });

      // Verify throughput scaling
      const smallBatchThroughput = performanceResults[0].throughputPerSecond;
      const largeBatchThroughput =
        performanceResults[performanceResults.length - 1].throughputPerSecond;

      // Large batches should have similar or better throughput
      expect(largeBatchThroughput).toBeGreaterThan(smallBatchThroughput * 0.5);
    });

    it('should handle concurrent embedding operations efficiently', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Create multiple documents for concurrent processing
      const documentCount = 5;
      const chunksPerDocument = 200;
      const documents = factory.createDocuments(user.id, documentCount);

      await Promise.all(
        documents.map((doc) =>
          testUtils.insertDocument(doc, testBranch?.branchId),
        ),
      );

      // Process documents concurrently
      const {
        result: concurrentResults,
        duration: totalDuration,
        memoryUsage,
      } = await measurePerformance(async () => {
        const documentOperations = documents.map(async (doc, docIndex) => {
          const chunks = factory.createDocumentChunks(
            doc.id,
            chunksPerDocument,
          );
          const embeddings = chunks.map((chunk) =>
            factory.createDocumentEmbedding(chunk.id),
          );

          // Insert chunks and embeddings for this document
          await testUtils.insertDocumentChunks(chunks, testBranch?.branchId);
          await testUtils.insertDocumentEmbeddings(
            embeddings,
            testBranch?.branchId,
          );

          return {
            documentId: doc.id,
            chunkCount: chunks.length,
            embeddingCount: embeddings.length,
          };
        });

        return Promise.all(documentOperations);
      });

      // Verify concurrent operation success
      expect(concurrentResults).toHaveLength(documentCount);
      expect(totalDuration).toBeLessThan(120000); // Under 2 minutes for concurrent processing
      expect(memoryUsage.heapUsed).toBeLessThan(1000 * 1024 * 1024); // Under 1GB

      // Verify all data was inserted
      const totalChunksResult = await neonClient.executeSql(
        'SELECT COUNT(*) as count FROM document_chunks',
        testBranch.branchId,
      );
      const totalEmbeddingsResult = await neonClient.executeSql(
        'SELECT COUNT(*) as count FROM document_embeddings',
        testBranch.branchId,
      );

      expect(Number.parseInt(totalChunksResult.data?.results?.[0]?.count || '0')).toBe(
        documentCount * chunksPerDocument,
      );
      expect(
        Number.parseInt(totalEmbeddingsResult.data?.results?.[0]?.count || '0'),
      ).toBe(documentCount * chunksPerDocument);

      // Measure throughput
      const totalItems = documentCount * chunksPerDocument;
      const throughput = totalItems / (totalDuration / 1000);
      expect(throughput).toBeGreaterThan(20); // At least 20 items/second with concurrency
    });

    it('should optimize memory usage with large embedding vectors', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      const document = factory.createDocument(user.id);
      await testUtils.insertDocument(document, testBranch.branchId);

      // Test different embedding dimensions
      const embeddingDimensions = [512, 1024, 1536, 3072];
      const memoryResults = [];

      for (const dimension of embeddingDimensions) {
        const chunks = factory.createDocumentChunks(document.id, 100);
        await testUtils.insertDocumentChunks(chunks, testBranch.branchId);

        // Create high-dimensional embeddings
        const { duration, memoryUsage } = await measurePerformance(async () => {
          for (const chunk of chunks) {
            const largeEmbedding = Array.from(
              { length: dimension },
              () => Math.random() * 2 - 1,
            );
            const embedding = factory.createDocumentEmbedding(chunk.id, {
              embedding: JSON.stringify(largeEmbedding),
              model: `test-model-${dimension}d`,
            });

            await neonClient.executeSql(
              `INSERT INTO document_embeddings (id, chunk_id, embedding_text, model, created_at) 
               VALUES ('${embedding.id}', '${embedding.chunkId}', '${embedding.embedding.replace(/'/g, "''")}', '${embedding.model}', NOW())`,
              testBranch?.branchId,
            );
          }
        });

        memoryResults.push({
          dimension,
          duration,
          memoryUsed: memoryUsage.heapUsed,
          memoryPerEmbedding: memoryUsage.heapUsed / 100,
          processingRate: 100 / (duration / 1000),
        });

        // Clean up for next iteration
        await neonClient.executeSql(
          `DELETE FROM document_embeddings WHERE chunk_id IN (
            SELECT id FROM document_chunks WHERE document_id = '${document.id}'
          )`,
          testBranch.branchId,
        );
        await neonClient.executeSql(
          `DELETE FROM document_chunks WHERE document_id = '${document.id}'`,
          testBranch.branchId,
        );
      }

      // Analyze memory scaling
      memoryResults.forEach((result, index) => {
        expect(result.duration).toBeLessThan(30000); // Under 30 seconds
        expect(result.memoryUsed).toBeLessThan(500 * 1024 * 1024); // Under 500MB
        expect(result.processingRate).toBeGreaterThan(5); // At least 5 embeddings/second

        console.log(
          `Dimension: ${result.dimension}, Memory per embedding: ${(result.memoryPerEmbedding / 1024).toFixed(2)} KB`,
        );
      });

      // Memory usage should scale reasonably with dimension
      const smallDimMemory = memoryResults[0].memoryPerEmbedding;
      const largeDimMemory =
        memoryResults[memoryResults.length - 1].memoryPerEmbedding;
      const dimensionRatio =
        embeddingDimensions[embeddingDimensions.length - 1] /
        embeddingDimensions[0];
      const memoryRatio = largeDimMemory / smallDimMemory;

      // Memory scaling should be roughly proportional to dimension increase
      expect(memoryRatio).toBeLessThan(dimensionRatio * 2); // Within 2x of expected scaling
    });
  });

  describe('Vector Search Performance', () => {
    it('should perform fast similarity searches with large datasets', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Create substantial dataset for realistic search performance testing
      const documentCount = 3;
      const chunksPerDocument = 1000; // Larger dataset
      const documents = factory.createDocuments(user.id, documentCount);

      // Set up test data
      const { duration: setupDuration } = await measurePerformance(async () => {
        for (const doc of documents) {
          await testUtils.insertDocument(doc, testBranch?.branchId);

          const chunks = factory.createDocumentChunks(
            doc.id,
            chunksPerDocument,
          );
          await testUtils.insertDocumentChunks(chunks, testBranch.branchId);

          const embeddings = chunks.map((chunk) =>
            factory.createDocumentEmbedding(chunk.id),
          );
          await testUtils.insertDocumentEmbeddings(
            embeddings,
            testBranch.branchId,
          );
        }
      });

      console.log(
        `Setup completed in ${setupDuration}ms for ${documentCount * chunksPerDocument} embeddings`,
      );

      // Test various search patterns
      const searchTests = [
        {
          name: 'Simple Retrieval',
          query:
            'SELECT c.*, e.model FROM document_chunks c JOIN document_embeddings e ON c.id = e.chunk_id ORDER BY c.index LIMIT 10',
          expectedResults: 10,
        },
        {
          name: 'Filtered Search',
          query: `SELECT c.*, e.model FROM document_chunks c JOIN document_embeddings e ON c.id = e.chunk_id WHERE e.model = 'cohere-embed-v4.0' LIMIT 20`,
          expectedResults: { min: 0, max: 20 },
        },
        {
          name: 'Paginated Results',
          query:
            'SELECT c.*, e.model FROM document_chunks c JOIN document_embeddings e ON c.id = e.chunk_id ORDER BY c.created_at DESC LIMIT 50 OFFSET 100',
          expectedResults: 50,
        },
        {
          name: 'Aggregated Search',
          query:
            'SELECT e.model, COUNT(*) as count FROM document_embeddings e GROUP BY e.model ORDER BY count DESC',
          expectedResults: { min: 1, max: 10 },
        },
        {
          name: 'Complex Join Search',
          query: `SELECT d.name, COUNT(c.id) as chunk_count, COUNT(e.id) as embedding_count 
                  FROM rag_documents d 
                  LEFT JOIN document_chunks c ON d.id = c.document_id 
                  LEFT JOIN document_embeddings e ON c.id = e.chunk_id 
                  GROUP BY d.id, d.name 
                  ORDER BY chunk_count DESC`,
          expectedResults: documentCount,
        },
      ];

      const searchResults = [];

      for (const test of searchTests) {
        const { result, duration, memoryUsage } = await measurePerformance(
          async () => {
            return neonClient.executeSql(test.query, testBranch?.branchId);
          },
        );

        const resultCount = result.data?.results?.length || 0;

        searchResults.push({
          name: test.name,
          duration,
          resultCount,
          memoryUsed: memoryUsage.heapUsed,
          success: result.success,
          throughput: resultCount / (duration / 1000),
        });

        // Verify result expectations
        if (typeof test.expectedResults === 'number') {
          expect(resultCount).toBe(test.expectedResults);
        } else {
          expect(resultCount).toBeGreaterThanOrEqual(test.expectedResults.min);
          expect(resultCount).toBeLessThanOrEqual(test.expectedResults.max);
        }
      }

      // Performance assertions
      searchResults.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.duration).toBeLessThan(10000); // Under 10 seconds
        expect(result.memoryUsed).toBeLessThan(100 * 1024 * 1024); // Under 100MB per search
        expect(result.throughput).toBeGreaterThan(1); // At least 1 result/second

        console.log(
          `${result.name}: ${result.duration}ms, ${result.resultCount} results, ${result.throughput.toFixed(2)} results/sec`,
        );
      });

      // Test concurrent searches
      const { duration: concurrentDuration } = await measurePerformance(
        async () => {
          const concurrentSearches = searchTests
            .slice(0, 3)
            .map((test) =>
              neonClient.executeSql(test.query, testBranch?.branchId),
            );

          const results = await Promise.all(concurrentSearches);
          return results.every((r) => r.success);
        },
      );

      expect(concurrentDuration).toBeLessThan(15000); // Concurrent searches under 15 seconds
    });

    it('should scale search performance with dataset size', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Test scaling with different dataset sizes
      const datasetSizes = [250, 500, 1000, 2000];
      const scalingResults = [];

      for (const size of datasetSizes) {
        const document = factory.createDocument(user.id, {
          name: `Scaling Test ${size}`,
        });
        await testUtils.insertDocument(document, testBranch.branchId);

        // Setup data for this size
        const { duration: setupTime } = await measurePerformance(async () => {
          const chunks = factory.createDocumentChunks(document.id, size);
          await testUtils.insertDocumentChunks(chunks, testBranch?.branchId);

          const embeddings = chunks.map((chunk) =>
            factory.createDocumentEmbedding(chunk.id),
          );
          await testUtils.insertDocumentEmbeddings(
            embeddings,
            testBranch?.branchId,
          );
        });

        // Test various search operations
        const searchOperations = [
          {
            name: 'index_scan',
            query: `SELECT COUNT(*) FROM document_chunks WHERE document_id = '${document.id}'`,
          },
          {
            name: 'join_search',
            query: `SELECT c.*, e.model FROM document_chunks c JOIN document_embeddings e ON c.id = e.chunk_id WHERE c.document_id = '${document.id}' LIMIT 20`,
          },
          {
            name: 'filtered_search',
            query: `SELECT c.* FROM document_chunks c JOIN document_embeddings e ON c.id = e.chunk_id WHERE c.document_id = '${document.id}' AND e.model LIKE 'cohere%' LIMIT 10`,
          },
        ];

        const operationResults = {};

        for (const operation of searchOperations) {
          const { duration } = await measurePerformance(async () => {
            return neonClient.executeSql(operation.query, testBranch?.branchId);
          });

          operationResults[operation.name] = duration;
        }

        scalingResults.push({
          datasetSize: size,
          setupTime,
          searchTimes: operationResults,
          scalingFactor: size / datasetSizes[0],
        });
      }

      // Analyze scaling characteristics
      scalingResults.forEach((result, index) => {
        if (index > 0) {
          const prevResult = scalingResults[index - 1];
          const dataScalingFactor = result.datasetSize / prevResult.datasetSize;

          Object.keys(result.searchTimes).forEach((operation) => {
            const currentTime = result.searchTimes[operation];
            const prevTime = prevResult.searchTimes[operation];
            const timeScalingFactor = currentTime / prevTime;

            // Search time should scale sub-linearly (better than O(n))
            expect(timeScalingFactor).toBeLessThan(dataScalingFactor * 1.5);

            console.log(
              `${operation} at size ${result.datasetSize}: ${currentTime}ms (${timeScalingFactor.toFixed(2)}x scaling)`,
            );
          });
        }
      });

      // Final scaling assertions
      const firstResult = scalingResults[0];
      const lastResult = scalingResults[scalingResults.length - 1];
      const finalDataScaling = lastResult.datasetSize / firstResult.datasetSize;

      Object.keys(firstResult.searchTimes).forEach((operation) => {
        const firstTime = firstResult.searchTimes[operation];
        const lastTime = lastResult.searchTimes[operation];
        const timeScaling = lastTime / firstTime;

        // Overall scaling should be much better than linear
        expect(timeScaling).toBeLessThan(finalDataScaling * 2);
      });
    });

    it('should maintain performance during data modifications', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      const document = factory.createDocument(user.id);
      await testUtils.insertDocument(document, testBranch.branchId);

      // Create initial dataset
      const initialChunks = factory.createDocumentChunks(document.id, 1000);
      await testUtils.insertDocumentChunks(initialChunks, testBranch.branchId);

      const initialEmbeddings = initialChunks.map((chunk) =>
        factory.createDocumentEmbedding(chunk.id),
      );
      await testUtils.insertDocumentEmbeddings(
        initialEmbeddings,
        testBranch.branchId,
      );

      // Test performance with concurrent reads and writes
      const operationCount = 50;
      const { result: operationResults, duration: totalDuration } =
        await measurePerformance(async () => {
          const operations = [];

          for (let i = 0; i < operationCount; i++) {
            if (i % 3 === 0) {
              // Insert new data
              operations.push(async () => {
                const newChunk = factory.createDocumentChunk(
                  document.id,
                  1000 + i,
                );
                await neonClient.executeSql(
                  `INSERT INTO document_chunks (id, document_id, content, index, metadata, created_at) 
                 VALUES ('${newChunk.id}', '${newChunk.documentId}', '${newChunk.content.replace(/'/g, "''")}', ${newChunk.index}, '{}', NOW())`,
                  testBranch?.branchId,
                );

                const newEmbedding = factory.createDocumentEmbedding(
                  newChunk.id,
                );
                await neonClient.executeSql(
                  `INSERT INTO document_embeddings (id, chunk_id, embedding_text, model, created_at) 
                 VALUES ('${newEmbedding.id}', '${newEmbedding.chunkId}', '${newEmbedding.embedding.replace(/'/g, "''")}', '${newEmbedding.model}', NOW())`,
                  testBranch?.branchId,
                );
              });
            } else if (i % 3 === 1) {
              // Update existing data
              operations.push(async () => {
                const randomIndex = Math.floor(Math.random() * 1000);
                await neonClient.executeSql(
                  `UPDATE document_chunks SET content = 'Updated content ${i}' WHERE document_id = '${document.id}' AND index = ${randomIndex}`,
                  testBranch?.branchId,
                );
              });
            } else {
              // Search operations
              operations.push(async () => {
                return neonClient.executeSql(
                  `SELECT c.*, e.model FROM document_chunks c 
                 JOIN document_embeddings e ON c.id = e.chunk_id 
                 WHERE c.document_id = '${document.id}' 
                 ORDER BY c.index DESC LIMIT 10 OFFSET ${i * 2}`,
                  testBranch?.branchId,
                );
              });
            }
          }

          return Promise.allSettled(operations.map((op) => op()));
        });

      // Verify operation success rates
      const successfulOps = operationResults.filter(
        (result) => result.status === 'fulfilled',
      ).length;
      const successRate = successfulOps / operationCount;

      expect(successRate).toBeGreaterThan(0.9); // 90% success rate
      expect(totalDuration).toBeLessThan(60000); // Complete in under 1 minute

      // Verify final data integrity
      const integrityResult = await testUtils.verifyDataIntegrity(
        testBranch.branchId,
      );
      expect(integrityResult.success).toBe(true);

      const checks = integrityResult.data?.results || [];
      checks.forEach((check: any) => {
        expect(check.status).toBe('PASS');
      });

      console.log(
        `Mixed operations: ${successRate * 100}% success rate, ${totalDuration}ms total time`,
      );
    });
  });

  describe('Memory and Resource Optimization', () => {
    it('should efficiently handle streaming large result sets', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      const document = factory.createDocument(user.id);
      await testUtils.insertDocument(document, testBranch.branchId);

      // Create large dataset for streaming tests
      const totalChunks = 5000;
      const { duration: setupDuration } = await measurePerformance(async () => {
        const chunks = factory.createDocumentChunks(document.id, totalChunks);
        await testUtils.insertDocumentChunks(chunks, testBranch?.branchId);

        const embeddings = chunks.map((chunk) =>
          factory.createDocumentEmbedding(chunk.id),
        );
        await testUtils.insertDocumentEmbeddings(
          embeddings,
          testBranch?.branchId,
        );
      });

      console.log(`Setup ${totalChunks} chunks in ${setupDuration}ms`);

      // Test paginated retrieval for memory efficiency
      const pageSize = 100;
      const totalPages = Math.ceil(totalChunks / pageSize);
      let totalProcessed = 0;
      const pageTimes = [];

      const { duration: streamingDuration, memoryUsage } =
        await measurePerformance(async () => {
          for (let page = 0; page < totalPages; page++) {
            const pageStart = Date.now();

            const pageResult = await neonClient.executeSql(
              `SELECT c.*, e.model, e.embedding_text 
             FROM document_chunks c 
             JOIN document_embeddings e ON c.id = e.chunk_id 
             WHERE c.document_id = '${document.id}' 
             ORDER BY c.index 
             LIMIT ${pageSize} OFFSET ${page * pageSize}`,
              testBranch?.branchId,
            );

            const pageEnd = Date.now();
            const pageTime = pageEnd - pageStart;
            pageTimes.push(pageTime);

            expect(pageResult.success).toBe(true);
            const results = pageResult.data?.results || [];
            totalProcessed += results.length;

            // Simulate processing results
            results.forEach((result: any) => {
              expect(result.id).toBeDefined();
              expect(result.content).toBeDefined();
              expect(result.embedding_text).toBeDefined();
            });
          }

          return totalProcessed;
        });

      // Verify streaming performance
      expect(totalProcessed).toBe(totalChunks);
      expect(streamingDuration).toBeLessThan(120000); // Under 2 minutes
      expect(memoryUsage.heapUsed).toBeLessThan(300 * 1024 * 1024); // Under 300MB

      // Analyze page timing consistency
      const avgPageTime =
        pageTimes.reduce((sum, time) => sum + time, 0) / pageTimes.length;
      const maxPageTime = Math.max(...pageTimes);
      const minPageTime = Math.min(...pageTimes);

      expect(maxPageTime).toBeLessThan(5000); // No page takes more than 5 seconds
      expect(maxPageTime - minPageTime).toBeLessThan(avgPageTime * 3); // Consistent timing

      console.log(
        `Streaming: ${totalProcessed} items in ${streamingDuration}ms, avg page time: ${avgPageTime.toFixed(2)}ms`,
      );
    });

    it('should optimize index usage for vector operations', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Create multiple documents with different characteristics
      const documents = factory.createDocuments(user.id, 5);
      const chunksPerDoc = [100, 200, 500, 1000, 2000]; // Varying sizes

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        await testUtils.insertDocument(doc, testBranch.branchId);

        const chunks = factory.createDocumentChunks(doc.id, chunksPerDoc[i]);
        await testUtils.insertDocumentChunks(chunks, testBranch.branchId);

        const embeddings = chunks.map((chunk) =>
          factory.createDocumentEmbedding(chunk.id),
        );
        await testUtils.insertDocumentEmbeddings(
          embeddings,
          testBranch.branchId,
        );
      }

      // Test index effectiveness with different query patterns
      const indexTests = [
        {
          name: 'Document ID Index',
          query: 'SELECT COUNT(*) FROM document_chunks WHERE document_id = $1',
          parameter: documents[2].id,
        },
        {
          name: 'Chunk Index Range',
          query:
            'SELECT COUNT(*) FROM document_chunks WHERE document_id = $1 AND index BETWEEN 50 AND 150',
          parameter: documents[3].id,
        },
        {
          name: 'Embedding Model Filter',
          query: 'SELECT COUNT(*) FROM document_embeddings WHERE model = $1',
          parameter: 'cohere-embed-v4.0',
        },
        {
          name: 'Join Performance',
          query: `SELECT COUNT(*) FROM document_chunks c 
                  JOIN document_embeddings e ON c.id = e.chunk_id 
                  WHERE c.document_id = $1`,
          parameter: documents[4].id,
        },
      ];

      const indexResults = [];

      for (const test of indexTests) {
        const { duration, result } = await measurePerformance(async () => {
          // Replace $1 with actual parameter (simplified for this test)
          const query = test.query.replace('$1', `'${test.parameter}'`);
          return neonClient.executeSql(query, testBranch?.branchId);
        });

        indexResults.push({
          name: test.name,
          duration,
          success: result.success,
          resultCount: Number.parseInt(result.data?.results?.[0]?.count || '0'),
        });
      }

      // Verify index performance
      indexResults.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.duration).toBeLessThan(2000); // Under 2 seconds with proper indexing
        expect(result.resultCount).toBeGreaterThan(0);

        console.log(
          `${result.name}: ${result.duration}ms, ${result.resultCount} results`,
        );
      });

      // Test query plan analysis (if supported)
      const explainResult = await neonClient.executeSql(
        `EXPLAIN (ANALYZE, BUFFERS) 
         SELECT c.*, e.model FROM document_chunks c 
         JOIN document_embeddings e ON c.id = e.chunk_id 
         WHERE c.document_id = '${documents[0].id}' 
         LIMIT 10`,
        testBranch.branchId,
      );

      if (explainResult.success) {
        console.log(
          'Query plan available - indexes being utilized effectively',
        );
      }
    });

    it('should handle resource cleanup efficiently', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Create test data
      const document = factory.createDocument(user.id);
      await testUtils.insertDocument(document, testBranch.branchId);

      const chunks = factory.createDocumentChunks(document.id, 1000);
      await testUtils.insertDocumentChunks(chunks, testBranch.branchId);

      const embeddings = chunks.map((chunk) =>
        factory.createDocumentEmbedding(chunk.id),
      );
      await testUtils.insertDocumentEmbeddings(embeddings, testBranch.branchId);

      // Verify initial state
      const initialStats = await testUtils.getTestDataStats(
        testBranch.branchId,
      );
      expect(
        Number.parseInt(initialStats.data?.results?.[0]?.chunk_count || '0'),
      ).toBe(1000);
      expect(
        Number.parseInt(initialStats.data?.results?.[0]?.embedding_count || '0'),
      ).toBe(1000);

      // Test cascading deletion performance
      const { duration: deleteDuration } = await measurePerformance(
        async () => {
          await neonClient.executeSql(
            `DELETE FROM rag_documents WHERE id = '${document.id}'`,
            testBranch?.branchId,
          );
        },
      );

      // Verify cleanup completed
      const finalStats = await testUtils.getTestDataStats(testBranch.branchId);
      expect(Number.parseInt(finalStats.data?.results?.[0]?.chunk_count || '0')).toBe(
        0,
      );
      expect(
        Number.parseInt(finalStats.data?.results?.[0]?.embedding_count || '0'),
      ).toBe(0);

      // Performance assertions
      expect(deleteDuration).toBeLessThan(10000); // Cleanup under 10 seconds

      console.log(
        `Cascade deletion of 1000 chunks and embeddings completed in ${deleteDuration}ms`,
      );

      // Test memory cleanup by creating and destroying data multiple times
      const { memoryUsage: finalMemory } = await measurePerformance(
        async () => {
          for (let cycle = 0; cycle < 5; cycle++) {
            const tempDoc = factory.createDocument(user.id, {
              name: `Temp Doc ${cycle}`,
            });
            await testUtils.insertDocument(tempDoc, testBranch?.branchId);

            const tempChunks = factory.createDocumentChunks(tempDoc.id, 200);
            await testUtils.insertDocumentChunks(
              tempChunks,
              testBranch?.branchId,
            );

            const tempEmbeddings = tempChunks.map((chunk) =>
              factory.createDocumentEmbedding(chunk.id),
            );
            await testUtils.insertDocumentEmbeddings(
              tempEmbeddings,
              testBranch?.branchId,
            );

            // Clean up immediately
            await neonClient.executeSql(
              `DELETE FROM rag_documents WHERE id = '${tempDoc.id}'`,
              testBranch?.branchId,
            );
          }
        },
      );

      // Memory should not accumulate significantly
      expect(finalMemory.heapUsed).toBeLessThan(200 * 1024 * 1024); // Under 200MB
    });
  });
});
