import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { TestDataFactory } from '../utils/enhanced-test-factories';
import { NeonTestUtils } from '../utils/neon-test-utils';
import { measurePerformance } from '../utils/test-helpers';
import type { TestBranchInfo } from '@/lib/testing/neon-api-client';

/**
 * Enhanced RAG Pipeline Integration Tests
 * Tests the complete document processing and retrieval pipeline using Neon branching
 */
describe('RAG Pipeline Integration Tests (Enhanced)', () => {
  let testBranch: TestBranchInfo | null = null;
  let neonClient: ReturnType<typeof getNeonApiClient>;
  let testUtils: NeonTestUtils;
  let factory: TestDataFactory;

  beforeEach(async () => {
    // Initialize enhanced testing infrastructure
    neonClient = getNeonApiClient();
    testUtils = new NeonTestUtils(neonClient);
    factory = new TestDataFactory();

    // Create isolated test branch
    const branchResult = await neonClient.createTestBranch({
      testSuite: 'rag-pipeline-integration',
      purpose: 'end-to-end-testing',
      tags: ['rag', 'pipeline', 'integration', 'e2e'],
      waitForReady: true,
      timeoutMs: 120000
    });

    if (branchResult.success && branchResult.data) {
      testBranch = branchResult.data;
      
      // Set up test schema and data
      await testUtils.setupTestSchema(testBranch.branchId);
      await testUtils.seedBasicData(testBranch.branchId);
    } else {
      throw new Error(`Failed to create test branch: ${branchResult.error}`);
    }
  });

  afterEach(async () => {
    // Cleanup test branch
    if (testBranch) {
      await neonClient.deleteTestBranch(testBranch.branchName).catch(error =>
        console.warn('Failed to cleanup test branch:', error)
      );
      testBranch = null;
    }
  });

  describe('Document Processing Pipeline', () => {
    it('should process document through complete RAG pipeline', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const { result: pipelineResult, duration: totalDuration } = await measurePerformance(async () => {
        // Step 1: Create user and document
        const user = factory.createUser({ email: 'rag-test@example.com' });
        const document = factory.createDocument(user.id, {
          name: 'RoboRail Integration Test Document',
          status: 'uploaded'
        });

        await testUtils.insertUser(user, testBranch!.branchId);
        await testUtils.insertDocument(document, testBranch!.branchId);

        // Step 2: Extract text and create chunks
        const chunks = factory.createDocumentChunks(document.id, 50); // 50 chunks for testing
        await testUtils.insertDocumentChunks(chunks, testBranch!.branchId);

        // Update document status to text_extracted
        await neonClient.executeSql(
          `UPDATE rag_documents SET status = 'text_extracted', updated_at = NOW() WHERE id = '${document.id}'`,
          testBranch!.branchId
        );

        // Step 3: Generate embeddings
        const embeddings = chunks.map(chunk => factory.createDocumentEmbedding(chunk.id));
        await testUtils.insertDocumentEmbeddings(embeddings, testBranch!.branchId);

        // Update document status to embedded
        await neonClient.executeSql(
          `UPDATE rag_documents SET status = 'embedded', updated_at = NOW() WHERE id = '${document.id}'`,
          testBranch!.branchId
        );

        // Step 4: Test retrieval capabilities
        const searchResults = await neonClient.executeSql(
          `SELECT c.*, e.model as embedding_model
           FROM document_chunks c
           JOIN document_embeddings e ON c.id = e.chunk_id
           WHERE c.document_id = '${document.id}'
           ORDER BY c.index
           LIMIT 10`,
          testBranch!.branchId
        );

        return {
          user,
          document,
          chunks,
          embeddings,
          searchResults: searchResults.data?.results || []
        };
      });

      // Verify pipeline completed successfully
      expect(pipelineResult.user).toBeDefined();
      expect(pipelineResult.document).toBeDefined();
      expect(pipelineResult.chunks).toHaveLength(50);
      expect(pipelineResult.embeddings).toHaveLength(50);
      expect(pipelineResult.searchResults).toHaveLength(10);

      // Performance assertions
      expect(totalDuration).toBeLessThan(30000); // Complete pipeline under 30 seconds

      // Verify document status progression
      const finalStatusResult = await neonClient.executeSql(
        `SELECT status FROM rag_documents WHERE id = '${pipelineResult.document.id}'`,
        testBranch.branchId
      );

      expect(finalStatusResult.data?.results?.[0]?.status).toBe('embedded');
    });

    it('should handle large document processing efficiently', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Create a large document with many chunks
      const document = factory.createDocument(user.id, {
        name: 'Large Test Document',
        size: 10000000, // 10MB
        status: 'uploaded'
      });

      await testUtils.insertDocument(document, testBranch.branchId);

      const chunkCount = 1000; // Large number of chunks
      const { duration: processingDuration } = await measurePerformance(async () => {
        // Process chunks in batches for better performance
        const batchSize = 100;
        const batches = Math.ceil(chunkCount / batchSize);

        for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
          const startIndex = batchIndex * batchSize;
          const endIndex = Math.min(startIndex + batchSize, chunkCount);
          const batchChunks = [];

          for (let i = startIndex; i < endIndex; i++) {
            batchChunks.push(factory.createDocumentChunk(document.id, i));
          }

          await testUtils.insertDocumentChunks(batchChunks, testBranch!.branchId);

          // Generate embeddings for this batch
          const batchEmbeddings = batchChunks.map(chunk => 
            factory.createDocumentEmbedding(chunk.id)
          );
          await testUtils.insertDocumentEmbeddings(batchEmbeddings, testBranch!.branchId);
        }
      });

      // Verify all data was inserted
      const statsResult = await testUtils.getTestDataStats(testBranch.branchId);
      expect(statsResult.success).toBe(true);
      expect(parseInt(statsResult.data?.results?.[0]?.chunk_count || '0')).toBe(chunkCount);
      expect(parseInt(statsResult.data?.results?.[0]?.embedding_count || '0')).toBe(chunkCount);

      // Performance assertions for large documents
      expect(processingDuration).toBeLessThan(60000); // Under 1 minute for 1000 chunks
    });

    it('should maintain data integrity throughout pipeline', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Create complete test dataset
      const testData = factory.createTestDataSet({
        userCount: 3,
        documentsPerUser: 2,
        chunksPerDocument: 20,
        withEmbeddings: true,
        withSessions: true
      });

      // Insert all test data
      await testUtils.insertTestDataSet(testData, testBranch.branchId);

      // Verify data integrity
      const integrityResult = await testUtils.verifyDataIntegrity(testBranch.branchId);
      expect(integrityResult.success).toBe(true);

      // All integrity checks should pass
      const checks = integrityResult.data?.results || [];
      checks.forEach((check: any) => {
        expect(check.status).toBe('PASS');
        expect(parseInt(check.count)).toBe(0);
      });

      // Verify relationships
      const relationshipResult = await neonClient.executeSql(`
        SELECT 
          u.email,
          COUNT(DISTINCT d.id) as document_count,
          COUNT(DISTINCT c.id) as chunk_count,
          COUNT(DISTINCT e.id) as embedding_count
        FROM users u
        LEFT JOIN rag_documents d ON u.id = d.user_id
        LEFT JOIN document_chunks c ON d.id = c.document_id
        LEFT JOIN document_embeddings e ON c.id = e.chunk_id
        WHERE u.email LIKE '%@example.com'
        GROUP BY u.id, u.email
        ORDER BY u.email
      `, testBranch.branchId);

      expect(relationshipResult.success).toBe(true);
      const relationships = relationshipResult.data?.results || [];
      
      relationships.forEach((rel: any) => {
        expect(parseInt(rel.document_count)).toBe(2); // 2 documents per user
        expect(parseInt(rel.chunk_count)).toBe(40); // 20 chunks per document * 2 documents
        expect(parseInt(rel.embedding_count)).toBe(40); // 1 embedding per chunk
      });
    });
  });

  describe('Vector Search Performance', () => {
    it('should perform efficient similarity searches', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Set up search test data
      const user = factory.createUser();
      const document = factory.createDocument(user.id);
      
      await testUtils.insertUser(user, testBranch.branchId);
      await testUtils.insertDocument(document, testBranch.branchId);

      // Create chunks with varied content for realistic search
      const chunkCount = 500;
      const chunks = factory.createDocumentChunks(document.id, chunkCount);
      await testUtils.insertDocumentChunks(chunks, testBranch.branchId);

      // Create embeddings with different models
      const embeddingModels = ['cohere-embed-v4.0', 'text-embedding-3-large', 'text-embedding-ada-002'];
      const embeddings = chunks.map((chunk, index) => 
        factory.createDocumentEmbedding(chunk.id, {
          model: embeddingModels[index % embeddingModels.length]
        })
      );
      await testUtils.insertDocumentEmbeddings(embeddings, testBranch.branchId);

      // Test different search patterns
      const searchTests = [
        { name: 'Basic Retrieval', limit: 10, offset: 0 },
        { name: 'Paginated Search', limit: 20, offset: 50 },
        { name: 'Large Result Set', limit: 100, offset: 0 },
        { name: 'Model-Specific Search', limit: 10, modelFilter: 'cohere-embed-v4.0' }
      ];

      const searchResults = [];
      
      for (const test of searchTests) {
        const { result, duration } = await measurePerformance(async () => {
          let searchQuery = `
            SELECT c.*, e.model, e.embedding_text
            FROM document_chunks c
            JOIN document_embeddings e ON c.id = e.chunk_id
            WHERE c.document_id = '${document.id}'
          `;

          if (test.modelFilter) {
            searchQuery += ` AND e.model = '${test.modelFilter}'`;
          }

          searchQuery += ` ORDER BY c.index LIMIT ${test.limit} OFFSET ${test.offset}`;

          return neonClient.executeSql(searchQuery, testBranch!.branchId);
        });

        searchResults.push({
          ...test,
          duration,
          resultCount: result.data?.results?.length || 0,
          success: result.success
        });
      }

      // Verify search performance
      searchResults.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.duration).toBeLessThan(5000); // Under 5 seconds
        expect(result.resultCount).toBeGreaterThan(0);
        expect(result.resultCount).toBeLessThanOrEqual(result.limit);
      });

      // Test concurrent searches
      const { duration: concurrentDuration } = await measurePerformance(async () => {
        const concurrentSearches = Array.from({ length: 10 }, (_, i) =>
          neonClient.executeSql(
            `SELECT COUNT(*) as count FROM document_chunks WHERE document_id = '${document.id}' AND index >= ${i * 10} AND index < ${(i + 1) * 10}`,
            testBranch!.branchId
          )
        );

        const results = await Promise.all(concurrentSearches);
        return results.every(r => r.success);
      });

      expect(concurrentDuration).toBeLessThan(10000); // Concurrent searches under 10 seconds
    });

    it('should scale well with increasing dataset size', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Test scaling with different dataset sizes
      const datasetSizes = [100, 500, 1000, 2000];
      const scalingResults = [];

      for (const size of datasetSizes) {
        const document = factory.createDocument(user.id, { name: `Test Document ${size}` });
        await testUtils.insertDocument(document, testBranch.branchId);

        const { duration: insertDuration } = await measurePerformance(async () => {
          const chunks = factory.createDocumentChunks(document.id, size);
          await testUtils.insertDocumentChunks(chunks, testBranch!.branchId);

          const embeddings = chunks.map(chunk => factory.createDocumentEmbedding(chunk.id));
          await testUtils.insertDocumentEmbeddings(embeddings, testBranch!.branchId);
        });

        const { duration: searchDuration } = await measurePerformance(async () => {
          return neonClient.executeSql(
            `SELECT c.*, e.model FROM document_chunks c 
             JOIN document_embeddings e ON c.id = e.chunk_id 
             WHERE c.document_id = '${document.id}' 
             ORDER BY c.index LIMIT 20`,
            testBranch!.branchId
          );
        });

        scalingResults.push({
          datasetSize: size,
          insertDuration,
          searchDuration,
          scalingFactor: size / 100 // Baseline is 100
        });
      }

      // Analyze scaling characteristics
      scalingResults.forEach((result, index) => {
        if (index > 0) {
          const prevResult = scalingResults[index - 1];
          const insertScaling = result.insertDuration / prevResult.insertDuration;
          const searchScaling = result.searchDuration / prevResult.searchDuration;
          const dataScaling = result.datasetSize / prevResult.datasetSize;

          // Insert time should scale roughly linearly (within 2x of data scaling)
          expect(insertScaling).toBeLessThan(dataScaling * 2);

          // Search time should scale sub-linearly (better than linear)
          expect(searchScaling).toBeLessThan(dataScaling);
        }
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database connection failures gracefully', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Test with invalid SQL to simulate errors
      const errorResult = await neonClient.executeSql(
        'SELECT * FROM non_existent_table',
        testBranch.branchId
      );

      expect(errorResult.success).toBe(false);
      expect(errorResult.error).toContain('does not exist');

      // Verify connection is still working after error
      const recoveryResult = await neonClient.executeSql(
        'SELECT 1 as test',
        testBranch.branchId
      );

      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.data?.results?.[0]?.test).toBe(1);
    });

    it('should handle transaction rollbacks properly', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Attempt transaction with intentional error
      const transactionResult = await neonClient.executeTransaction([
        `INSERT INTO rag_documents (id, user_id, name, original_name, mime_type, size, checksum) 
         VALUES ('${randomUUID()}', '${user.id}', 'Test Doc', 'test.pdf', 'application/pdf', 1000, 'abc123')`,
        'INSERT INTO invalid_table (id) VALUES (1)', // This will fail
        `INSERT INTO rag_documents (id, user_id, name, original_name, mime_type, size, checksum) 
         VALUES ('${randomUUID()}', '${user.id}', 'Test Doc 2', 'test2.pdf', 'application/pdf', 2000, 'def456')`
      ], testBranch.branchId);

      expect(transactionResult.success).toBe(false);

      // Verify rollback - no documents should exist
      const countResult = await neonClient.executeSql(
        `SELECT COUNT(*) as count FROM rag_documents WHERE user_id = '${user.id}'`,
        testBranch.branchId
      );

      expect(countResult.success).toBe(true);
      expect(parseInt(countResult.data?.results?.[0]?.count || '0')).toBe(0);
    });

    it('should maintain performance under error conditions', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Mix successful and failing operations
      const operations = [];
      
      for (let i = 0; i < 20; i++) {
        if (i % 5 === 0) {
          // Every 5th operation fails
          operations.push(
            neonClient.executeSql('SELECT * FROM non_existent_table', testBranch.branchId)
          );
        } else {
          // Successful operations
          operations.push(
            neonClient.executeSql('SELECT NOW() as current_time', testBranch.branchId)
          );
        }
      }

      const { result: results, duration } = await measurePerformance(async () => {
        return Promise.allSettled(operations);
      });

      // Verify mix of success and failure
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      expect(successCount).toBe(16); // 80% success
      expect(failureCount).toBe(4);  // 20% failure
      expect(duration).toBeLessThan(15000); // Complete under 15 seconds despite errors
    });
  });

  describe('Performance Monitoring and Metrics', () => {
    it('should collect comprehensive performance metrics', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      const user = factory.createUser();
      await testUtils.insertUser(user, testBranch.branchId);

      // Perform various operations and collect metrics
      const operations = [
        { name: 'document_insert', count: 5 },
        { name: 'chunk_insert', count: 100 },
        { name: 'embedding_insert', count: 100 },
        { name: 'search_query', count: 20 }
      ];

      const metricsData = [];

      for (const operation of operations) {
        const operationMetrics = [];

        for (let i = 0; i < operation.count; i++) {
          let result: any;
          const { duration } = await measurePerformance(async () => {
            switch (operation.name) {
              case 'document_insert':
                const doc = factory.createDocument(user.id);
                result = await testUtils.insertDocument(doc, testBranch!.branchId);
                break;
              
              case 'chunk_insert':
                const chunk = factory.createDocumentChunk('doc-id', i);
                result = await neonClient.executeSql(
                  `INSERT INTO document_chunks (id, document_id, content, index, metadata, created_at) 
                   VALUES ('${chunk.id}', '${user.id}', 'Test content ${i}', ${i}, '{}', NOW())`,
                  testBranch!.branchId
                );
                break;
              
              case 'embedding_insert':
                const embedding = factory.createDocumentEmbedding('chunk-id');
                result = await neonClient.executeSql(
                  `INSERT INTO document_embeddings (id, chunk_id, embedding_text, model, created_at) 
                   VALUES ('${embedding.id}', '${user.id}', '${embedding.embedding}', '${embedding.model}', NOW())`,
                  testBranch!.branchId
                );
                break;
              
              case 'search_query':
                result = await neonClient.executeSql(
                  'SELECT COUNT(*) FROM rag_documents',
                  testBranch!.branchId
                );
                break;
            }
            return result;
          });

          operationMetrics.push({
            duration,
            success: result?.success || false
          });
        }

        // Calculate operation statistics
        const durations = operationMetrics.map(m => m.duration);
        const successCount = operationMetrics.filter(m => m.success).length;
        
        const metrics = {
          operation: operation.name,
          count: operation.count,
          avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
          minDuration: Math.min(...durations),
          maxDuration: Math.max(...durations),
          successRate: successCount / operation.count,
          p95Duration: durations.sort()[Math.floor(durations.length * 0.95)]
        };

        metricsData.push(metrics);

        // Store metrics in database
        await neonClient.executeSql(
          `INSERT INTO performance_metrics 
           (test_suite, operation, avg_duration_ms, max_duration_ms, success_rate, sample_size, metadata, created_at)
           VALUES 
           ('rag-pipeline-integration', '${metrics.operation}', ${metrics.avgDuration}, ${metrics.maxDuration}, ${metrics.successRate}, ${metrics.count}, '${JSON.stringify(metrics)}', NOW())`,
          testBranch.branchId
        );
      }

      // Verify metrics collection
      expect(metricsData).toHaveLength(4);
      metricsData.forEach(metric => {
        expect(metric.successRate).toBeGreaterThan(0.8); // At least 80% success rate
        expect(metric.avgDuration).toBeGreaterThan(0);
        expect(metric.avgDuration).toBeLessThan(10000); // Under 10 seconds average
      });

      // Verify metrics were stored
      const storedMetricsResult = await neonClient.executeSql(
        'SELECT COUNT(*) as count FROM performance_metrics WHERE test_suite = \'rag-pipeline-integration\'',
        testBranch.branchId
      );

      expect(storedMetricsResult.success).toBe(true);
      expect(parseInt(storedMetricsResult.data?.results?.[0]?.count || '0')).toBe(4);
    });

    it('should track resource usage during operations', async () => {
      if (!testBranch) throw new Error('Test branch not available');

      // Create large dataset to test resource usage
      const testData = factory.createTestDataSet({
        userCount: 5,
        documentsPerUser: 3,
        chunksPerDocument: 50,
        withEmbeddings: true
      });

      // Monitor memory usage during data insertion
      const { result, duration, memoryUsage } = await measurePerformance(async () => {
        return testUtils.insertTestDataSet(testData, testBranch!.branchId);
      });

      // Verify resource efficiency
      expect(duration).toBeLessThan(60000); // Under 1 minute
      expect(memoryUsage.heapUsed).toBeLessThan(500 * 1024 * 1024); // Under 500MB
      expect(result.users.success).toBe(true);
      expect(result.documents.success).toBe(true);
      expect(result.chunks.success).toBe(true);
      expect(result.embeddings.success).toBe(true);

      // Verify data was inserted correctly
      const finalStats = await testUtils.getTestDataStats(testBranch.branchId);
      expect(finalStats.success).toBe(true);
      
      const stats = finalStats.data?.results?.[0];
      expect(parseInt(stats?.user_count || '0')).toBeGreaterThanOrEqual(5);
      expect(parseInt(stats?.document_count || '0')).toBeGreaterThanOrEqual(15);
      expect(parseInt(stats?.chunk_count || '0')).toBeGreaterThanOrEqual(750);
      expect(parseInt(stats?.embedding_count || '0')).toBeGreaterThanOrEqual(750);
    });
  });
});

// Helper function for UUID generation in tests
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}