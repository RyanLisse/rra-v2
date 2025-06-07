/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/documents/upload/route';
import { nanoid } from 'nanoid';

// Mock Inngest client
const mockSendEvent = vi.fn();
vi.mock('@/lib/inngest/client', () => ({
  sendEvent: mockSendEvent,
}));

// Mock file system operations
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock database
const mockInsert = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
  },
}));

// Mock auth
const mockSession = {
  user: { id: 'test-user-id' },
};

vi.mock('@/lib/auth', () => ({
  withAuth: vi.fn().mockImplementation((handler) => {
    return async (request: Request) => {
      return handler(request, mockSession);
    };
  }),
}));

describe('Document Upload API - Inngest Integration', () => {
  const mockDocumentId = 'doc-123';
  const uploadDir = '/test/uploads';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default database mock responses
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: mockDocumentId,
            fileName: 'test-file.pdf',
            originalName: 'test.pdf',
            filePath: `${uploadDir}/test-file.pdf`,
            mimeType: 'application/pdf',
            fileSize: '1024',
            status: 'uploaded',
            uploadedBy: 'test-user-id',
          },
        ]),
      }),
    });

    // Mock successful Inngest event emission
    mockSendEvent.mockResolvedValue({ id: 'event-123' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should emit document.uploaded event after successful upload', async () => {
    // Arrange
    const testFile = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });

    const formData = new FormData();
    formData.append('files', testFile);

    const request = new Request('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    // Act
    const response = await POST(request);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(responseData.message).toContain('Successfully uploaded 1 file(s)');
    
    // Verify Inngest event was emitted
    expect(mockSendEvent).toHaveBeenCalledTimes(1);
    expect(mockSendEvent).toHaveBeenCalledWith('document.uploaded', {
      documentId: mockDocumentId,
      userId: 'test-user-id',
      filePath: `${uploadDir}/test-file.pdf`,
      metadata: {
        originalName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      },
    });
  });

  it('should emit multiple events for multiple file uploads', async () => {
    // Arrange
    const files = [
      new File(['content 1'], 'file1.pdf', { type: 'application/pdf' }),
      new File(['content 2'], 'file2.pdf', { type: 'application/pdf' }),
    ];

    // Mock multiple document insertions
    mockInsert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'doc-1',
              fileName: 'file1.pdf',
              originalName: 'file1.pdf',
              filePath: `${uploadDir}/file1.pdf`,
              mimeType: 'application/pdf',
              fileSize: '1024',
              status: 'uploaded',
              uploadedBy: 'test-user-id',
            },
          ]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'doc-2',
              fileName: 'file2.pdf',
              originalName: 'file2.pdf',
              filePath: `${uploadDir}/file2.pdf`,
              mimeType: 'application/pdf',
              fileSize: '1024',
              status: 'uploaded',
              uploadedBy: 'test-user-id',
            },
          ]),
        }),
      });

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));

    const request = new Request('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    // Act
    const response = await POST(request);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(responseData.message).toContain('Successfully uploaded 2 file(s)');
    
    // Verify both Inngest events were emitted
    expect(mockSendEvent).toHaveBeenCalledTimes(2);
    
    expect(mockSendEvent).toHaveBeenNthCalledWith(1, 'document.uploaded', {
      documentId: 'doc-1',
      userId: 'test-user-id',
      filePath: `${uploadDir}/file1.pdf`,
      metadata: {
        originalName: 'file1.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      },
    });

    expect(mockSendEvent).toHaveBeenNthCalledWith(2, 'document.uploaded', {
      documentId: 'doc-2',
      userId: 'test-user-id',
      filePath: `${uploadDir}/file2.pdf`,
      metadata: {
        originalName: 'file2.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      },
    });
  });

  it('should not emit events if file upload fails', async () => {
    // Arrange - Simulate file upload failure
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('Database error')),
      }),
    });

    const testFile = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });

    const formData = new FormData();
    formData.append('files', testFile);

    const request = new Request('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    // Act
    const response = await POST(request);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(responseData.error).toBe('No files were successfully uploaded');
    
    // Verify no Inngest events were emitted
    expect(mockSendEvent).not.toHaveBeenCalled();
  });

  it('should handle Inngest event emission failure gracefully', async () => {
    // Arrange - Simulate Inngest failure
    mockSendEvent.mockRejectedValue(new Error('Inngest service unavailable'));

    const testFile = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });

    const formData = new FormData();
    formData.append('files', testFile);

    const request = new Request('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    // Act
    const response = await POST(request);
    const responseData = await response.json();

    // Assert - Upload should still succeed even if event emission fails
    expect(response.status).toBe(200);
    expect(responseData.message).toContain('Successfully uploaded 1 file(s)');
    
    // Verify Inngest event was attempted
    expect(mockSendEvent).toHaveBeenCalledTimes(1);
  });

  it('should include correct metadata in the event payload', async () => {
    // Arrange
    const testFile = new File(['test content'], 'test-document.pdf', {
      type: 'application/pdf',
    });

    const formData = new FormData();
    formData.append('files', testFile);

    const request = new Request('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    // Act
    await POST(request);

    // Assert - Verify event payload structure
    expect(mockSendEvent).toHaveBeenCalledWith('document.uploaded', {
      documentId: expect.any(String),
      userId: 'test-user-id',
      filePath: expect.stringContaining('.pdf'),
      metadata: {
        originalName: 'test-document.pdf',
        fileSize: expect.any(Number),
        mimeType: 'application/pdf',
      },
    });
  });

  it('should not emit events for invalid file types', async () => {
    // Arrange - Invalid file type
    const invalidFile = new File(['content'], 'script.js', {
      type: 'application/javascript',
    });

    const formData = new FormData();
    formData.append('files', invalidFile);

    const request = new Request('http://localhost:3000/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    // Act
    const response = await POST(request);
    const responseData = await response.json();

    // Assert
    expect(response.status).toBe(400);
    expect(responseData.errors[0]).toContain('Only PDF, TXT, MD, DOCX, DOC files are allowed');
    
    // Verify no Inngest events were emitted
    expect(mockSendEvent).not.toHaveBeenCalled();
  });
});