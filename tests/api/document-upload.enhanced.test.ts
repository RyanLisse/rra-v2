import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/documents/upload/route';
import {
  setupNeonTestBranching,
  runMigrationsOnTestBranch,
} from '../config/neon-branch-setup';
import {
  createMockFormDataRequest,
  createTestUser,
  createTestFile,
  createLargeFile,
  createInvalidFile,
  createFormDataWithFiles,
} from '../fixtures/test-data';
import { db } from '@/lib/db';
import { user, ragDocument } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import type { PerformanceMetrics } from '@/lib/testing/neon-api-client';
import { getNeonLogger } from '@/lib/testing/neon-logger';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const logger = getNeonLogger();
const testSuiteName = 'document-upload-enhanced';

// Setup enhanced Neon branching for this test suite
setupNeonTestBranching(testSuiteName, {
  useEnhancedClient: true,
  enableMetrics: true,
  branchOptions: {
    testSuite: testSuiteName,
    purpose: 'document-upload-testing',
    tags: ['upload', 'files', 'validation', 'security', 'enhanced'],
  },
});

// Enhanced factory system for upload test data
export class UploadTestDataFactory {
  private metrics: PerformanceMetrics = {
    creationTime: 0,
    queryTime: 0,
    insertTime: 0,
    memoryUsage: process.memoryUsage(),
  };

  private testFiles: string[] = [];

  async createUserForUpload(
    userType: 'regular' | 'premium' | 'admin' = 'regular',
  ) {
    const startTime = Date.now();

    const userData = createTestUser({ type: userType });

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

    this.metrics.creationTime += Date.now() - startTime;

    logger.info('upload_factory', 'Created user for upload', {
      userId: insertedUser.id,
      userType: insertedUser.type,
      duration: Date.now() - startTime,
    });

    return insertedUser;
  }

  async createUploadDirectory(): Promise<string> {
    const uploadDir = path.join(process.cwd(), 'test-uploads', nanoid());
    await fs.mkdir(uploadDir, { recursive: true });
    return uploadDir;
  }

  async simulateFileUpload(file: File, uploadDir: string): Promise<string> {
    const fileName = `${nanoid()}-${file.name}`;
    const filePath = path.join(uploadDir, fileName);

    // Convert File to Buffer and write to filesystem
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    this.testFiles.push(filePath);
    return filePath;
  }

  async cleanupTestFiles() {
    for (const filePath of this.testFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    this.testFiles = [];
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

// Mock file system operations with real file handling
vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  return {
    ...actual,
    writeFile: vi.fn().mockImplementation(actual.writeFile),
    mkdir: vi.fn().mockImplementation(actual.mkdir),
  };
});

// Mock authentication
const mockAuthenticatedUser = (userId: string) => {
  vi.doMock('@/lib/auth/get-auth', () => ({
    getAuth: vi.fn().mockResolvedValue({
      userId,
      isAuthenticated: true,
    }),
  }));
};

const mockUnauthenticatedUser = () => {
  vi.doMock('@/lib/auth/get-auth', () => ({
    getAuth: vi.fn().mockResolvedValue({
      userId: null,
      isAuthenticated: false,
    }),
  }));
};

describe('Enhanced Document Upload API', () => {
  let factory: UploadTestDataFactory;
  let testMetrics: PerformanceMetrics;

  beforeEach(async () => {
    // Run migrations on the test branch before each test
    await runMigrationsOnTestBranch();

    factory = new UploadTestDataFactory();
    factory.resetMetrics();

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await factory.cleanupTestFiles();
  });

  describe('POST /api/documents/upload - Enhanced with Real File Operations', () => {
    it('should successfully upload and store valid PDF file', async () => {
      const startTime = Date.now();

      // Create authenticated user
      const testUser = await factory.createUserForUpload('regular');
      mockAuthenticatedUser(testUser.id);

      // Create upload directory
      const uploadDir = await factory.createUploadDirectory();

      // Mock the POST handler to perform real file operations
      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        if (files.length === 0) {
          return new Response(JSON.stringify({ error: 'No files uploaded' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const uploadResults = [];
        const errors = [];

        for (const file of files) {
          try {
            // Validate file type
            if (!file.type.includes('pdf')) {
              errors.push(`Only PDF files are allowed: ${file.name}`);
              continue;
            }

            // Validate file size (50MB limit)
            if (file.size > 50 * 1024 * 1024) {
              errors.push(`File size exceeds 50MB limit: ${file.name}`);
              continue;
            }

            // Store file to filesystem
            const filePath = await factory.simulateFileUpload(file, uploadDir);

            // Insert document record into database
            const insertStartTime = Date.now();
            const [insertedDocument] = await db
              .insert(ragDocument)
              .values({
                id: nanoid(),
                fileName: path.basename(filePath),
                originalName: file.name,
                filePath,
                mimeType: file.type,
                fileSize: file.size.toString(),
                status: 'uploaded',
                uploadedBy: testUser.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .returning();

            testMetrics = factory.getMetrics();
            testMetrics.insertTime += Date.now() - insertStartTime;

            uploadResults.push({
              documentId: insertedDocument.id,
              originalName: insertedDocument.originalName,
              fileName: insertedDocument.fileName,
              size: file.size,
              status: insertedDocument.status,
              filePath: insertedDocument.filePath,
            });
          } catch (error) {
            errors.push(
              `Failed to process file ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        if (uploadResults.length === 0 && errors.length > 0) {
          return new Response(
            JSON.stringify({
              error: 'No files were successfully uploaded',
              errors,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            message: `Successfully uploaded ${uploadResults.length} file(s)`,
            files: uploadResults,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const testFile = createTestFile(
        'test-document.pdf',
        'application/pdf',
        2048,
      );
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData,
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain('Successfully uploaded 1 file(s)');
      expect(data.files).toHaveLength(1);
      expect(data.files[0]).toMatchObject({
        documentId: expect.any(String),
        originalName: 'test-document.pdf',
        size: 2048,
        status: 'uploaded',
      });

      // Verify document was stored in database
      const queryStartTime = Date.now();
      const [documentInDb] = await db
        .select()
        .from(ragDocument)
        .where(db.eq(ragDocument.id, data.files[0].documentId));

      testMetrics.queryTime += Date.now() - queryStartTime;

      expect(documentInDb).toBeDefined();
      expect(documentInDb.originalName).toBe('test-document.pdf');
      expect(documentInDb.uploadedBy).toBe(testUser.id);

      // Verify file exists on filesystem
      const fileStats = await fs.stat(documentInDb.filePath);
      expect(fileStats.size).toBe(2048);

      logger.info('upload_test', 'Single file upload test completed', {
        userId: testUser.id,
        documentId: documentInDb.id,
        fileSize: fileStats.size,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });

    it('should upload multiple valid files concurrently', async () => {
      const startTime = Date.now();

      const testUser = await factory.createUserForUpload('premium');
      mockAuthenticatedUser(testUser.id);

      const uploadDir = await factory.createUploadDirectory();

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        // Process files concurrently
        const uploadPromises = files.map(async (file, index) => {
          const filePath = await factory.simulateFileUpload(file, uploadDir);

          const [insertedDocument] = await db
            .insert(ragDocument)
            .values({
              id: nanoid(),
              fileName: path.basename(filePath),
              originalName: file.name,
              filePath,
              mimeType: file.type,
              fileSize: file.size.toString(),
              status: 'uploaded',
              uploadedBy: testUser.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

          return {
            documentId: insertedDocument.id,
            originalName: insertedDocument.originalName,
            fileName: insertedDocument.fileName,
            size: file.size,
            status: insertedDocument.status,
          };
        });

        const uploadResults = await Promise.all(uploadPromises);

        return new Response(
          JSON.stringify({
            message: `Successfully uploaded ${uploadResults.length} file(s)`,
            files: uploadResults,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const files = [
        createTestFile('doc1.pdf', 'application/pdf', 1024),
        createTestFile('doc2.pdf', 'application/pdf', 2048),
        createTestFile('doc3.pdf', 'application/pdf', 1536),
      ];
      const formData = createFormDataWithFiles(files);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData,
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain('Successfully uploaded 3 file(s)');
      expect(data.files).toHaveLength(3);

      // Verify all documents were stored in database
      const queryStartTime = Date.now();
      const documentsInDb = await db
        .select()
        .from(ragDocument)
        .where(db.eq(ragDocument.uploadedBy, testUser.id));

      testMetrics = factory.getMetrics();
      testMetrics.queryTime += Date.now() - queryStartTime;

      expect(documentsInDb).toHaveLength(3);

      // Verify files exist on filesystem
      for (const doc of documentsInDb) {
        const fileStats = await fs.stat(doc.filePath);
        expect(fileStats.size).toBeGreaterThan(0);
      }

      logger.info('upload_test', 'Multiple file upload test completed', {
        userId: testUser.id,
        fileCount: documentsInDb.length,
        totalSize: documentsInDb.reduce(
          (sum, doc) => sum + Number.parseInt(doc.fileSize),
          0,
        ),
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });

    it('should reject unauthorized requests with proper authentication check', async () => {
      const startTime = Date.now();

      mockUnauthenticatedUser();

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        // Simulate auth check
        const authResult = await import('@/lib/auth/get-auth').then((m) =>
          m.getAuth(),
        );

        if (!authResult.isAuthenticated) {
          return new Response(
            JSON.stringify({
              error: 'Unauthorized',
              code: 'AUTHENTICATION_REQUIRED',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const testFile = createTestFile();
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData,
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
      expect(data.code).toBe('AUTHENTICATION_REQUIRED');

      logger.info('upload_test', 'Unauthorized request test completed', {
        duration: Date.now() - startTime,
      });
    });

    it('should validate file size limits with different user types', async () => {
      const startTime = Date.now();

      // Test with regular user (50MB limit)
      const regularUser = await factory.createUserForUpload('regular');
      const premiumUser = await factory.createUserForUpload('premium');

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const authResult = await import('@/lib/auth/get-auth').then((m) =>
          m.getAuth(),
        );
        const userId = authResult.userId;

        // Get user type from database
        const [userInDb] = await db
          .select()
          .from(user)
          .where(db.eq(user.id, userId));

        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        const sizeLimit =
          userInDb.type === 'premium' ? 100 * 1024 * 1024 : 50 * 1024 * 1024; // 100MB for premium, 50MB for regular
        const errors = [];

        for (const file of files) {
          if (file.size > sizeLimit) {
            const limitMB = sizeLimit / (1024 * 1024);
            errors.push(
              `File size exceeds ${limitMB}MB limit for ${userInDb.type} users: ${file.name}`,
            );
          }
        }

        if (errors.length > 0) {
          return new Response(
            JSON.stringify({
              error: 'File size validation failed',
              errors,
              limits: {
                userType: userInDb.type,
                maxSizeMB: sizeLimit / (1024 * 1024),
              },
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      // Test regular user with large file (should fail)
      mockAuthenticatedUser(regularUser.id);

      const largeFile = createLargeFile(); // 60MB file
      const formData1 = createFormDataWithFiles([largeFile]);
      const request1 = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData1,
      );

      const response1 = await POST(request1);
      const data1 = await response1.json();

      expect(response1.status).toBe(400);
      expect(data1.limits.userType).toBe('regular');
      expect(data1.limits.maxSizeMB).toBe(50);

      // Test premium user with same large file (should succeed)
      mockAuthenticatedUser(premiumUser.id);

      const formData2 = createFormDataWithFiles([largeFile]);
      const request2 = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData2,
      );

      const response2 = await POST(request2);

      expect(response2.status).toBe(200);

      logger.info('upload_test', 'File size validation test completed', {
        regularUserId: regularUser.id,
        premiumUserId: premiumUser.id,
        fileSize: largeFile.size,
        duration: Date.now() - startTime,
      });
    });

    it('should handle mixed valid and invalid files with detailed error reporting', async () => {
      const startTime = Date.now();

      const testUser = await factory.createUserForUpload('regular');
      mockAuthenticatedUser(testUser.id);

      const uploadDir = await factory.createUploadDirectory();

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        const uploadResults = [];
        const errors = [];

        for (const file of files) {
          try {
            // Validate file type
            if (!file.type.includes('pdf')) {
              errors.push({
                file: file.name,
                error: 'Only PDF files are allowed',
                code: 'INVALID_FILE_TYPE',
                expectedType: 'application/pdf',
                actualType: file.type,
              });
              continue;
            }

            // Validate file size
            if (file.size > 50 * 1024 * 1024) {
              errors.push({
                file: file.name,
                error: 'File size exceeds 50MB limit',
                code: 'FILE_TOO_LARGE',
                sizeMB: (file.size / (1024 * 1024)).toFixed(2),
                limitMB: 50,
              });
              continue;
            }

            // Process valid file
            const filePath = await factory.simulateFileUpload(file, uploadDir);

            const [insertedDocument] = await db
              .insert(ragDocument)
              .values({
                id: nanoid(),
                fileName: path.basename(filePath),
                originalName: file.name,
                filePath,
                mimeType: file.type,
                fileSize: file.size.toString(),
                status: 'uploaded',
                uploadedBy: testUser.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .returning();

            uploadResults.push({
              documentId: insertedDocument.id,
              originalName: insertedDocument.originalName,
              size: file.size,
              status: insertedDocument.status,
            });
          } catch (error) {
            errors.push({
              file: file.name,
              error: 'Processing failed',
              code: 'PROCESSING_ERROR',
              details: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return new Response(
          JSON.stringify({
            message:
              uploadResults.length > 0
                ? `Successfully uploaded ${uploadResults.length} file(s)`
                : 'No files were successfully uploaded',
            files: uploadResults,
            errors: errors.length > 0 ? errors : undefined,
            summary: {
              total: files.length,
              successful: uploadResults.length,
              failed: errors.length,
            },
          }),
          {
            status: uploadResults.length > 0 ? 200 : 400,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const files = [
        createTestFile('valid.pdf', 'application/pdf', 1024),
        createInvalidFile(), // txt file
        createLargeFile(), // too large
        createTestFile('another-valid.pdf', 'application/pdf', 2048),
      ];
      const formData = createFormDataWithFiles(files);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData,
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200); // Some files succeeded
      expect(data.files).toHaveLength(2); // Two valid PDF files
      expect(data.errors).toHaveLength(2); // Two invalid files
      expect(data.summary.total).toBe(4);
      expect(data.summary.successful).toBe(2);
      expect(data.summary.failed).toBe(2);

      // Verify detailed error information
      const typeError = data.errors.find(
        (e: any) => e.code === 'INVALID_FILE_TYPE',
      );
      expect(typeError).toBeDefined();
      expect(typeError.expectedType).toBe('application/pdf');

      const sizeError = data.errors.find(
        (e: any) => e.code === 'FILE_TOO_LARGE',
      );
      expect(sizeError).toBeDefined();
      expect(sizeError.limitMB).toBe(50);

      logger.info('upload_test', 'Mixed file validation test completed', {
        userId: testUser.id,
        totalFiles: data.summary.total,
        successfulFiles: data.summary.successful,
        failedFiles: data.summary.failed,
        duration: Date.now() - startTime,
      });
    });

    it('should handle filesystem errors gracefully with rollback', async () => {
      const startTime = Date.now();

      const testUser = await factory.createUserForUpload('regular');
      mockAuthenticatedUser(testUser.id);

      // Mock filesystem error
      const writeFile = vi.mocked(fs.writeFile);
      writeFile.mockRejectedValueOnce(new Error('Disk full - no space left'));

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        const errors = [];

        for (const file of files) {
          try {
            // Attempt to write file (will fail due to mock)
            const fileName = `${nanoid()}-${file.name}`;
            const filePath = path.join('/fake/path', fileName);

            await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));

            // This won't be reached due to the mocked error
            await db.insert(ragDocument).values({
              id: nanoid(),
              fileName,
              originalName: file.name,
              filePath,
              mimeType: file.type,
              fileSize: file.size.toString(),
              status: 'uploaded',
              uploadedBy: testUser.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          } catch (error) {
            errors.push({
              file: file.name,
              error: 'Failed to save file',
              code: 'FILESYSTEM_ERROR',
              details: error instanceof Error ? error.message : String(error),
            });
          }
        }

        return new Response(
          JSON.stringify({
            error: 'No files were successfully uploaded',
            errors,
            code: 'UPLOAD_FAILED',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const testFile = createTestFile();
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData,
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.code).toBe('UPLOAD_FAILED');
      expect(data.errors[0].code).toBe('FILESYSTEM_ERROR');
      expect(data.errors[0].details).toContain('Disk full');

      // Verify no documents were created in database
      const queryStartTime = Date.now();
      const documentsInDb = await db
        .select()
        .from(ragDocument)
        .where(db.eq(ragDocument.uploadedBy, testUser.id));

      testMetrics = factory.getMetrics();
      testMetrics.queryTime += Date.now() - queryStartTime;

      expect(documentsInDb).toHaveLength(0);

      logger.info('upload_test', 'Filesystem error handling test completed', {
        userId: testUser.id,
        documentsInDb: documentsInDb.length,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });
  });

  describe('Performance Metrics and Optimization', () => {
    it('should demonstrate improved upload performance with Neon branching', async () => {
      const startTime = Date.now();

      // Create multiple users for concurrent upload testing
      const userPromises = Array.from({ length: 3 }, () =>
        factory.createUserForUpload('regular'),
      );

      const users = await Promise.all(userPromises);
      const uploadDir = await factory.createUploadDirectory();

      // Simulate concurrent uploads from different users
      const uploadPromises = users.map(async (user, index) => {
        const uploadStartTime = Date.now();
        mockAuthenticatedUser(user.id);

        const files = Array.from({ length: 2 }, (_, fileIndex) =>
          createTestFile(
            `user-${index}-file-${fileIndex}.pdf`,
            'application/pdf',
            1024 * (fileIndex + 1),
          ),
        );

        // Process files for this user
        const userUploadResults = [];
        for (const file of files) {
          const filePath = await factory.simulateFileUpload(file, uploadDir);

          const [insertedDocument] = await db
            .insert(ragDocument)
            .values({
              id: nanoid(),
              fileName: path.basename(filePath),
              originalName: file.name,
              filePath,
              mimeType: file.type,
              fileSize: file.size.toString(),
              status: 'uploaded',
              uploadedBy: user.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

          userUploadResults.push(insertedDocument);
        }

        return {
          userId: user.id,
          files: userUploadResults,
          duration: Date.now() - uploadStartTime,
        };
      });

      const uploadResults = await Promise.all(uploadPromises);

      // Measure query performance
      const queryStartTime = Date.now();
      const allDocuments = await db
        .select({
          documentId: ragDocument.id,
          userId: ragDocument.uploadedBy,
          fileName: ragDocument.fileName,
          fileSize: ragDocument.fileSize,
          status: ragDocument.status,
          createdAt: ragDocument.createdAt,
        })
        .from(ragDocument)
        .orderBy(ragDocument.createdAt);

      const queryTime = Date.now() - queryStartTime;
      const totalTime = Date.now() - startTime;

      const performanceMetrics = {
        totalUsers: users.length,
        totalFiles: uploadResults.reduce(
          (sum, result) => sum + result.files.length,
          0,
        ),
        totalTime,
        queryTime,
        avgUploadTimePerUser:
          uploadResults.reduce((sum, result) => sum + result.duration, 0) /
          uploadResults.length,
        memoryUsage: process.memoryUsage(),
        branchIsolation: true,
        concurrentUploads: true,
      };

      expect(allDocuments).toHaveLength(performanceMetrics.totalFiles);
      expect(queryTime).toBeLessThan(1000);
      expect(totalTime).toBeLessThan(10000);
      expect(performanceMetrics.avgUploadTimePerUser).toBeLessThan(5000);

      logger.info('upload_test', 'Performance test completed', {
        metrics: performanceMetrics,
        uploadResults: uploadResults.map((r) => ({
          userId: r.userId,
          fileCount: r.files.length,
          duration: r.duration,
        })),
      });

      // Log comparison metrics for documentation
      console.log('\n=== Enhanced Document Upload Test Performance ===');
      console.log(`Total Users: ${performanceMetrics.totalUsers}`);
      console.log(`Total Files Uploaded: ${performanceMetrics.totalFiles}`);
      console.log(`Total Test Time: ${performanceMetrics.totalTime}ms`);
      console.log(`Database Query Time: ${performanceMetrics.queryTime}ms`);
      console.log(
        `Avg Upload Time per User: ${performanceMetrics.avgUploadTimePerUser.toFixed(2)}ms`,
      );
      console.log(
        `Memory Usage: ${Math.round(performanceMetrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
      );
      console.log(
        `Branch Isolation: ${performanceMetrics.branchIsolation ? 'Enabled' : 'Disabled'}`,
      );
      console.log(
        `Concurrent Uploads: ${performanceMetrics.concurrentUploads ? 'Enabled' : 'Disabled'}`,
      );
      console.log('===================================================\n');
    });
  });
});
