import { describe, it, expect, vi, beforeEach, } from 'vitest';
import { getManagedDocuments, getDocumentDetails, deleteDocument, getDocumentStats } from '@/app/(chat)/documents/actions';
import { db } from '@/lib/db';
import fs from 'node:fs/promises';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    unlink: vi.fn(),
    rmdir: vi.fn(),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Import mocked modules
const { getServerSession } = await import('@/lib/auth');

describe('Document Server Actions', () => {
  const mockUserId = 'user-123';
  const mockSession = { user: { id: mockUserId } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue(mockSession);
  });

  describe('getManagedDocuments', () => {
    it('should return empty array when user is not authenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      
      const result = await getManagedDocuments();
      
      expect(result).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it('should fetch and return documents for authenticated user', async () => {
      const mockDocuments = [
        {
          document: {
            id: 'doc-1',
            originalName: 'test.pdf',
            fileName: 'test.pdf',
            filePath: '/uploads/test.pdf',
            mimeType: 'application/pdf',
            fileSize: '1024000',
            status: 'processed',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-01'),
            uploadedBy: mockUserId,
          },
          content: {
            pageCount: '10',
            extractedText: 'Test content',
          },
        },
      ];

      const mockChunkCount = [{ count: 5 }];

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockDocuments),
      };

      vi.mocked(db.select).mockReturnValueOnce(mockSelectChain as any);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockChunkCount),
      } as any);

      const result = await getManagedDocuments();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'doc-1',
        originalName: 'test.pdf',
        status: 'processed',
        pageCount: 10,
        chunkCount: 5,
        hasContent: true,
      });
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(db.select).mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await getManagedDocuments();

      expect(result).toEqual([]);
    });
  });

  describe('getDocumentDetails', () => {
    it('should return null when user is not authenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      
      const result = await getDocumentDetails('doc-1');
      
      expect(result).toBeNull();
    });

    it('should fetch and return document details with chunks', async () => {
      const mockDocument = {
        document: {
          id: 'doc-1',
          originalName: 'test.pdf',
          fileName: 'test.pdf',
          filePath: '/uploads/test.pdf',
          mimeType: 'application/pdf',
          fileSize: '1024000',
          status: 'processed',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          uploadedBy: mockUserId,
        },
        content: {
          extractedText: 'Test content',
          textFilePath: '/uploads/test.txt',
          pageCount: '10',
          metadata: { author: 'Test' },
        },
      };

      const mockChunks = [
        {
          id: 'chunk-1',
          chunkIndex: '0',
          content: 'Chunk content',
          tokenCount: '100',
        },
      ];

      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockDocument]),
      };

      vi.mocked(db.select).mockReturnValueOnce(mockSelectChain as any);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      } as any);
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockChunks),
      } as any);

      const result = await getDocumentDetails('doc-1');

      expect(result).toMatchObject({
        id: 'doc-1',
        originalName: 'test.pdf',
        extractedText: 'Test content',
        chunks: [{
          id: 'chunk-1',
          content: 'Chunk content',
        }],
      });
    });

    it('should return null when document is not found', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      } as any);

      const result = await getDocumentDetails('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('deleteDocument', () => {
    it('should return error when user is not authenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      
      const result = await deleteDocument('doc-1');
      
      expect(result).toEqual({
        success: false,
        message: 'Unauthorized',
      });
    });

    it('should delete document and associated files', async () => {
      const mockDocument = {
        document: {
          id: 'doc-1',
          filePath: '/uploads/test.pdf',
          uploadedBy: mockUserId,
        },
        content: {
          textFilePath: '/uploads/test.txt',
        },
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockDocument]),
      } as any);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      } as any);

      const result = await deleteDocument('doc-1');

      expect(result).toEqual({ success: true });
      expect(fs.unlink).toHaveBeenCalledWith('/uploads/test.pdf');
      expect(fs.unlink).toHaveBeenCalledWith('/uploads/test.txt');
      expect(db.delete).toHaveBeenCalled();
    });

    it('should handle file deletion errors gracefully', async () => {
      const mockDocument = {
        document: {
          id: 'doc-1',
          filePath: '/uploads/test.pdf',
          uploadedBy: mockUserId,
        },
        content: null,
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockDocument]),
      } as any);

      vi.mocked(fs.unlink).mockRejectedValue(new Error('File not found'));
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      } as any);

      const result = await deleteDocument('doc-1');

      expect(result).toEqual({ success: true });
    });
  });

  describe('getDocumentStats', () => {
    it('should return zero stats when user is not authenticated', async () => {
      vi.mocked(getServerSession).mockResolvedValue(null);
      
      const result = await getDocumentStats();
      
      expect(result).toEqual({
        total: 0,
        uploaded: 0,
        processing: 0,
        textExtracted: 0,
        chunked: 0,
        embedded: 0,
        processed: 0,
        error: 0,
      });
    });

    it('should calculate and return document statistics', async () => {
      const mockStats = [
        { status: 'uploaded', count: 2 },
        { status: 'processed', count: 5 },
        { status: 'error', count: 1 },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockResolvedValue(mockStats),
      } as any);

      const result = await getDocumentStats();

      expect(result).toEqual({
        total: 8,
        uploaded: 2,
        processing: 0,
        textExtracted: 0,
        chunked: 0,
        embedded: 0,
        processed: 5,
        error: 1,
      });
    });
  });
});