import { describe, it, expect, beforeEach, vi } from 'vitest';
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
} from '../fixtures/test-data';
import { nanoid } from 'nanoid';

// Mock dependencies for consistent performance testing
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'doc-id-123',
          fileName: 'test-file.pdf',
          originalName: 'test.pdf',
          status: 'uploaded',
        }]),
      }),
    }),
    query: {
      ragDocument: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      documentChunk: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db/queries', () => ({
  getChatById: vi.fn().mockResolvedValue(null),
  getMessageCountByUserId: vi.fn().mockResolvedValue(0),
  getMessagesByChatId: vi.fn().mockResolvedValue([]),
  saveChat: vi.fn().mockResolvedValue(undefined),
  saveMessages: vi.fn().mockResolvedValue(undefined),
  createStreamId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ai', () => ({
  streamText: vi.fn().mockReturnValue({
    consumeStream: vi.fn(),
    mergeIntoDataStream: vi.fn(),
  }),
  createDataStream: vi.fn().mockReturnValue(new ReadableStream()),
}));

describe('API Response Time Performance Tests', () => {
  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
  });

  describe('Document Upload Performance', () => {
    it('should handle single file upload within acceptable time', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(uploadPOST).mockImplementation(mockWithAuth);

      const testFile = createTestFile('performance-test.pdf', 'application/pdf', 5 * 1024 * 1024); // 5MB
      const formData = createFormDataWithFiles([testFile]);
      
      const { duration, result } = await measurePerformance(async () => {
        const request = createMockFormDataRequest(
          'http://localhost:3000/api/documents/upload',
          formData
        );
        return uploadPOST(request);
      });

      expect(duration).toBeLessThan(5000); // Less than 5 seconds
      expect(result.status).toBe(200);
    });

    it('should handle multiple file uploads efficiently', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(uploadPOST).mockImplementation(mockWithAuth);

      // Test with varying numbers of files
      const fileCounts = [1, 5, 10, 20];
      const performanceResults = [];

      for (const fileCount of fileCounts) {
        const files = Array.from({ length: fileCount }, (_, i) => 
          createTestFile(`test-${i}.pdf`, 'application/pdf', 1024 * 1024) // 1MB each
        );
        const formData = createFormDataWithFiles(files);

        const { duration, result } = await measurePerformance(async () => {
          const request = createMockFormDataRequest(
            'http://localhost:3000/api/documents/upload',
            formData
          );
          return uploadPOST(request);
        });

        performanceResults.push({
          fileCount,
          duration,
          status: result.status,
        });

        expect(result.status).toBe(200);
      }

      // Analyze scaling
      const timePerFile = performanceResults.map(result => result.duration / result.fileCount);
      const averageTimePerFile = timePerFile.reduce((sum, time) => sum + time, 0) / timePerFile.length;

      expect(averageTimePerFile).toBeLessThan(2000); // Less than 2 seconds per file on average
    });

    it('should handle large file uploads within time limits', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(uploadPOST).mockImplementation(mockWithAuth);

      // Test with different file sizes
      const fileSizes = [
        1 * 1024 * 1024,   // 1MB
        5 * 1024 * 1024,   // 5MB
        10 * 1024 * 1024,  // 10MB
        25 * 1024 * 1024,  // 25MB
        45 * 1024 * 1024,  // 45MB (near limit)
      ];

      const sizePerformance = [];

      for (const size of fileSizes) {
        const testFile = createTestFile('large-test.pdf', 'application/pdf', size);
        const formData = createFormDataWithFiles([testFile]);

        const { duration, result, memoryUsage } = await measurePerformance(async () => {
          const request = createMockFormDataRequest(
            'http://localhost:3000/api/documents/upload',
            formData
          );
          return uploadPOST(request);
        });

        sizePerformance.push({
          size: size / (1024 * 1024), // Size in MB
          duration,
          memoryUsage: memoryUsage.heapUsed,
          status: result.status,
        });

        expect(result.status).toBe(200);
        expect(memoryUsage.heapUsed).toBeLessThan(size * 2); // Memory usage should be reasonable
      }

      // Time should scale reasonably with file size
      const largestFile = sizePerformance[sizePerformance.length - 1];
      expect(largestFile.duration).toBeLessThan(30000); // Even 45MB should upload in under 30 seconds
    });
  });

  describe('Chat API Performance', () => {
    it('should respond to chat messages quickly', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(chatPOST).mockImplementation(mockWithAuth);

      const chatId = nanoid();
      const chatRequest = createChatRequest(chatId);

      const { duration, result } = await measurePerformance(async () => {
        const request = createMockRequest('http://localhost:3000/api/chat', {
          method: 'POST',
          body: chatRequest,
        });
        return chatPOST(request);
      });

      expect(duration).toBeLessThan(3000); // Initial response within 3 seconds
      expect(result.status).toBe(200);
    });

    it('should handle concurrent chat requests efficiently', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(chatPOST).mockImplementation(mockWithAuth);

      const concurrentRequests = 10;
      const chatRequests = Array.from({ length: concurrentRequests }, () => {
        const chatId = nanoid();
        return createChatRequest(chatId);
      });

      const { duration, result } = await measurePerformance(async () => {
        const requestPromises = chatRequests.map(chatRequest => {
          const request = createMockRequest('http://localhost:3000/api/chat', {
            method: 'POST',
            body: chatRequest,
          });
          return chatPOST(request);
        });

        return Promise.all(requestPromises);
      });

      expect(duration).toBeLessThan(10000); // All requests within 10 seconds
      expect(result).toHaveLength(concurrentRequests);
      expect(result.every(response => response.status === 200)).toBe(true);
    });

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
      const maxDuration = Math.max(...historyPerformance.map(h => h.duration));
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
        }))
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
            `http://localhost:3000/api/search?q=${encodeURIComponent(query)}`
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
      expect(searchPerformance.every(s => s.duration < 2000)).toBe(true);
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
        createMockRequest(`http://localhost:3000/api/search?q=test${i}`)
      );

      const { duration, result } = await measurePerformance(async () => {
        const requestPromises = searchRequests.map(request => searchGET(request));
        return Promise.all(requestPromises);
      });

      expect(duration).toBeLessThan(15000); // 50 searches within 15 seconds
      expect(result).toHaveLength(requestCount);
      expect(result.every(response => response.status === 200)).toBe(true);
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
        const requestPromises = requests.map(request => chatPOST(request));
        return Promise.all(requestPromises);
      });

      expect(duration).toBeLessThan(3000); // Rate limiting should be fast
      expect(result.every(response => response.status === 429)).toBe(true); // All rate limited
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
      const successfulRequests = result.filter(r => r.status === 200);
      const rateLimitedRequests = result.filter(r => r.status === 429);
      
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
          formData
        );
      });

      const { duration, result, memoryUsage } = await measurePerformance(async () => {
        const requestPromises = requests.map(request => uploadPOST(request));
        return Promise.all(requestPromises);
      });

      expect(duration).toBeLessThan(8000); // Error handling should be fast
      expect(result.every(response => response.status === 400)).toBe(true); // All should error
      expect(memoryUsage.heapUsed).toBeLessThan(100 * 1024 * 1024); // No memory leaks
    });
  });
});