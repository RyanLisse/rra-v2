import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Set environment variables in hoisted block
vi.hoisted(() => {
  process.env.POSTGRES_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.NODE_ENV = 'test';
  process.env.KINDE_CLIENT_ID = 'test-client-id';
  process.env.KINDE_CLIENT_SECRET = 'test-client-secret';
  process.env.KINDE_ISSUER_URL = 'https://test.kinde.com';
  process.env.KINDE_SITE_URL = 'http://localhost:3000';
  process.env.KINDE_POST_LOGOUT_REDIRECT_URL = 'http://localhost:3000';
  process.env.KINDE_POST_LOGIN_REDIRECT_URL = 'http://localhost:3000';
});

// Mock the database module completely in hoisted block
const mockDb = vi.hoisted(() => ({
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue([]),
      }),
    }),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
  delete: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
  query: {
    ragDocument: {
      findFirst: vi.fn(),
    },
  },
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/config', () => ({
  db: mockDb,
}));

vi.mock('@/lib/db/index', () => ({
  db: mockDb,
}));
vi.mock('@/lib/document-processing/document-processor');
vi.mock('@/lib/document-processing/status-manager');
vi.mock('node:fs/promises');
vi.mock('@/lib/auth', () => ({
  withAuth: (handler: any) => handler,
}));
vi.mock('@/lib/auth/config', () => ({
  auth: {
    handler: vi.fn(),
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock Kinde auth
vi.mock('@kinde-oss/kinde-auth-nextjs/server', () => ({
  getKindeServerSession: vi.fn(() => ({
    getUser: vi.fn(() => ({
      id: 'test-user-id',
      email: 'test@example.com',
      given_name: 'Test',
      family_name: 'User',
      picture: null,
    })),
    isAuthenticated: vi.fn(() => true),
  })),
}));

// Use global dynamic mocks from test-setup instead of static mocks


import { POST } from '@/app/api/documents/extract-text/route';
import { DocumentProcessor } from '@/lib/document-processing/document-processor';
import { DocumentStatusManager } from '@/lib/document-processing/status-manager';
import * as fs from 'node:fs/promises';
import { db } from '@/lib/db';

const mockedDb = vi.mocked(db);
const mockDocumentProcessor = vi.mocked(DocumentProcessor);
const mockDocumentStatusManager = vi.mocked(DocumentStatusManager);
const mockFs = vi.mocked(fs);

describe('/api/documents/extract-text', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
    },
  };

  const mockDocument = {
    id: 'doc-123',
    fileName: 'test-document.pdf',
    filePath: '/uploads/test-document.pdf',
    mimeType: 'application/pdf',
    uploadedBy: 'user-123',
    status: 'uploaded',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockStatusManager = {
    startStep: vi.fn(),
    updateStepProgress: vi.fn(),
    completeStep: vi.fn(),
    failStep: vi.fn(),
  };

  const mockProcessor = {
    processDocument: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockDocumentStatusManager.create.mockResolvedValue(
      mockStatusManager as any,
    );
    mockDocumentProcessor.mockImplementation(() => mockProcessor as any);

    // Mock database transaction
    mockedDb.transaction = vi.fn().mockImplementation(async (callback) => {
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return callback(mockTx);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/documents/extract-text', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  describe('Request Validation', () => {
    it('should return 400 when documentId is missing', async () => {
      const request = createRequest({});

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Document ID is required');
    });

    it('should return 400 when documentId is not a string', async () => {
      const request = createRequest({ documentId: 123 });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Document ID is required');
    });
  });

  describe('Document Retrieval and Authorization', () => {
    it('should return 404 when document is not found', async () => {
      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as any;

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Document not found');
    });

    it('should return 403 when user does not own the document', async () => {
      const documentOwnedByOther = {
        ...mockDocument,
        uploadedBy: 'other-user-456',
      };

      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(documentOwnedByOther),
        },
      } as any;

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Access denied');
    });

    it('should return 400 when document is not in uploaded status', async () => {
      const processedDocument = {
        ...mockDocument,
        status: 'text_extracted',
      };

      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(processedDocument),
        },
      } as any;

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe(
        "Document is in text_extracted status, expected 'uploaded'",
      );
    });
  });

  describe('Text Extraction Process', () => {
    beforeEach(() => {
      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(mockDocument),
        },
      } as any;
    });

    it('should successfully extract text and save to file and database', async () => {
      const extractionResult = {
        success: true,
        text: 'Extracted text content from PDF',
        metadata: {
          pageCount: 5,
          charCount: 1000,
          wordCount: 200,
          confidence: 0.95,
          processingTime: 2500,
          language: 'en',
          warnings: [],
        },
      };

      mockProcessor.processDocument.mockResolvedValue(extractionResult);
      mockFs.writeFile.mockResolvedValue();

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Text extracted successfully');
      expect(data.documentId).toBe('doc-123');
      expect(data.stats.pages).toBe(5);
      expect(data.stats.characters).toBe(1000);
      expect(data.stats.confidence).toBe(0.95);

      // Verify status manager calls
      expect(mockStatusManager.startStep).toHaveBeenCalledWith(
        'text_extraction',
      );
      expect(mockStatusManager.updateStepProgress).toHaveBeenCalledWith(
        'text_extraction',
        25,
        'Processing document...',
      );
      expect(mockStatusManager.updateStepProgress).toHaveBeenCalledWith(
        'text_extraction',
        75,
        'Saving extracted text...',
      );
      expect(mockStatusManager.completeStep).toHaveBeenCalledWith(
        'text_extraction',
        expect.objectContaining({
          textLength: extractionResult.text.length,
          confidence: 0.95,
          processingTime: 2500,
        }),
      );

      // Verify file write
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-document.txt'),
        extractionResult.text,
      );

      // Verify database transaction was called
      expect(mockedDb.transaction).toHaveBeenCalled();
    });

    it('should handle text extraction failures', async () => {
      const extractionResult = {
        success: false,
        error: 'Failed to parse PDF - corrupted file',
        text: null,
      };

      mockProcessor.processDocument.mockResolvedValue(extractionResult);

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to extract text from document');
      expect(data.details).toBe('Failed to parse PDF - corrupted file');

      // Verify status manager was notified of failure
      expect(mockStatusManager.failStep).toHaveBeenCalledWith(
        'text_extraction',
        'Failed to parse PDF - corrupted file',
      );
    });

    it('should handle processor exceptions', async () => {
      const processingError = new Error('PDF processing timeout');
      mockProcessor.processDocument.mockRejectedValue(processingError);

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to extract text from document');
      expect(data.details).toBe('PDF processing timeout');

      // Verify status manager was notified of failure
      expect(mockStatusManager.failStep).toHaveBeenCalledWith(
        'text_extraction',
        'PDF processing timeout',
      );
    });

    it('should handle file system errors when writing text file', async () => {
      const extractionResult = {
        success: true,
        text: 'Extracted text content',
        metadata: { pageCount: 1, charCount: 100 },
      };

      mockProcessor.processDocument.mockResolvedValue(extractionResult);
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to extract text from document');
      expect(data.details).toBe('Disk full');
    });
  });

  describe('Progress Tracking', () => {
    beforeEach(() => {
      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(mockDocument),
        },
      } as any;
    });

    it('should track progress through all stages', async () => {
      const extractionResult = {
        success: true,
        text: 'Sample text',
        metadata: { pageCount: 1, charCount: 11 },
      };

      mockProcessor.processDocument.mockResolvedValue(extractionResult);
      mockFs.writeFile.mockResolvedValue();

      const request = createRequest({ documentId: 'doc-123' });

      await POST(request, mockSession);

      // Verify progress tracking sequence
      expect(mockStatusManager.startStep).toHaveBeenCalledWith(
        'text_extraction',
      );
      expect(mockStatusManager.updateStepProgress).toHaveBeenNthCalledWith(
        1,
        'text_extraction',
        25,
        'Processing document...',
      );
      expect(mockStatusManager.updateStepProgress).toHaveBeenNthCalledWith(
        2,
        'text_extraction',
        75,
        'Saving extracted text...',
      );
      expect(mockStatusManager.completeStep).toHaveBeenCalledWith(
        'text_extraction',
        expect.any(Object),
      );
    });
  });

  describe('Database Operations', () => {
    beforeEach(() => {
      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(mockDocument),
        },
      } as any;
    });

    it('should store document content in database with metadata', async () => {
      const extractionResult = {
        success: true,
        text: 'Long extracted text content that is longer than 10000 characters '.repeat(
          200,
        ),
        metadata: {
          pageCount: 3,
          charCount: 13800,
          wordCount: 2760,
          confidence: 0.98,
          processingTime: 1500,
          warnings: ['Some formatting lost'],
          language: 'en',
        },
      };

      mockProcessor.processDocument.mockResolvedValue(extractionResult);
      mockFs.writeFile.mockResolvedValue();

      const request = createRequest({ documentId: 'doc-123' });

      await POST(request, mockSession);

      // Verify database transaction was executed
      expect(mockedDb.transaction).toHaveBeenCalled();
    });

    it('should handle database transaction failures', async () => {
      const extractionResult = {
        success: true,
        text: 'Sample text',
        metadata: { pageCount: 1, charCount: 11 },
      };

      mockProcessor.processDocument.mockResolvedValue(extractionResult);
      mockFs.writeFile.mockResolvedValue();

      // Mock database transaction failure
      mockedDb.transaction.mockRejectedValue(
        new Error('Database connection lost'),
      );

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to extract text from document');
      expect(data.details).toBe('Database connection lost');
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(mockDocument),
        },
      } as any;
    });

    it('should handle unexpected errors gracefully', async () => {
      // Simulate an unexpected error in the outer try-catch
      mockDocumentStatusManager.create.mockRejectedValue(
        new Error('Status manager initialization failed'),
      );

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      mockedDb.query = {
        ragDocument: {
          findFirst: vi.fn().mockResolvedValue(mockDocument),
        },
      } as any;
    });

    it('should handle large documents with long processing times', async () => {
      const largeDocumentResult = {
        success: true,
        text: 'Very large document content '.repeat(50000),
        metadata: {
          pageCount: 100,
          charCount: 1350000,
          wordCount: 225000,
          confidence: 0.92,
          processingTime: 45000, // 45 seconds
          warnings: ['Large file processing'],
          language: 'en',
        },
      };

      mockProcessor.processDocument.mockResolvedValue(largeDocumentResult);
      mockFs.writeFile.mockResolvedValue();

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.pages).toBe(100);
      expect(data.stats.characters).toBe(1350000);
      expect(data.stats.processingTime).toBe(45000);
    });

    it('should handle documents with low confidence extraction', async () => {
      const lowConfidenceResult = {
        success: true,
        text: 'Partially extracted text from scanned document',
        metadata: {
          pageCount: 2,
          charCount: 500,
          wordCount: 85,
          confidence: 0.45, // Low confidence
          processingTime: 8000,
          warnings: ['Low OCR confidence', 'Some text may be inaccurate'],
          language: 'en',
        },
      };

      mockProcessor.processDocument.mockResolvedValue(lowConfidenceResult);
      mockFs.writeFile.mockResolvedValue();

      const request = createRequest({ documentId: 'doc-123' });

      const response = await POST(request, mockSession);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.confidence).toBe(0.45);
      expect(data.stats.warnings).toEqual([
        'Low OCR confidence',
        'Some text may be inaccurate',
      ]);
    });
  });
});
