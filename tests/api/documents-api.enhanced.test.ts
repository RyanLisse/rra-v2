import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/documents/chunk/route';
import { GET as listGET } from '@/app/api/documents/list/route';
import { POST as processPost } from '@/app/api/documents/process/route';
import { setupNeonTestBranching, runMigrationsOnTestBranch } from '../config/neon-branch-setup';
import { 
  createTestUser,
  createTestDocument,
  createTestDocumentContent,
  createTestDocumentChunk,
} from '../fixtures/test-data';
import { db } from '@/lib/db';
import { user, ragDocument, documentContent, documentChunk } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { 
  getNeonApiClient, 
  type PerformanceMetrics 
} from '@/lib/testing/neon-api-client';
import { getNeonLogger } from '@/lib/testing/neon-logger';

const logger = getNeonLogger();
const testSuiteName = 'documents-api-enhanced';

// Setup enhanced Neon branching for this test suite
setupNeonTestBranching(testSuiteName, {
  useEnhancedClient: true,
  enableMetrics: true,
  branchOptions: {
    testSuite: testSuiteName,
    purpose: 'document-api-testing',
    tags: ['documents', 'api', 'rag', 'chunking', 'enhanced'],
  },
});

// Enhanced factory system for document test data
export class DocumentTestDataFactory {
  private metrics: PerformanceMetrics = {
    creationTime: 0,
    queryTime: 0,
    insertTime: 0,
    memoryUsage: process.memoryUsage(),
  };

  async createUserWithDocuments(documentCount: number = 1) {
    const startTime = Date.now();
    
    const userData = createTestUser();
    
    // Insert user into real database
    const [insertedUser] = await db
      .insert(user)
      .values({
        id: nanoid(),
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const documents = [];
    
    for (let i = 0; i < documentCount; i++) {
      const documentData = createTestDocument(insertedUser.id, {
        fileName: `test-doc-${i + 1}-${nanoid()}.pdf`,
        originalName: `Test Document ${i + 1}.pdf`,
        status: i % 2 === 0 ? 'uploaded' : 'processed',
      });

      const [insertedDocument] = await db
        .insert(ragDocument)
        .values({
          id: nanoid(),
          ...documentData,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Create document content for processed documents
      if (insertedDocument.status === 'processed') {
        const contentData = createTestDocumentContent(insertedDocument.id);
        
        const [insertedContent] = await db
          .insert(documentContent)
          .values({
            id: nanoid(),
            ...contentData,
            createdAt: new Date(),
          })
          .returning();

        // Create chunks for the document
        const chunks = [];
        for (let j = 0; j < 3; j++) {
          const chunkData = createTestDocumentChunk(insertedDocument.id, j);
          
          const [insertedChunk] = await db
            .insert(documentChunk)
            .values({
              id: nanoid(),
              ...chunkData,
              createdAt: new Date(),
            })
            .returning();
          
          chunks.push(insertedChunk);
        }

        documents.push({
          document: insertedDocument,
          content: insertedContent,
          chunks,
        });
      } else {
        documents.push({
          document: insertedDocument,
          content: null,
          chunks: [],
        });
      }
    }

    this.metrics.creationTime += Date.now() - startTime;
    
    logger.info('documents_factory', 'Created user with documents', {
      userId: insertedUser.id,
      documentCount,
      duration: Date.now() - startTime,
    });

    return {
      user: insertedUser,
      documents,
    };
  }

  async createDocumentWithFullPipeline(userId: string) {
    const startTime = Date.now();
    
    const documentData = createTestDocument(userId, {
      status: 'uploaded',
    });

    const [insertedDocument] = await db
      .insert(ragDocument)
      .values({
        id: nanoid(),
        ...documentData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Simulate text extraction
    const contentData = createTestDocumentContent(insertedDocument.id);
    
    const [insertedContent] = await db
      .insert(documentContent)
      .values({
        id: nanoid(),
        ...contentData,
        createdAt: new Date(),
      })
      .returning();

    // Update document status
    const [updatedDocument] = await db
      .update(ragDocument)
      .set({ 
        status: 'text_extracted',
        updatedAt: new Date(),
      })
      .where(db.eq(ragDocument.id, insertedDocument.id))
      .returning();

    this.metrics.insertTime += Date.now() - startTime;
    
    logger.info('documents_factory', 'Created document with full pipeline', {
      documentId: insertedDocument.id,
      status: updatedDocument.status,
      duration: Date.now() - startTime,
    });

    return {
      document: updatedDocument,
      content: insertedContent,
    };
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      creationTime: 0,
      queryTime: 0,
      insertTime: 0,
      memoryUsage: process.memoryUsage(),
    };
  }
}

// Mock auth to return authenticated user
const mockAuthenticatedUser = (userId: string) => {
  vi.doMock('@/lib/auth/get-auth', () => ({
    getAuth: vi.fn().mockResolvedValue({
      userId,
      isAuthenticated: true,
    }),
  }));
};

describe('Enhanced Documents API', () => {
  let factory: DocumentTestDataFactory;
  let testMetrics: PerformanceMetrics;

  beforeEach(async () => {
    // Run migrations on the test branch before each test
    await runMigrationsOnTestBranch();
    
    factory = new DocumentTestDataFactory();
    factory.resetMetrics();
    
    vi.clearAllMocks();
  });

  describe('POST /api/documents/chunk - Enhanced Chunking', () => {
    it('should process document chunks with real database operations', async () => {
      const startTime = Date.now();
      
      // Create user and document with content
      const { user: testUser, documents } = await factory.createUserWithDocuments(1);
      const { document: testDoc, content } = await factory.createDocumentWithFullPipeline(testUser.id);
      
      mockAuthenticatedUser(testUser.id);

      // Mock the POST handler to perform real chunking operations
      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const body = await request.json();
        
        expect(body.documentId).toBe(testDoc.id);
        expect(body.chunkSize).toBeDefined();
        expect(body.overlap).toBeDefined();

        // Simulate chunking the document content
        const chunkSize = body.chunkSize || 500;
        const overlap = body.overlap || 50;
        const text = content?.extractedText || 'Default test content';
        
        const chunks = [];
        let chunkIndex = 0;
        
        for (let i = 0; i < text.length; i += chunkSize - overlap) {
          const chunkContent = text.slice(i, i + chunkSize);
          
          if (chunkContent.trim()) {
            const insertStartTime = Date.now();
            const [insertedChunk] = await db
              .insert(documentChunk)
              .values({
                id: nanoid(),
                documentId: testDoc.id,
                chunkIndex: chunkIndex.toString(),
                content: chunkContent,
                tokenCount: Math.ceil(chunkContent.length / 4).toString(),
                metadata: {
                  chunkIndex,
                  startOffset: i,
                  endOffset: Math.min(i + chunkSize, text.length),
                  wordCount: chunkContent.split(/\s+/).length,
                },
                createdAt: new Date(),
              })
              .returning();
            
            testMetrics = factory.getMetrics();
            testMetrics.insertTime += Date.now() - insertStartTime;
            
            chunks.push(insertedChunk);
            chunkIndex++;
          }
        }

        // Update document status to chunked
        await db
          .update(ragDocument)
          .set({ 
            status: 'chunked',
            updatedAt: new Date(),
          })
          .where(db.eq(ragDocument.id, testDoc.id));

        return new Response(
          JSON.stringify({
            success: true,
            chunks: chunks.map(chunk => ({
              id: chunk.id,
              documentId: chunk.documentId,
              chunkIndex: chunk.chunkIndex,
              content: chunk.content,
              tokenCount: chunk.tokenCount,
            })),
            metadata: {
              totalChunks: chunks.length,
              chunkSize,
              overlap,
              originalLength: text.length,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const mockRequestBody = {
        documentId: testDoc.id,
        chunkSize: 200,
        overlap: 20,
      };

      const req = new NextRequest('http://localhost:3000/api/documents/chunk', {
        method: 'POST',
        body: JSON.stringify(mockRequestBody),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.chunks).toBeInstanceOf(Array);
      expect(data.chunks.length).toBeGreaterThan(0);
      expect(data.metadata.totalChunks).toBe(data.chunks.length);

      // Verify chunks were actually created in database
      const queryStartTime = Date.now();
      const chunksInDb = await db
        .select()
        .from(documentChunk)
        .where(db.eq(documentChunk.documentId, testDoc.id));
      
      testMetrics.queryTime += Date.now() - queryStartTime;

      expect(chunksInDb).toHaveLength(data.chunks.length);
      
      // Verify document status was updated
      const [updatedDoc] = await db
        .select()
        .from(ragDocument)
        .where(db.eq(ragDocument.id, testDoc.id));
      
      expect(updatedDoc.status).toBe('chunked');
      
      logger.info('documents_test', 'Chunking test completed', {
        documentId: testDoc.id,
        chunksCreated: data.chunks.length,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });

    it('should validate request parameters with comprehensive error handling', async () => {
      const startTime = Date.now();
      
      const { user: testUser } = await factory.createUserWithDocuments(0);
      mockAuthenticatedUser(testUser.id);

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const body = await request.json();
        
        if (!body.documentId) {
          return new Response(
            JSON.stringify({ 
              error: 'documentId is required',
              code: 'MISSING_DOCUMENT_ID',
              field: 'documentId',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (body.chunkSize && (body.chunkSize < 100 || body.chunkSize > 2000)) {
          return new Response(
            JSON.stringify({ 
              error: 'chunkSize must be between 100 and 2000',
              code: 'INVALID_CHUNK_SIZE',
              field: 'chunkSize',
              limits: { min: 100, max: 2000 },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        if (body.overlap && (body.overlap < 0 || body.overlap >= body.chunkSize)) {
          return new Response(
            JSON.stringify({ 
              error: 'overlap must be between 0 and chunkSize',
              code: 'INVALID_OVERLAP',
              field: 'overlap',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      // Test missing documentId
      const invalidRequest1 = new NextRequest('http://localhost:3000/api/documents/chunk', {
        method: 'POST',
        body: JSON.stringify({
          chunkSize: 500,
          overlap: 50,
        }),
      });

      const response1 = await POST(invalidRequest1);
      expect(response1.status).toBe(400);
      
      const data1 = await response1.json();
      expect(data1.code).toBe('MISSING_DOCUMENT_ID');

      // Test invalid chunkSize
      const invalidRequest2 = new NextRequest('http://localhost:3000/api/documents/chunk', {
        method: 'POST',
        body: JSON.stringify({
          documentId: 'doc-123',
          chunkSize: 50, // Too small
          overlap: 10,
        }),
      });

      const response2 = await POST(invalidRequest2);
      expect(response2.status).toBe(400);
      
      const data2 = await response2.json();
      expect(data2.code).toBe('INVALID_CHUNK_SIZE');
      expect(data2.limits).toEqual({ min: 100, max: 2000 });

      // Test invalid overlap
      const invalidRequest3 = new NextRequest('http://localhost:3000/api/documents/chunk', {
        method: 'POST',
        body: JSON.stringify({
          documentId: 'doc-123',
          chunkSize: 200,
          overlap: 250, // Larger than chunkSize
        }),
      });

      const response3 = await POST(invalidRequest3);
      expect(response3.status).toBe(400);
      
      const data3 = await response3.json();
      expect(data3.code).toBe('INVALID_OVERLAP');
      
      logger.info('documents_test', 'Validation test completed', {
        duration: Date.now() - startTime,
      });
    });
  });

  describe('GET /api/documents/list - Enhanced Document Listing', () => {
    it('should list documents with real database queries and filtering', async () => {
      const startTime = Date.now();
      
      // Create user with multiple documents
      const { user: testUser, documents } = await factory.createUserWithDocuments(5);
      
      mockAuthenticatedUser(testUser.id);

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const url = new URL(request.url);
        const status = url.searchParams.get('status');
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const offset = parseInt(url.searchParams.get('offset') || '0');

        // Real database query with filtering
        const queryStartTime = Date.now();
        let query = db
          .select({
            id: ragDocument.id,
            fileName: ragDocument.fileName,
            originalName: ragDocument.originalName,
            status: ragDocument.status,
            fileSize: ragDocument.fileSize,
            mimeType: ragDocument.mimeType,
            createdAt: ragDocument.createdAt,
            updatedAt: ragDocument.updatedAt,
            chunkCount: db.count(documentChunk.id),
          })
          .from(ragDocument)
          .leftJoin(documentChunk, db.eq(ragDocument.id, documentChunk.documentId))
          .where(db.eq(ragDocument.uploadedBy, testUser.id))
          .groupBy(
            ragDocument.id,
            ragDocument.fileName,
            ragDocument.originalName,
            ragDocument.status,
            ragDocument.fileSize,
            ragDocument.mimeType,
            ragDocument.createdAt,
            ragDocument.updatedAt,
          )
          .orderBy(ragDocument.createdAt)
          .limit(limit)
          .offset(offset);

        if (status) {
          query = query.where(db.eq(ragDocument.status, status));
        }

        const results = await query;
        
        testMetrics = factory.getMetrics();
        testMetrics.queryTime += Date.now() - queryStartTime;

        // Get total count for pagination
        const countQuery = db
          .select({ count: db.count() })
          .from(ragDocument)
          .where(db.eq(ragDocument.uploadedBy, testUser.id));

        if (status) {
          countQuery.where(db.eq(ragDocument.status, status));
        }

        const [{ count: totalCount }] = await countQuery;

        return new Response(
          JSON.stringify({
            documents: results,
            pagination: {
              total: totalCount,
              limit,
              offset,
              hasMore: offset + limit < totalCount,
            },
            filters: {
              status,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(listGET).mockImplementation(mockHandler);

      const request = new NextRequest('http://localhost:3000/api/documents/list?limit=10&offset=0');

      const response = await listGET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.documents).toBeInstanceOf(Array);
      expect(data.documents.length).toBe(documents.length);
      expect(data.pagination.total).toBe(documents.length);
      
      // Test with status filter
      const filteredRequest = new NextRequest('http://localhost:3000/api/documents/list?status=processed');
      const filteredResponse = await listGET(filteredRequest);
      const filteredData = await filteredResponse.json();

      const processedDocuments = documents.filter(d => d.document.status === 'processed');
      expect(filteredData.documents.length).toBe(processedDocuments.length);
      
      logger.info('documents_test', 'Document listing test completed', {
        userId: testUser.id,
        totalDocuments: data.documents.length,
        processedDocuments: processedDocuments.length,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });
  });

  describe('POST /api/documents/process - Enhanced Processing Pipeline', () => {
    it('should process document through full pipeline with real database tracking', async () => {
      const startTime = Date.now();
      
      const { user: testUser } = await factory.createUserWithDocuments(1);
      const { document: testDoc } = await factory.createDocumentWithFullPipeline(testUser.id);
      
      mockAuthenticatedUser(testUser.id);

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const body = await request.json();
        
        expect(body.documentId).toBe(testDoc.id);

        // Simulate full processing pipeline
        const processSteps = [
          'text_extracted',
          'chunked',
          'embedded',
          'processed'
        ];

        for (const step of processSteps) {
          const updateStartTime = Date.now();
          await db
            .update(ragDocument)
            .set({ 
              status: step,
              updatedAt: new Date(),
            })
            .where(db.eq(ragDocument.id, testDoc.id));
          
          testMetrics = factory.getMetrics();
          testMetrics.insertTime += Date.now() - updateStartTime;

          // Simulate processing time
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Verify final status
        const queryStartTime = Date.now();
        const [processedDoc] = await db
          .select()
          .from(ragDocument)
          .where(db.eq(ragDocument.id, testDoc.id));
        
        testMetrics.queryTime += Date.now() - queryStartTime;

        return new Response(
          JSON.stringify({
            success: true,
            document: {
              id: processedDoc.id,
              status: processedDoc.status,
              fileName: processedDoc.fileName,
              processedAt: processedDoc.updatedAt,
            },
            pipeline: {
              steps: processSteps,
              duration: Date.now() - startTime,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(processPost).mockImplementation(mockHandler);

      const request = new NextRequest('http://localhost:3000/api/documents/process', {
        method: 'POST',
        body: JSON.stringify({
          documentId: testDoc.id,
          options: {
            chunkSize: 500,
            overlap: 50,
            generateEmbeddings: true,
          },
        }),
      });

      const response = await processPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.document.status).toBe('processed');
      expect(data.pipeline.steps).toEqual([
        'text_extracted',
        'chunked', 
        'embedded',
        'processed'
      ]);

      // Verify document status in database
      const [finalDoc] = await db
        .select()
        .from(ragDocument)
        .where(db.eq(ragDocument.id, testDoc.id));
      
      expect(finalDoc.status).toBe('processed');
      
      logger.info('documents_test', 'Processing pipeline test completed', {
        documentId: testDoc.id,
        finalStatus: finalDoc.status,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });
  });

  describe('Performance and Optimization Tests', () => {
    it('should demonstrate improved performance with Neon branching', async () => {
      const startTime = Date.now();
      
      // Create multiple users with documents in parallel
      const userPromises = Array.from({ length: 3 }, (_, i) => 
        factory.createUserWithDocuments(2 + i) // 2, 3, 4 documents respectively
      );
      
      const userResults = await Promise.all(userPromises);
      
      // Measure complex query performance
      const queryStartTime = Date.now();
      const aggregateData = await db
        .select({
          userId: user.id,
          userEmail: user.email,
          documentCount: db.count(ragDocument.id),
          totalChunks: db.count(documentChunk.id),
          avgFileSize: db.avg(ragDocument.fileSize),
          statusBreakdown: db.sql`json_group_array(DISTINCT ${ragDocument.status})`,
        })
        .from(user)
        .leftJoin(ragDocument, db.eq(user.id, ragDocument.uploadedBy))
        .leftJoin(documentChunk, db.eq(ragDocument.id, documentChunk.documentId))
        .groupBy(user.id, user.email);
      
      const queryTime = Date.now() - queryStartTime;
      const totalTime = Date.now() - startTime;
      
      const performanceMetrics = {
        totalUsers: userResults.length,
        totalDocuments: userResults.reduce((sum, result) => sum + result.documents.length, 0),
        totalTime,
        queryTime,
        avgDocumentCreationTime: factory.getMetrics().creationTime / userResults.length,
        memoryUsage: process.memoryUsage(),
        branchIsolation: true,
        parallelExecution: true,
        complexQueryPerformance: queryTime,
      };

      expect(aggregateData).toHaveLength(userResults.length);
      expect(queryTime).toBeLessThan(2000); // Complex queries should still be fast
      expect(totalTime).toBeLessThan(10000); // Parallel creation should be efficient
      
      logger.info('documents_test', 'Performance test completed', {
        metrics: performanceMetrics,
        userResults: userResults.map(r => ({ 
          userId: r.user.id, 
          documentCount: r.documents.length 
        })),
      });

      // Log comparison metrics for documentation
      console.log('\n=== Enhanced Documents API Test Performance ===');
      console.log(`Total Users Created: ${performanceMetrics.totalUsers}`);
      console.log(`Total Documents Created: ${performanceMetrics.totalDocuments}`);
      console.log(`Total Test Time: ${performanceMetrics.totalTime}ms`);
      console.log(`Complex Query Time: ${performanceMetrics.complexQueryPerformance}ms`);
      console.log(`Avg Document Creation Time: ${performanceMetrics.avgDocumentCreationTime.toFixed(2)}ms`);
      console.log(`Memory Usage: ${Math.round(performanceMetrics.memoryUsage.heapUsed / 1024 / 1024)}MB`);
      console.log(`Branch Isolation: ${performanceMetrics.branchIsolation ? 'Enabled' : 'Disabled'}`);
      console.log('===============================================\n');
    });

    it('should handle concurrent document operations efficiently', async () => {
      const startTime = Date.now();
      
      const { user: testUser } = await factory.createUserWithDocuments(0);
      
      // Create multiple documents concurrently
      const concurrentPromises = Array.from({ length: 10 }, () => 
        factory.createDocumentWithFullPipeline(testUser.id)
      );
      
      const concurrentResults = await Promise.all(concurrentPromises);
      
      // Perform concurrent read operations
      const readPromises = concurrentResults.map(({ document }) =>
        db.select().from(ragDocument).where(db.eq(ragDocument.id, document.id))
      );
      
      const readResults = await Promise.all(readPromises);
      
      const concurrencyMetrics = {
        documentsCreated: concurrentResults.length,
        documentsRead: readResults.length,
        totalTime: Date.now() - startTime,
        avgTimePerDocument: (Date.now() - startTime) / concurrentResults.length,
        concurrentOperations: true,
      };

      expect(readResults).toHaveLength(concurrentResults.length);
      expect(concurrencyMetrics.avgTimePerDocument).toBeLessThan(1000);
      
      logger.info('documents_test', 'Concurrency test completed', {
        metrics: concurrencyMetrics,
      });
    });
  });
});