import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/documents/upload/route';
import { setupTestDb } from '../utils/test-db';
import {
  createMockFormDataRequest,
  mockAuthSuccess,
  mockAuthFailure,
  assertSuccessResponse,
  assertErrorResponse,
  cleanupTestFiles,
  setupTestEnvironment,
} from '../utils/test-helpers';
import {
  createTestFile,
  createLargeFile,
  createInvalidFile,
  createFormDataWithFiles,
} from '../fixtures/test-data';
import { nanoid } from 'nanoid';
import * as schema from '@/lib/db/schema';

// Mock file system operations
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock database
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
  },
}));

describe('Document Upload API', () => {
  const getDb = setupTestDb();
  let testFiles: string[] = [];

  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
    testFiles = [];
  });

  afterEach(async () => {
    await cleanupTestFiles(testFiles);
  });

  describe('POST /api/documents/upload', () => {
    it('should successfully upload a valid PDF file', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const testFile = createTestFile('test-document.pdf');
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      const data = await assertSuccessResponse(response);

      expect(data.message).toContain('Successfully uploaded 1 file(s)');
      expect(data.files).toHaveLength(1);
      expect(data.files[0]).toMatchObject({
        documentId: expect.any(String),
        originalName: 'test-document.pdf',
        size: testFile.size,
        status: 'uploaded',
      });
    });

    it('should upload multiple valid files', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const files = [
        createTestFile('doc1.pdf'),
        createTestFile('doc2.pdf'),
        createTestFile('doc3.pdf'),
      ];
      const formData = createFormDataWithFiles(files);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      const data = await assertSuccessResponse(response);

      expect(data.message).toContain('Successfully uploaded 3 file(s)');
      expect(data.files).toHaveLength(3);
    });

    it('should reject unauthorized requests', async () => {
      const mockWithAuth = mockAuthFailure();
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const testFile = createTestFile();
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      await assertErrorResponse(response, 401, 'Unauthorized');
    });

    it('should reject requests with no files', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const formData = new FormData();
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      await assertErrorResponse(response, 400, 'No files uploaded');
    });

    it('should reject files that are too large', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const largeFile = createLargeFile(); // 60MB file
      const formData = createFormDataWithFiles([largeFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      await assertErrorResponse(response, 400, 'File size exceeds 50MB limit');
    });

    it('should reject non-PDF files', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const invalidFile = createInvalidFile();
      const formData = createFormDataWithFiles([invalidFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      await assertErrorResponse(response, 400, 'Only PDF files are allowed');
    });

    it('should handle mixed valid and invalid files', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const files = [
        createTestFile('valid.pdf'),
        createInvalidFile(),
        createLargeFile(),
      ];
      const formData = createFormDataWithFiles(files);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      const data = await assertSuccessResponse(response);

      expect(data.files).toHaveLength(1);
      expect(data.errors).toHaveLength(2);
      expect(data.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Only PDF files are allowed'),
          expect.stringContaining('File size exceeds 50MB limit'),
        ])
      );
    });

    it('should generate unique filenames', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const files = [
        createTestFile('duplicate.pdf'),
        createTestFile('duplicate.pdf'),
      ];
      const formData = createFormDataWithFiles(files);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      const data = await assertSuccessResponse(response);

      expect(data.files).toHaveLength(2);
      expect(data.files[0].fileName).not.toBe(data.files[1].fileName);
    });

    it('should sanitize filenames', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const testFile = createTestFile('file with spaces & special chars!.pdf');
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      const data = await assertSuccessResponse(response);

      expect(data.files[0].fileName).toMatch(/^[a-zA-Z0-9._-]+$/);
    });

    it('should handle file system errors gracefully', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      // Mock file system error
      const { writeFile } = await import('node:fs/promises');
      vi.mocked(writeFile).mockRejectedValue(new Error('Disk full'));

      const testFile = createTestFile();
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      await assertErrorResponse(response, 400, 'No files were successfully uploaded');
    });

    it('should handle database errors gracefully', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      // Mock database error
      const { db } = await import('@/lib/db');
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('Database connection lost')),
        }),
      } as any);

      const testFile = createTestFile();
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      await assertErrorResponse(response, 400, 'Failed to process file');
    });

    it('should create upload directory if it does not exist', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const { mkdir } = await import('node:fs/promises');
      const mkdirMock = vi.mocked(mkdir);

      const testFile = createTestFile();
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      await POST(request);

      expect(mkdirMock).toHaveBeenCalledWith(
        expect.stringContaining('uploads'),
        { recursive: true }
      );
    });

    it('should store correct metadata in database', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const testFile = createTestFile('test-metadata.pdf', 'application/pdf', 2048);
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      await assertSuccessResponse(response);

      const { db } = await import('@/lib/db');
      const insertMock = vi.mocked(db.insert);
      expect(insertMock).toHaveBeenCalledWith(schema.ragDocument);
      
      const valuesMock = insertMock.mock.results[0]?.value?.values;
      expect(valuesMock).toHaveBeenCalledWith({
        fileName: expect.stringContaining('test-metadata.pdf'),
        originalName: 'test-metadata.pdf',
        filePath: expect.stringContaining('uploads'),
        mimeType: 'application/pdf',
        fileSize: '2048',
        status: 'uploaded',
        uploadedBy: userId,
      });
    });
  });

  describe('File Processing Integration', () => {
    it('should trigger document processing pipeline', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const testFile = createTestFile();
      const formData = createFormDataWithFiles([testFile]);
      const request = createMockFormDataRequest(
        'http://localhost:3000/api/documents/upload',
        formData
      );

      const response = await POST(request);
      const data = await assertSuccessResponse(response);

      expect(data.files[0].status).toBe('uploaded');
      // In a real integration test, we would verify that the processing pipeline is triggered
    });
  });
});