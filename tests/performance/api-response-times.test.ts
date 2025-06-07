import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  setupNeonTestBranching,
  getTestDatabaseUrl,
  isNeonBranchingEnabled,
} from '../config/neon-branch-setup';
import { measurePerformance, waitFor } from '../utils/test-helpers';
import { POST as uploadPOST } from '@/app/api/documents/upload/route';
import { POST as chatPOST } from '@/app/(chat)/api/chat/route';
import { GET as searchGET } from '@/app/api/search/route';
import {
  createMockRequest,
  createMockFormDataRequest,
  mockAuthSuccess,
  setupTestEnvironment,
} from '../utils/test-helpers';
import {
  createTestFile,
  createFormDataWithFiles,
  createChatRequest,
  createPerformanceDataFactory,
} from '../fixtures/test-data';
import { nanoid } from 'nanoid';
import { migrate } from '@/lib/db/migrate';
import { getNeonLogger } from '@/lib/testing/neon-logger';

const logger = getNeonLogger();
const TEST_SUITE_NAME = 'api-response-times';

// Enhanced performance configuration
const PERFORMANCE_CONFIG = {
  SMALL_FILE_SIZE: 1024 * 1024, // 1MB
  MEDIUM_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  LARGE_FILE_SIZE: 25 * 1024 * 1024, // 25MB
  XL_FILE_SIZE: 45 * 1024 * 1024, // 45MB
  CONCURRENT_REQUESTS: 50, // Increased for realistic load testing
  STRESS_TEST_DURATION: 30000, // 30 seconds
  TIMEOUT_EXTENDED: 300000, // 5 minutes
  MEMORY_LIMIT_MB: 512, // 512MB memory limit for API tests
  TARGET_RESPONSE_TIME: 2000, // 2 seconds target
  TARGET_THROUGHPUT: 100, // 100 requests/second target
};

// Enhanced mocking for realistic performance testing with database integration
const mockDbOperations = {
  insertCount: 0,
  queryCount: 0,
  avgInsertTime: 0,
  avgQueryTime: 0,
};

// Mock with performance tracking
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockImplementation(async () => {
          const start = Date.now();
          mockDbOperations.insertCount++;

          // Simulate realistic database insert times
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 50 + 10),
          );

          mockDbOperations.avgInsertTime =
            (mockDbOperations.avgInsertTime *
              (mockDbOperations.insertCount - 1) +
              (Date.now() - start)) /
            mockDbOperations.insertCount;

          return [
            {
              id: `doc-${nanoid()}`,
              fileName: 'performance-test-file.pdf',
              originalName: 'test.pdf',
              status: 'uploaded',
              createdAt: new Date(),
            },
          ];
        }),
      })),
    })),
    query: {
      ragDocument: {
        findMany: vi.fn().mockImplementation(async () => {
          const start = Date.now();
          mockDbOperations.queryCount++;

          // Simulate realistic database query times
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 30 + 5),
          );

          mockDbOperations.avgQueryTime =
            (mockDbOperations.avgQueryTime * (mockDbOperations.queryCount - 1) +
              (Date.now() - start)) /
            mockDbOperations.queryCount;

          return [];
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      documentChunk: {
        findMany: vi.fn().mockImplementation(async () => {
          const start = Date.now();
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 20 + 3),
          );

          // Return realistic search results
          return Array.from({ length: 20 }, (_, i) => ({
            id: nanoid(),
            documentId: nanoid(),
            chunkIndex: i.toString(),
            content: `Performance test result ${i}`,
            metadata: { score: Math.random() },
            tokenCount: '50',
            createdAt: new Date(),
          }));
        }),
      },
    },
  },
}));

// Enhanced file system mocking with performance simulation
const mockFsPerformance = {
  writeOperations: 0,
  totalBytesWritten: 0,
  avgWriteTime: 0,
};

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockImplementation(async (path, data) => {
    const start = Date.now();
    mockFsPerformance.writeOperations++;

    const size = typeof data === 'string' ? data.length : data.byteLength || 0;
    mockFsPerformance.totalBytesWritten += size;

    // Simulate realistic file write times based on size
    const writeTime = Math.max(10, (size / (10 * 1024 * 1024)) * 1000); // 10MB/s write speed
    await new Promise((resolve) =>
      setTimeout(resolve, writeTime + Math.random() * 50),
    );

    mockFsPerformance.avgWriteTime =
      (mockFsPerformance.avgWriteTime *
        (mockFsPerformance.writeOperations - 1) +
        (Date.now() - start)) /
      mockFsPerformance.writeOperations;

    return undefined;
  }),
  mkdir: vi.fn().mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 20 + 5));
    return undefined;
  }),
}));

// Enhanced query mocking with performance simulation
const mockQueryPerformance = {
  getChatCalls: 0,
  getMessageCalls: 0,
  avgChatQueryTime: 0,
  avgMessageQueryTime: 0,
};

vi.mock('@/lib/db/queries', () => ({
  getChatById: vi.fn().mockImplementation(async () => {
    const start = Date.now();
    mockQueryPerformance.getChatCalls++;

    // Simulate database lookup time
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 40 + 10),
    );

    mockQueryPerformance.avgChatQueryTime =
      (mockQueryPerformance.avgChatQueryTime *
        (mockQueryPerformance.getChatCalls - 1) +
        (Date.now() - start)) /
      mockQueryPerformance.getChatCalls;

    return null;
  }),
  getMessageCountByUserId: vi.fn().mockImplementation(async (userId) => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 20 + 5));
    return Math.floor(Math.random() * 100); // Realistic message count
  }),
  getMessagesByChatId: vi.fn().mockImplementation(async () => {
    const start = Date.now();
    mockQueryPerformance.getMessageCalls++;

    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 60 + 15),
    );

    mockQueryPerformance.avgMessageQueryTime =
      (mockQueryPerformance.avgMessageQueryTime *
        (mockQueryPerformance.getMessageCalls - 1) +
        (Date.now() - start)) /
      mockQueryPerformance.getMessageCalls;

    return [];
  }),
  saveChat: vi.fn().mockImplementation(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 30 + 10),
    );
    return undefined;
  }),
  saveMessages: vi.fn().mockImplementation(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 50 + 15),
    );
    return undefined;
  }),
  createStreamId: vi.fn().mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 10 + 3));
    return nanoid();
  }),
}));

// Enhanced AI mocking with realistic streaming simulation
vi.mock('ai', () => ({
  streamText: vi.fn().mockImplementation(async () => {
    // Simulate AI response time
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 500 + 200),
    );

    return {
      consumeStream: vi.fn(),
      mergeIntoDataStream: vi.fn(),
    };
  }),
  createDataStream: vi.fn().mockImplementation(() => {
    return new ReadableStream({
      start(controller) {
        // Simulate streaming chunks with realistic timing
        let chunkCount = 0;
        const maxChunks = 10;

        const sendChunk = () => {
          if (chunkCount < maxChunks) {
            controller.enqueue(`data: chunk ${chunkCount}\n\n`);
            chunkCount++;
            setTimeout(sendChunk, Math.random() * 100 + 50); // Random delay between chunks
          } else {
            controller.close();
          }
        };

        setTimeout(sendChunk, 100); // Initial delay
      },
    });
  }),
}));

describe('API Response Time Performance Tests (Enhanced with Neon Branching)', () => {
  let db: ReturnType<typeof drizzle>;
  let client: ReturnType<typeof postgres>;
  const performanceFactory = createPerformanceDataFactory();

  // Enhanced Neon test branching setup
  setupNeonTestBranching(TEST_SUITE_NAME, {
    useEnhancedClient: true,
    branchOptions: {
      purpose: 'api-performance-testing',
      tags: ['performance', 'api-testing', 'high-throughput'],
      computeSize: 'medium', // Adequate compute for API performance tests
    },
    enableMetrics: true,
  });

  beforeAll(async () => {
    const connectionString = getTestDatabaseUrl();
    logger.info(
      'performance_setup',
      'Initializing API performance test database',
      {
        branchingEnabled: isNeonBranchingEnabled(),
        connectionString: connectionString.replace(/\/\/[^@]+@/, '//***@'),
      },
    );

    client = postgres(connectionString, {
      max: 15, // Connection pool for API tests
      idle_timeout: 20,
      connect_timeout: 30,
      transform: {
        undefined: null,
      },
    });

    db = drizzle(client);

    // Run migrations on test branch
    await migrate();

    logger.info('performance_setup', 'API performance test database ready');
  }, PERFORMANCE_CONFIG.TIMEOUT_EXTENDED);

  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (client) {
      await client.end();
    }
  });

  describe('Document Upload Performance (Enhanced)', () => {
    it(
      'should handle single file upload with comprehensive performance metrics',
      async () => {
        const testStart = Date.now();
        logger.info(
          'performance_test',
          'Starting enhanced single file upload test',
        );

        const userId = nanoid();
        const mockWithAuth = mockAuthSuccess(userId);
        vi.mocked(uploadPOST).mockImplementation(mockWithAuth);

        // Test with various file sizes for comprehensive benchmarking
        const fileSizes = [
          PERFORMANCE_CONFIG.SMALL_FILE_SIZE,
          PERFORMANCE_CONFIG.MEDIUM_FILE_SIZE,
          PERFORMANCE_CONFIG.LARGE_FILE_SIZE,
        ];

        const uploadResults = [];

        for (const size of fileSizes) {
          const testFile = performanceFactory.createLargeTestFile(
            `performance-test-${size}.pdf`,
            'application/pdf',
            size,
          );
          const formData = createFormDataWithFiles([testFile]);

          const { duration, result, memoryUsage } = await measurePerformance(
            async () => {
              const request = createMockFormDataRequest(
                'http://localhost:3000/api/documents/upload',
                formData,
              );
              return uploadPOST(request);
            },
          );

          const uploadThroughput = size / (duration / 1000); // bytes per second
          const uploadThroughputMBps = uploadThroughput / (1024 * 1024);

          uploadResults.push({
            fileSize: size,
            fileSizeMB: size / (1024 * 1024),
            duration,
            throughput: uploadThroughput,
            throughputMBps: uploadThroughputMBps,
            memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
            status: result.status,
          });

          // Enhanced performance assertions
          const expectedDuration = Math.max(
            1000,
            (size / (5 * 1024 * 1024)) * 1000,
          ); // 5MB/s minimum
          expect(duration).toBeLessThan(expectedDuration);
          expect(result.status).toBe(200);
          expect(memoryUsage.heapUsed).toBeLessThan(
            PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024,
          );
          expect(uploadThroughputMBps).toBeGreaterThan(1); // At least 1MB/s

          logger.info(
            'performance_metrics',
            `File upload completed for size ${size}`,
            {
              fileSizeMB: size / (1024 * 1024),
              duration,
              throughputMBps: uploadThroughputMBps,
              memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
            },
          );
        }

        // Analyze scaling characteristics
        const avgThroughput =
          uploadResults.reduce((sum, r) => sum + r.throughputMBps, 0) /
          uploadResults.length;
        const throughputVariance =
          uploadResults.reduce(
            (sum, r) => sum + Math.pow(r.throughputMBps - avgThroughput, 2),
            0,
          ) / uploadResults.length;

        expect(avgThroughput).toBeGreaterThan(2); // Average throughput should be good
        expect(throughputVariance).toBeLessThan(4); // Consistent performance across file sizes

        logger.info(
          'performance_test',
          'Enhanced single file upload test completed',
          {
            totalTime: Date.now() - testStart,
            avgThroughputMBps: avgThroughput,
            throughputVariance,
            uploadResults,
          },
        );
      },
      PERFORMANCE_CONFIG.TIMEOUT_EXTENDED,
    );

    it(
      'should handle multiple file uploads with excellent scaling',
      async () => {
        const testStart = Date.now();
        logger.info(
          'performance_test',
          'Starting multiple file upload scaling test',
        );

        const userId = nanoid();
        const mockWithAuth = mockAuthSuccess(userId);
        vi.mocked(uploadPOST).mockImplementation(mockWithAuth);

        // Test with realistic file count variations
        const fileCounts = [1, 3, 5, 10, 15, 25];
        const performanceResults = [];

        for (const fileCount of fileCounts) {
          const batchStart = Date.now();
          logger.info(
            'performance_metrics',
            `Testing ${fileCount} file upload`,
          );

          // Create files with varied sizes for realistic testing
          const files = Array.from({ length: fileCount }, (_, i) => {
            const sizeVariation = 0.5 + Math.random(); // 0.5x to 1.5x base size
            const size = Math.floor(
              PERFORMANCE_CONFIG.SMALL_FILE_SIZE * sizeVariation,
            );
            return performanceFactory.createLargeTestFile(
              `batch-test-${i}.pdf`,
              'application/pdf',
              size,
            );
          });

          const formData = createFormDataWithFiles(files);
          const totalSize = files.reduce((sum, file) => sum + file.size, 0);

          const { duration, result, memoryUsage } = await measurePerformance(
            async () => {
              const request = createMockFormDataRequest(
                'http://localhost:3000/api/documents/upload',
                formData,
              );
              return uploadPOST(request);
            },
          );

          const throughput = totalSize / (duration / 1000); // bytes per second
          const throughputMBps = throughput / (1024 * 1024);
          const avgTimePerFile = duration / fileCount;
          const memoryPerFile = memoryUsage.heapUsed / fileCount;

          performanceResults.push({
            fileCount,
            totalSizeMB: totalSize / (1024 * 1024),
            duration,
            avgTimePerFile,
            throughputMBps,
            memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
            memoryPerFileMB: memoryPerFile / (1024 * 1024),
            status: result.status,
          });

          // Performance assertions for each batch
          const maxExpectedDuration = fileCount * 500 + 2000; // 500ms per file + 2s overhead
          expect(duration).toBeLessThan(maxExpectedDuration);
          expect(result.status).toBe(200);
          expect(memoryUsage.heapUsed).toBeLessThan(
            PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024,
          );
          expect(avgTimePerFile).toBeLessThan(3000); // Max 3 seconds per file
          expect(throughputMBps).toBeGreaterThan(0.5); // At least 0.5MB/s

          logger.info('performance_metrics', `Batch ${fileCount} completed`, {
            duration,
            throughputMBps,
            avgTimePerFile,
            memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
          });
        }

        // Advanced scaling analysis
        const scalingMetrics = [];
        for (let i = 1; i < performanceResults.length; i++) {
          const prev = performanceResults[i - 1];
          const curr = performanceResults[i];

          const fileCountRatio = curr.fileCount / prev.fileCount;
          const durationRatio = curr.duration / prev.duration;
          const scalingEfficiency = fileCountRatio / durationRatio; // Higher is better

          scalingMetrics.push({
            fromCount: prev.fileCount,
            toCount: curr.fileCount,
            scalingEfficiency,
            throughputChange: curr.throughputMBps / prev.throughputMBps,
          });
        }

        // Performance expectations
        const avgScalingEfficiency =
          scalingMetrics.reduce((sum, m) => sum + m.scalingEfficiency, 0) /
          scalingMetrics.length;
        const maxAvgTimePerFile = Math.max(
          ...performanceResults.map((r) => r.avgTimePerFile),
        );
        const minThroughput = Math.min(
          ...performanceResults.map((r) => r.throughputMBps),
        );

        expect(avgScalingEfficiency).toBeGreaterThan(0.7); // Good scaling efficiency
        expect(maxAvgTimePerFile).toBeLessThan(2000); // Consistent per-file performance
        expect(minThroughput).toBeGreaterThan(0.5); // Minimum acceptable throughput

        logger.info(
          'performance_test',
          'Multiple file upload scaling test completed',
          {
            totalTime: Date.now() - testStart,
            avgScalingEfficiency,
            maxAvgTimePerFile,
            minThroughput,
            scalingMetrics,
            performanceResults,
          },
        );
      },
      PERFORMANCE_CONFIG.TIMEOUT_EXTENDED,
    );

    it(
      'should handle extra large file uploads with optimized performance',
      async () => {
        const testStart = Date.now();
        logger.info(
          'performance_test',
          'Starting extra large file upload test',
        );

        const userId = nanoid();
        const mockWithAuth = mockAuthSuccess(userId);
        vi.mocked(uploadPOST).mockImplementation(mockWithAuth);

        // Test comprehensive range including near-limit sizes
        const fileSizes = [
          PERFORMANCE_CONFIG.SMALL_FILE_SIZE, // 1MB
          PERFORMANCE_CONFIG.MEDIUM_FILE_SIZE, // 5MB
          PERFORMANCE_CONFIG.LARGE_FILE_SIZE, // 25MB
          PERFORMANCE_CONFIG.XL_FILE_SIZE, // 45MB (near limit)
        ];

        const sizePerformance = [];

        for (const size of fileSizes) {
          const sizeStart = Date.now();
          logger.info(
            'performance_metrics',
            `Testing ${size / (1024 * 1024)}MB file upload`,
          );

          const testFile = performanceFactory.createLargeTestFile(
            `xl-test-${size}.pdf`,
            'application/pdf',
            size,
          );
          const formData = createFormDataWithFiles([testFile]);

          const { duration, result, memoryUsage } = await measurePerformance(
            async () => {
              const request = createMockFormDataRequest(
                'http://localhost:3000/api/documents/upload',
                formData,
              );
              return uploadPOST(request);
            },
          );

          const sizeMB = size / (1024 * 1024);
          const throughputMBps = sizeMB / (duration / 1000);
          const memoryEfficiency = size / memoryUsage.heapUsed; // Higher is better
          const memoryOverheadRatio = memoryUsage.heapUsed / size;

          sizePerformance.push({
            sizeMB,
            duration,
            throughputMBps,
            memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
            memoryEfficiency,
            memoryOverheadRatio,
            status: result.status,
          });

          // Enhanced performance assertions
          const expectedMaxDuration = Math.max(5000, sizeMB * 1000); // 1 second per MB minimum
          const expectedMaxMemory = Math.min(
            PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024,
            size * 3,
          ); // Max 3x file size or limit

          expect(result.status).toBe(200);
          expect(duration).toBeLessThan(expectedMaxDuration);
          expect(memoryUsage.heapUsed).toBeLessThan(expectedMaxMemory);
          expect(throughputMBps).toBeGreaterThan(0.5); // At least 0.5MB/s
          expect(memoryOverheadRatio).toBeLessThan(5); // Memory overhead should be reasonable

          logger.info('performance_metrics', `${sizeMB}MB file completed`, {
            duration,
            throughputMBps,
            memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
            memoryOverheadRatio,
          });
        }

        // Analyze performance scaling with file size
        const throughputs = sizePerformance.map((p) => p.throughputMBps);
        const avgThroughput =
          throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
        const throughputVariance =
          throughputs.reduce(
            (sum, t) => sum + Math.pow(t - avgThroughput, 2),
            0,
          ) / throughputs.length;
        const throughputConsistency = 1 / (throughputVariance + 0.1); // Higher is better

        const largestFile = sizePerformance[sizePerformance.length - 1];
        const smallestFile = sizePerformance[0];
        const scalingFactor =
          largestFile.duration /
          largestFile.sizeMB /
          (smallestFile.duration / smallestFile.sizeMB);

        // Performance expectations
        expect(avgThroughput).toBeGreaterThan(1); // Average throughput should be good
        expect(throughputConsistency).toBeGreaterThan(2); // Reasonably consistent performance
        expect(scalingFactor).toBeLessThan(2); // Scaling should not be worse than linear
        expect(largestFile.duration).toBeLessThan(60000); // Even 45MB should complete in 1 minute

        logger.info(
          'performance_test',
          'Extra large file upload test completed',
          {
            totalTime: Date.now() - testStart,
            avgThroughputMBps: avgThroughput,
            throughputVariance,
            throughputConsistency,
            scalingFactor,
            sizePerformance,
          },
        );
      },
      PERFORMANCE_CONFIG.TIMEOUT_EXTENDED,
    );
  });

  describe('Chat API Performance (Enhanced)', () => {
    it(
      'should respond to chat messages with exceptional speed and consistency',
      async () => {
        const testStart = Date.now();
        logger.info(
          'performance_test',
          'Starting enhanced chat response performance test',
        );

        const userId = nanoid();
        const mockWithAuth = mockAuthSuccess(userId);
        vi.mocked(chatPOST).mockImplementation(mockWithAuth);

        // Test various message complexities
        const messageComplexities = [
          { type: 'simple', content: 'Hello', expectedMaxTime: 1500 },
          {
            type: 'medium',
            content:
              'Can you help me understand how vector embeddings work in detail?',
            expectedMaxTime: 2000,
          },
          {
            type: 'complex',
            content:
              'Analyze this large dataset and provide insights on performance optimization strategies for distributed systems handling real-time data processing',
            expectedMaxTime: 3000,
          },
        ];

        const responseResults = [];

        for (const complexity of messageComplexities) {
          const chatId = nanoid();
          const chatRequest = createChatRequest(chatId, complexity.content);

          // Test multiple iterations for consistency
          const iterations = 5;
          const iterationResults = [];

          for (let i = 0; i < iterations; i++) {
            const { duration, result, memoryUsage } = await measurePerformance(
              async () => {
                const request = createMockRequest(
                  'http://localhost:3000/api/chat',
                  {
                    method: 'POST',
                    body: chatRequest,
                  },
                );
                return chatPOST(request);
              },
            );

            iterationResults.push({
              iteration: i,
              duration,
              memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
              status: result.status,
            });

            expect(result.status).toBe(200);
            expect(duration).toBeLessThan(complexity.expectedMaxTime);
          }

          const avgDuration =
            iterationResults.reduce((sum, r) => sum + r.duration, 0) /
            iterations;
          const maxDuration = Math.max(
            ...iterationResults.map((r) => r.duration),
          );
          const minDuration = Math.min(
            ...iterationResults.map((r) => r.duration),
          );
          const durationVariance =
            iterationResults.reduce(
              (sum, r) => sum + Math.pow(r.duration - avgDuration, 2),
              0,
            ) / iterations;
          const consistencyScore = 1 / (durationVariance + 1); // Higher is better

          responseResults.push({
            complexity: complexity.type,
            messageLength: complexity.content.length,
            avgDuration,
            maxDuration,
            minDuration,
            durationVariance,
            consistencyScore,
            iterations,
          });

          logger.info(
            'performance_metrics',
            `Chat ${complexity.type} complexity completed`,
            {
              avgDuration,
              maxDuration,
              consistencyScore,
            },
          );
        }

        // Overall performance analysis
        const overallAvgDuration =
          responseResults.reduce((sum, r) => sum + r.avgDuration, 0) /
          responseResults.length;
        const overallConsistency =
          responseResults.reduce((sum, r) => sum + r.consistencyScore, 0) /
          responseResults.length;

        expect(overallAvgDuration).toBeLessThan(
          PERFORMANCE_CONFIG.TARGET_RESPONSE_TIME,
        );
        expect(overallConsistency).toBeGreaterThan(0.5); // Reasonable consistency
        expect(
          responseResults.every(
            (r) => r.maxDuration < r.messageLength * 10 + 1000,
          ),
        ).toBe(true); // Scaling expectation

        logger.info(
          'performance_test',
          'Enhanced chat response performance test completed',
          {
            totalTime: Date.now() - testStart,
            overallAvgDuration,
            overallConsistency,
            responseResults,
          },
        );
      },
      PERFORMANCE_CONFIG.TIMEOUT_EXTENDED,
    );

    it(
      'should handle high-volume concurrent chat requests with excellent throughput',
      async () => {
        const testStart = Date.now();
        logger.info(
          'performance_test',
          'Starting high-volume concurrent chat test',
        );

        const userId = nanoid();
        const mockWithAuth = mockAuthSuccess(userId);
        vi.mocked(chatPOST).mockImplementation(mockWithAuth);

        // Test progressive concurrency levels
        const concurrencyLevels = [
          5,
          10,
          20,
          30,
          PERFORMANCE_CONFIG.CONCURRENT_REQUESTS,
        ];
        const concurrencyResults = [];

        for (const concurrentRequests of concurrencyLevels) {
          const levelStart = Date.now();
          logger.info(
            'performance_metrics',
            `Testing ${concurrentRequests} concurrent chat requests`,
          );

          // Create varied chat requests for realistic testing
          const chatRequests = Array.from(
            { length: concurrentRequests },
            (_, i) => {
              const chatId = nanoid();
              const messageVariations = [
                'Quick question',
                'Can you explain the concept of machine learning?',
                'I need help with a complex data analysis problem involving multiple variables and statistical methods',
                'What are the best practices for optimizing database performance?',
              ];
              const message = messageVariations[i % messageVariations.length];
              return createChatRequest(chatId, message);
            },
          );

          const { duration, result, memoryUsage } = await measurePerformance(
            async () => {
              const requestPromises = chatRequests.map((chatRequest, index) => {
                const request = createMockRequest(
                  'http://localhost:3000/api/chat',
                  {
                    method: 'POST',
                    body: chatRequest,
                  },
                );

                // Add slight staggering to simulate realistic user behavior
                return new Promise((resolve) => {
                  setTimeout(() => {
                    resolve(chatPOST(request));
                  }, Math.random() * 100);
                });
              });

              return Promise.all(requestPromises);
            },
          );

          const successfulRequests = result.filter(
            (r) => r.status === 200,
          ).length;
          const throughput = concurrentRequests / (duration / 1000); // requests per second
          const avgResponseTime = duration / concurrentRequests;
          const successRate = successfulRequests / concurrentRequests;

          concurrencyResults.push({
            concurrentRequests,
            duration,
            throughput,
            avgResponseTime,
            successRate,
            memoryUsageMB: memoryUsage.heapUsed / (1024 * 1024),
            levelTime: Date.now() - levelStart,
          });

          // Performance assertions for each level
          const expectedMaxDuration = concurrentRequests * 100 + 5000; // 100ms per request + 5s overhead
          expect(duration).toBeLessThan(expectedMaxDuration);
          expect(successRate).toBeGreaterThan(0.95); // 95% success rate minimum
          expect(throughput).toBeGreaterThan(1); // At least 1 request/second
          expect(avgResponseTime).toBeLessThan(
            PERFORMANCE_CONFIG.TARGET_RESPONSE_TIME * 2,
          );
          expect(memoryUsage.heapUsed).toBeLessThan(
            PERFORMANCE_CONFIG.MEMORY_LIMIT_MB * 1024 * 1024,
          );

          logger.info(
            'performance_metrics',
            `Concurrency level ${concurrentRequests} completed`,
            {
              duration,
              throughput,
              successRate,
              avgResponseTime,
            },
          );
        }

        // Analyze scaling characteristics
        const maxThroughput = Math.max(
          ...concurrencyResults.map((r) => r.throughput),
        );
        const avgSuccessRate =
          concurrencyResults.reduce((sum, r) => sum + r.successRate, 0) /
          concurrencyResults.length;
        const throughputDegradation = concurrencyResults.map((r, i) =>
          i > 0 ? r.throughput / concurrencyResults[i - 1].throughput : 1,
        );
        const avgThroughputRetention =
          throughputDegradation.slice(1).reduce((sum, t) => sum + t, 0) /
          (throughputDegradation.length - 1);

        expect(maxThroughput).toBeGreaterThan(10); // Should achieve good peak throughput
        expect(avgSuccessRate).toBeGreaterThan(0.98); // High overall success rate
        expect(avgThroughputRetention).toBeGreaterThan(0.7); // Reasonable throughput retention under load

        logger.info(
          'performance_test',
          'High-volume concurrent chat test completed',
          {
            totalTime: Date.now() - testStart,
            maxThroughput,
            avgSuccessRate,
            avgThroughputRetention,
            concurrencyResults,
          },
        );
      },
      PERFORMANCE_CONFIG.TIMEOUT_EXTENDED,
    );

    it('should maintain performance with message history', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(chatPOST).mockImplementation(mockWithAuth);

      // Mock chat with varying message history lengths
      const { getMessagesByChatId } = await import('@/lib/db/queries');

      const historySizes = [0, 10, 50, 100, 500];
      const historyPerformance = [];

      for (const historySize of historySizes) {
        // Mock message history
        const mockHistory = Array.from({ length: historySize }, (_, i) => ({
          id: nanoid(),
          chatId: nanoid(),
          role: i % 2 === 0 ? 'user' : 'assistant',
          parts: [{ type: 'text', text: `Message ${i}` }],
          attachments: [],
          createdAt: new Date(),
        }));

        vi.mocked(getMessagesByChatId).mockResolvedValue(mockHistory);

        const chatId = nanoid();
        const chatRequest = createChatRequest(chatId);

        const { duration, result } = await measurePerformance(async () => {
          const request = createMockRequest('http://localhost:3000/api/chat', {
            method: 'POST',
            body: chatRequest,
          });
          return chatPOST(request);
        });

        historyPerformance.push({
          historySize,
          duration,
          status: result.status,
        });

        expect(result.status).toBe(200);
      }

      // Performance should not degrade significantly with history
      const maxDuration = Math.max(
        ...historyPerformance.map((h) => h.duration),
      );
      expect(maxDuration).toBeLessThan(5000); // Even with 500 messages, under 5 seconds
    });

    it('should handle streaming responses efficiently', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(chatPOST).mockImplementation(mockWithAuth);

      // Mock streaming response
      const { createDataStream } = await import('ai');
      const mockStream = new ReadableStream({
        start(controller) {
          // Simulate streaming chunks
          for (let i = 0; i < 10; i++) {
            controller.enqueue(`data: chunk ${i}\n\n`);
          }
          controller.close();
        },
      });
      vi.mocked(createDataStream).mockReturnValue(mockStream);

      const chatId = nanoid();
      const chatRequest = createChatRequest(chatId);

      const { duration, result } = await measurePerformance(async () => {
        const request = createMockRequest('http://localhost:3000/api/chat', {
          method: 'POST',
          body: chatRequest,
        });
        const response = await chatPOST(request);

        // Simulate reading the stream
        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }

        return response;
      });

      expect(duration).toBeLessThan(8000); // Stream processing within 8 seconds
      expect(result.status).toBe(200);
    });
  });

  describe('Search API Performance', () => {
    it('should perform searches within acceptable time limits', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(searchGET).mockImplementation(mockWithAuth);

      // Mock search results
      const { db } = await import('@/lib/db');
      vi.mocked(db.query.documentChunk.findMany).mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          id: nanoid(),
          documentId: nanoid(),
          chunkIndex: i.toString(),
          content: `Search result ${i}`,
          metadata: {},
          tokenCount: '50',
          createdAt: new Date(),
        })),
      );

      const searchTerms = [
        'simple search',
        'complex multi-word search query',
        'very long search query with many terms that should test the performance of the search functionality',
      ];

      const searchPerformance = [];

      for (const query of searchTerms) {
        const { duration, result } = await measurePerformance(async () => {
          const request = createMockRequest(
            `http://localhost:3000/api/search?q=${encodeURIComponent(query)}`,
          );
          return searchGET(request);
        });

        searchPerformance.push({
          queryLength: query.length,
          duration,
          status: result.status,
        });

        expect(result.status).toBe(200);
      }

      // All searches should complete quickly regardless of query complexity
      expect(searchPerformance.every((s) => s.duration < 2000)).toBe(true);
    });

    it('should handle high-frequency search requests', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(searchGET).mockImplementation(mockWithAuth);

      // Mock lightweight search results
      const { db } = await import('@/lib/db');
      vi.mocked(db.query.documentChunk.findMany).mockResolvedValue([
        {
          id: nanoid(),
          documentId: nanoid(),
          chunkIndex: '0',
          content: 'Quick search result',
          metadata: {},
          tokenCount: '20',
          createdAt: new Date(),
        },
      ]);

      const requestCount = 50;
      const searchRequests = Array.from({ length: requestCount }, (_, i) =>
        createMockRequest(`http://localhost:3000/api/search?q=test${i}`),
      );

      const { duration, result } = await measurePerformance(async () => {
        const requestPromises = searchRequests.map((request) =>
          searchGET(request),
        );
        return Promise.all(requestPromises);
      });

      expect(duration).toBeLessThan(15000); // 50 searches within 15 seconds
      expect(result).toHaveLength(requestCount);
      expect(result.every((response) => response.status === 200)).toBe(true);
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should enforce rate limits efficiently', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId, 'regular'); // Regular user with limits
      vi.mocked(chatPOST).mockImplementation(mockWithAuth);

      // Mock rate limit exceeded
      const { getMessageCountByUserId } = await import('@/lib/db/queries');
      vi.mocked(getMessageCountByUserId).mockResolvedValue(1000); // Over limit

      const rateLimitRequests = 10;
      const requests = Array.from({ length: rateLimitRequests }, () => {
        const chatId = nanoid();
        const chatRequest = createChatRequest(chatId);
        return createMockRequest('http://localhost:3000/api/chat', {
          method: 'POST',
          body: chatRequest,
        });
      });

      const { duration, result } = await measurePerformance(async () => {
        const requestPromises = requests.map((request) => chatPOST(request));
        return Promise.all(requestPromises);
      });

      expect(duration).toBeLessThan(3000); // Rate limiting should be fast
      expect(result.every((response) => response.status === 429)).toBe(true); // All rate limited
    });

    it('should handle rate limit resets efficiently', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId, 'regular');
      vi.mocked(chatPOST).mockImplementation(mockWithAuth);

      const { getMessageCountByUserId } = await import('@/lib/db/queries');

      // Simulate rate limit reset scenario
      let requestCount = 0;
      vi.mocked(getMessageCountByUserId).mockImplementation(async () => {
        requestCount++;
        // First few requests are under limit, then over limit
        return requestCount <= 5 ? 0 : 1000;
      });

      const requests = Array.from({ length: 10 }, () => {
        const chatId = nanoid();
        const chatRequest = createChatRequest(chatId);
        return createMockRequest('http://localhost:3000/api/chat', {
          method: 'POST',
          body: chatRequest,
        });
      });

      const { duration, result } = await measurePerformance(async () => {
        const responses = [];
        for (const request of requests) {
          const response = await chatPOST(request);
          responses.push(response);
          await waitFor(100); // Small delay between requests
        }
        return responses;
      });

      expect(duration).toBeLessThan(5000); // Should complete quickly

      // First 5 should succeed, rest should be rate limited
      const successfulRequests = result.filter((r) => r.status === 200);
      const rateLimitedRequests = result.filter((r) => r.status === 429);

      expect(successfulRequests).toHaveLength(5);
      expect(rateLimitedRequests).toHaveLength(5);
    });
  });

  describe('Error Handling Performance', () => {
    it('should handle errors quickly without resource leaks', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(uploadPOST).mockImplementation(mockWithAuth);

      // Mock file system error
      const { writeFile } = await import('node:fs/promises');
      vi.mocked(writeFile).mockRejectedValue(new Error('Disk full'));

      const errorRequests = 20;
      const requests = Array.from({ length: errorRequests }, () => {
        const testFile = createTestFile();
        const formData = createFormDataWithFiles([testFile]);
        return createMockFormDataRequest(
          'http://localhost:3000/api/documents/upload',
          formData,
        );
      });

      const { duration, result, memoryUsage } = await measurePerformance(
        async () => {
          const requestPromises = requests.map((request) =>
            uploadPOST(request),
          );
          return Promise.all(requestPromises);
        },
      );

      expect(duration).toBeLessThan(8000); // Error handling should be fast
      expect(result.every((response) => response.status === 400)).toBe(true); // All should error
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // No memory leaks
    });
  });
});
