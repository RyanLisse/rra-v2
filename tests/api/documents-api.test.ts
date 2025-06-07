import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/documents/chunk/route';
import { db } from '@/lib/db';
import { documentChunk } from '@/lib/db/schema';

// Mock database operations
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([
      {
        id: 'chunk-123',
        documentId: 'doc-123',
        content: 'Test chunk content',
        index: 0,
      },
    ]),
    transaction: vi.fn().mockImplementation((cb) => cb()),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    eq: vi.fn(),
  },
  documentChunk: {
    id: 'id',
    documentId: 'documentId',
    content: 'content',
    index: 'index',
    metadata: 'metadata',
    createdAt: 'createdAt',
  },
}));

// Mock auth to always return authenticated user
vi.mock('@/lib/auth/get-auth', () => ({
  getAuth: vi.fn().mockResolvedValue({
    userId: 'user-123',
    isAuthenticated: true,
  }),
}));

describe('Documents API - Chunking Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process document chunks and return success response', async () => {
    // Create mock request
    const mockRequestBody = {
      documentId: 'doc-123',
      chunkSize: 500,
      overlap: 50,
    };

    const req = new NextRequest('http://localhost:3000/api/documents/chunk', {
      method: 'POST',
      body: JSON.stringify(mockRequestBody),
    });

    // Call the API route handler
    const response = await POST(req);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      chunks: [expect.objectContaining({ id: 'chunk-123' })],
    });

    // Verify database was called correctly
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledWith(documentChunk);
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-123',
      }),
    );
  });

  it('should return 400 for invalid request body', async () => {
    // Create invalid request (missing documentId)
    const mockRequestBody = {
      chunkSize: 500,
      overlap: 50,
    };

    const req = new NextRequest('http://localhost:3000/api/documents/chunk', {
      method: 'POST',
      body: JSON.stringify(mockRequestBody),
    });

    // Call the API route handler
    const response = await POST(req);

    // Verify response
    expect(response.status).toBe(400);
  });
});
