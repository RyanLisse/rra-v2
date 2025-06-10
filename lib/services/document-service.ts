/**
 * Document Service
 *
 * Business logic layer for document operations, handling the complete document
 * processing pipeline from upload to embedding generation.
 */

import {
  documentRepository,
  documentChunkRepository,
  userRepository,
} from '@/lib/db/repository';
import type { Document, DocumentChunk } from '@/lib/db/schema';
import {
  createChunkWithADE,
  getChunksByElementType,
  getChunksByPage,
  getDocumentStructure,
  generateEnrichedContext,
  type ADEElementType,
  type BoundingBox,
} from '@/lib/db/ade-helpers';

/**
 * Document creation parameters
 */
export interface CreateDocumentParams {
  userId: string;
  name: string;
  fileSize: number;
  mimeType: string;
  filePath?: string;
  metadata?: any;
}

/**
 * Document chunk creation parameters
 */
export interface CreateDocumentChunkParams {
  documentId: string;
  chunkIndex: string;
  content: string;
  elementType?: ADEElementType;
  pageNumber?: number;
  bbox?: BoundingBox;
  metadata?: any;
  tokenCount?: string;
}

/**
 * Document query options
 */
export interface DocumentQueryOptions {
  limit?: number;
  offset?: number;
  status?: string;
  includeChunks?: boolean;
  userId?: string;
}

/**
 * Document with chunks
 */
export interface DocumentWithChunks extends Document {
  chunks: DocumentChunk[];
  chunkCount: number;
  processingProgress?: number;
}

/**
 * Document processing status
 */
export type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'text_extracted'
  | 'chunked'
  | 'embedded'
  | 'processed'
  | 'failed';

/**
 * Document statistics
 */
export interface DocumentStatistics {
  totalDocuments: number;
  totalChunks: number;
  totalSize: number;
  averageChunksPerDocument: number;
  statusDistribution: Record<DocumentStatus, number>;
  recentUploads: number;
}

/**
 * Document service class
 */
export class DocumentService {
  /**
   * Create a new document
   */
  async createDocument(params: CreateDocumentParams): Promise<Document> {
    // Validate user exists
    const user = await userRepository.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create document
    const document = await documentRepository.create({
      userId: params.userId,
      name: params.name,
      fileSize: params.fileSize,
      mimeType: params.mimeType,
      filePath: params.filePath,
      status: 'uploaded',
      metadata: params.metadata,
    });

    return document;
  }

  /**
   * Get document by ID with optional chunk inclusion
   */
  async getDocumentById(
    documentId: string,
    options?: { includeChunks?: boolean; userId?: string },
  ): Promise<DocumentWithChunks | null> {
    const document = await documentRepository.findById(documentId);
    if (!document) return null;

    // Check authorization if userId provided
    if (options?.userId && document.userId !== options.userId) {
      throw new Error('Unauthorized access to document');
    }

    let chunks: DocumentChunk[] = [];
    if (options?.includeChunks) {
      chunks = await documentChunkRepository.findByDocumentId(documentId);
    }

    return {
      ...document,
      chunks,
      chunkCount: chunks.length,
      processingProgress: this.calculateProcessingProgress(
        document.status as DocumentStatus,
      ),
    };
  }

  /**
   * Get documents for a user
   */
  async getDocumentsByUserId(
    userId: string,
    options?: DocumentQueryOptions,
  ): Promise<DocumentWithChunks[]> {
    const documents = await documentRepository.findByUserId(userId, {
      limit: options?.limit,
    });

    if (!options?.includeChunks) {
      return documents.map((doc) => ({
        ...doc,
        chunks: [],
        chunkCount: 0,
        processingProgress: this.calculateProcessingProgress(
          doc.status as DocumentStatus,
        ),
      }));
    }

    // Load chunks for each document
    const documentsWithChunks = await Promise.all(
      documents.map(async (doc) => {
        const chunks = await documentChunkRepository.findByDocumentId(doc.id);
        return {
          ...doc,
          chunks,
          chunkCount: chunks.length,
          processingProgress: this.calculateProcessingProgress(
            doc.status as DocumentStatus,
          ),
        };
      }),
    );

    return documentsWithChunks;
  }

  /**
   * Update document status
   */
  async updateDocumentStatus(
    documentId: string,
    status: DocumentStatus,
    userId?: string,
  ): Promise<Document> {
    // Check authorization if userId provided
    if (userId) {
      const document = await documentRepository.findById(documentId);
      if (!document || document.userId !== userId) {
        throw new Error('Unauthorized or document not found');
      }
    }

    return await documentRepository.updateStatus(documentId, status);
  }

  /**
   * Add chunk to document
   */
  async addDocumentChunk(
    params: CreateDocumentChunkParams,
  ): Promise<DocumentChunk> {
    // Validate document exists
    const document = await documentRepository.findById(params.documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Create chunk using ADE helpers
    const chunks = await createChunkWithADE({
      documentId: params.documentId,
      chunkIndex: params.chunkIndex,
      content: params.content,
      elementType: params.elementType,
      pageNumber: params.pageNumber,
      bbox: params.bbox,
      metadata: params.metadata,
      tokenCount: params.tokenCount,
    });

    return chunks[0]; // Return the first chunk for backward compatibility
  }

  /**
   * Get document chunks with filtering
   */
  async getDocumentChunks(
    documentId: string,
    options?: {
      elementType?: ADEElementType;
      pageNumber?: number;
      limit?: number;
      userId?: string;
    },
  ): Promise<DocumentChunk[]> {
    // Check authorization if userId provided
    if (options?.userId) {
      const document = await documentRepository.findById(documentId);
      if (!document || document.userId !== options.userId) {
        throw new Error('Unauthorized access to document');
      }
    }

    if (options?.elementType !== undefined) {
      return await getChunksByElementType(documentId, options.elementType);
    }

    if (options?.pageNumber) {
      return await getChunksByPage(documentId, options.pageNumber);
    }

    return await documentChunkRepository.findByDocumentId(documentId, {
      limit: options?.limit,
    });
  }

  /**
   * Get document structure (titles, headers, etc.)
   */
  async getDocumentStructure(
    documentId: string,
    userId?: string,
  ): Promise<{
    titles: DocumentChunk[];
    headers: DocumentChunk[];
    structure: DocumentChunk[];
  }> {
    // Check authorization if userId provided
    if (userId) {
      const document = await documentRepository.findById(documentId);
      if (!document || document.userId !== userId) {
        throw new Error('Unauthorized access to document');
      }
    }

    return await getDocumentStructure(documentId);
  }

  /**
   * Generate enriched context for LLM
   */
  async generateDocumentContext(
    documentId: string,
    options?: {
      includePageNumbers?: boolean;
      includeElementTypes?: boolean;
      includeStructuralContext?: boolean;
      maxChunks?: number;
      userId?: string;
    },
  ): Promise<string> {
    // Check authorization if userId provided
    if (options?.userId) {
      const document = await documentRepository.findById(documentId);
      if (!document || document.userId !== options.userId) {
        throw new Error('Unauthorized access to document');
      }
    }

    return await generateEnrichedContext(documentId, options);
  }

  /**
   * Delete document and all its chunks
   */
  async deleteDocument(documentId: string, userId?: string): Promise<void> {
    // Check authorization if userId provided
    if (userId) {
      const document = await documentRepository.findById(documentId);
      if (!document || document.userId !== userId) {
        throw new Error('Unauthorized or document not found');
      }
    }

    // Delete chunks first (foreign key constraint)
    await documentChunkRepository.deleteByDocumentId(documentId);

    // Delete document
    await documentRepository.delete(documentId);
  }

  /**
   * Get documents by status
   */
  async getDocumentsByStatus(
    status: DocumentStatus,
    options?: { limit?: number; offset?: number },
  ): Promise<Document[]> {
    return await documentRepository.findByStatus(status, options);
  }

  /**
   * Search documents by name or content
   */
  async searchDocuments(
    query: string,
    options?: {
      userId?: string;
      limit?: number;
      searchContent?: boolean;
    },
  ): Promise<DocumentWithChunks[]> {
    let documents: Document[];

    if (options?.userId) {
      documents = await documentRepository.findByUserId(options.userId);
    } else {
      documents = await documentRepository.findMany({ limit: options?.limit });
    }

    // Filter by name
    let filteredDocuments = documents.filter((doc) =>
      doc.name.toLowerCase().includes(query.toLowerCase()),
    );

    // Search content if requested
    if (options?.searchContent) {
      const contentMatches = await Promise.all(
        documents.map(async (doc) => {
          const chunks = await documentChunkRepository.findByDocumentId(doc.id);
          const hasContentMatch = chunks.some((chunk) =>
            chunk.content.toLowerCase().includes(query.toLowerCase()),
          );
          return hasContentMatch ? doc : null;
        }),
      );

      const documentsWithContentMatches = contentMatches.filter(
        (doc) => doc !== null,
      ) as Document[];

      // Combine name and content matches, remove duplicates
      const allMatches = [...filteredDocuments, ...documentsWithContentMatches];
      filteredDocuments = Array.from(
        new Map(allMatches.map((doc) => [doc.id, doc])).values(),
      );
    }

    // Convert to DocumentWithChunks format
    const documentsWithChunks = await Promise.all(
      filteredDocuments.map(async (doc) => {
        const chunks = await documentChunkRepository.findByDocumentId(doc.id);
        return {
          ...doc,
          chunks,
          chunkCount: chunks.length,
          processingProgress: this.calculateProcessingProgress(
            doc.status as DocumentStatus,
          ),
        };
      }),
    );

    return options?.limit
      ? documentsWithChunks.slice(0, options.limit)
      : documentsWithChunks;
  }

  /**
   * Get document statistics
   */
  async getDocumentStatistics(): Promise<DocumentStatistics> {
    const allDocuments = await documentRepository.findMany();
    const allChunks = await documentChunkRepository.findMany();

    const totalDocuments = allDocuments.length;
    const totalChunks = allChunks.length;
    const totalSize = allDocuments.reduce((sum, doc) => sum + doc.fileSize, 0);
    const averageChunksPerDocument =
      totalDocuments > 0 ? totalChunks / totalDocuments : 0;

    // Calculate status distribution
    const statusDistribution: Record<DocumentStatus, number> = {
      uploaded: 0,
      processing: 0,
      text_extracted: 0,
      chunked: 0,
      embedded: 0,
      processed: 0,
      failed: 0,
    };

    allDocuments.forEach((doc) => {
      const status = doc.status as DocumentStatus;
      if (status in statusDistribution) {
        statusDistribution[status]++;
      }
    });

    // Count recent uploads (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentUploads = allDocuments.filter(
      (doc) => doc.createdAt > yesterday,
    ).length;

    return {
      totalDocuments,
      totalChunks,
      totalSize,
      averageChunksPerDocument:
        Math.round(averageChunksPerDocument * 100) / 100,
      statusDistribution,
      recentUploads,
    };
  }

  /**
   * Calculate processing progress percentage
   */
  private calculateProcessingProgress(status: DocumentStatus): number {
    const progressMap: Record<DocumentStatus, number> = {
      uploaded: 10,
      processing: 25,
      text_extracted: 40,
      chunked: 60,
      embedded: 80,
      processed: 100,
      failed: 0,
    };

    return progressMap[status] || 0;
  }

  /**
   * Batch update document status
   */
  async batchUpdateStatus(
    documentIds: string[],
    status: DocumentStatus,
  ): Promise<Document[]> {
    return await Promise.all(
      documentIds.map((id) => documentRepository.updateStatus(id, status)),
    );
  }

  /**
   * Get processing queue (documents not yet processed)
   */
  async getProcessingQueue(): Promise<Document[]> {
    const processingStatuses: DocumentStatus[] = [
      'uploaded',
      'processing',
      'text_extracted',
      'chunked',
      'embedded',
    ];

    const queuedDocuments = await Promise.all(
      processingStatuses.map((status) =>
        documentRepository.findByStatus(status),
      ),
    );

    return queuedDocuments.flat();
  }
}

// Export singleton instance
export const documentService = new DocumentService();
