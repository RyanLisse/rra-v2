/**
 * Migration utilities for syncing data between vector search providers
 * 
 * Provides utilities for migrating documents and embeddings between
 * different vector search providers (e.g., NeonDB <-> OpenAI Vector Store).
 */

import { db } from '@/lib/db';
import { ragDocument, documentChunk, } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { vectorSearchFactory } from './providers/factory';
import type { VectorSearchProvider, DocumentChunk, IndexingResult } from './types';

export interface MigrationOptions {
  sourceProvider: 'neondb' | 'openai';
  targetProvider: 'neondb' | 'openai';
  userId?: string;
  documentIds?: string[];
  batchSize?: number;
  dryRun?: boolean;
}

export interface MigrationResult {
  success: boolean;
  documentsProcessed: number;
  documentsSucceeded: number;
  documentsFailed: number;
  errors: string[];
  timeMs: number;
}

export class VectorMigrationService {
  private sourceProvider: VectorSearchProvider;
  private targetProvider: VectorSearchProvider;

  constructor(sourceProvider: VectorSearchProvider, targetProvider: VectorSearchProvider) {
    this.sourceProvider = sourceProvider;
    this.targetProvider = targetProvider;
  }

  /**
   * Migrate documents from source to target provider
   */
  async migrateDocuments(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    const {
      userId,
      documentIds,
      batchSize = 10,
      dryRun = false,
    } = options;

    const result: MigrationResult = {
      success: false,
      documentsProcessed: 0,
      documentsSucceeded: 0,
      documentsFailed: 0,
      errors: [],
      timeMs: 0,
    };

    try {
      // Get documents to migrate from source (NeonDB for now)
      const documents = await this.getDocumentsToMigrate(userId, documentIds);
      result.documentsProcessed = documents.length;

      if (dryRun) {
        console.log(`Dry run: Would migrate ${documents.length} documents`);
        result.success = true;
        result.timeMs = Date.now() - startTime;
        return result;
      }

      // Process documents in batches
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const batchResults = await this.processBatch(batch);

        for (const batchResult of batchResults) {
          if (batchResult.success) {
            result.documentsSucceeded++;
          } else {
            result.documentsFailed++;
            result.errors.push(...(batchResult.errors || []));
          }
        }

        // Add delay between batches to avoid rate limiting
        if (i + batchSize < documents.length) {
          await this.sleep(1000);
        }
      }

      result.success = result.documentsFailed === 0;
      result.timeMs = Date.now() - startTime;

      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown migration error');
      result.timeMs = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Sync specific document between providers
   */
  async syncDocument(documentId: string, userId: string): Promise<IndexingResult> {
    try {
      // Get document chunks from source
      const chunks = await this.getDocumentChunks(documentId);

      if (chunks.length === 0) {
        return {
          success: false,
          documentId,
          chunksIndexed: 0,
          errorCount: 1,
          errors: ['No chunks found for document'],
          timeMs: 0,
        };
      }

      // Index document in target provider
      return await this.targetProvider.indexDocument(documentId, chunks, userId);
    } catch (error) {
      return {
        success: false,
        documentId,
        chunksIndexed: 0,
        errorCount: 1,
        errors: [error instanceof Error ? error.message : 'Unknown sync error'],
        timeMs: 0,
      };
    }
  }

  /**
   * Validate migration integrity
   */
  async validateMigration(documentIds: string[], userId: string): Promise<{
    isValid: boolean;
    missingDocuments: string[];
    errors: string[];
  }> {
    const missingDocuments: string[] = [];
    const errors: string[] = [];

    try {
      for (const documentId of documentIds) {
        // Check if document exists in target provider by performing a search
        try {
          const searchResult = await this.targetProvider.vectorSearch(
            `document:${documentId}`,
            userId,
            { limit: 1, documentIds: [documentId] }
          );

          if (searchResult.results.length === 0) {
            missingDocuments.push(documentId);
          }
        } catch (error) {
          errors.push(`Validation failed for ${documentId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        isValid: missingDocuments.length === 0 && errors.length === 0,
        missingDocuments,
        errors,
      };
    } catch (error) {
      return {
        isValid: false,
        missingDocuments: [],
        errors: [error instanceof Error ? error.message : 'Validation failed'],
      };
    }
  }

  /**
   * Get migration status/progress
   */
  async getMigrationStatus(documentIds: string[], userId: string): Promise<{
    total: number;
    migrated: number;
    pending: number;
    failed: number;
  }> {
    const total = documentIds.length;
    let migrated = 0;
    let failed = 0;

    for (const documentId of documentIds) {
      try {
        const searchResult = await this.targetProvider.vectorSearch(
          `document:${documentId}`,
          userId,
          { limit: 1, documentIds: [documentId] }
        );

        if (searchResult.results.length > 0) {
          migrated++;
        }
      } catch (error) {
        failed++;
      }
    }

    return {
      total,
      migrated,
      pending: total - migrated - failed,
      failed,
    };
  }

  // Private helper methods

  private async getDocumentsToMigrate(userId?: string, documentIds?: string[]): Promise<Array<{
    id: string;
    title: string;
    userId: string;
  }>> {
    let query = db
      .select({
        id: ragDocument.id,
        title: ragDocument.originalName,
        userId: ragDocument.uploadedBy,
      })
      .from(ragDocument)
      .where(eq(ragDocument.status, 'embedded'));

    if (userId) {
      query = query.where(and(
        eq(ragDocument.status, 'embedded'),
        eq(ragDocument.uploadedBy, userId)
      ));
    }

    if (documentIds && documentIds.length > 0) {
      query = query.where(and(
        eq(ragDocument.status, 'embedded'),
        // Note: Would need to implement proper IN clause here
      ));
    }

    return await query;
  }

  private async getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
    const chunks = await db
      .select({
        id: documentChunk.id,
        content: documentChunk.content,
        chunkIndex: documentChunk.chunkIndex,
        metadata: documentChunk.metadata,
        elementType: documentChunk.elementType,
        pageNumber: documentChunk.pageNumber,
        bbox: documentChunk.bbox,
      })
      .from(documentChunk)
      .where(eq(documentChunk.documentId, documentId))
      .orderBy(documentChunk.chunkIndex);

    return chunks.map(chunk => ({
      id: chunk.id || '',
      content: chunk.content || '',
      chunkIndex: typeof chunk.chunkIndex === 'string' ? Number.parseInt(chunk.chunkIndex) : chunk.chunkIndex || 0,
      metadata: chunk.metadata,
      elementType: chunk.elementType,
      pageNumber: chunk.pageNumber,
      bbox: chunk.bbox,
    }));
  }

  private async processBatch(documents: Array<{
    id: string;
    title: string;
    userId: string;
  }>): Promise<IndexingResult[]> {
    const results: IndexingResult[] = [];

    for (const doc of documents) {
      try {
        const chunks = await this.getDocumentChunks(doc.id);
        const result = await this.targetProvider.indexDocument(doc.id, chunks, doc.userId);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          documentId: doc.id,
          chunksIndexed: 0,
          errorCount: 1,
          errors: [error instanceof Error ? error.message : 'Unknown batch processing error'],
          timeMs: 0,
        });
      }
    }

    return results;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create migration service
 */
export async function createMigrationService(
  sourceProviderType: 'neondb' | 'openai',
  targetProviderType: 'neondb' | 'openai'
): Promise<VectorMigrationService> {
  const factory = vectorSearchFactory;

  const sourceProvider = factory.createProvider({
    type: sourceProviderType,
    connectionString: sourceProviderType === 'neondb' ? process.env.POSTGRES_URL || '' : '',
    apiKey: sourceProviderType === 'openai' ? process.env.OPENAI_API_KEY || '' : '',
    indexName: sourceProviderType === 'openai' ? process.env.OPENAI_VECTOR_INDEX || 'roborail-docs' : '',
    embeddingModel: sourceProviderType === 'neondb' 
      ? process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0'
      : process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
    dimensions: sourceProviderType === 'neondb' 
      ? Number.parseInt(process.env.VECTOR_DIMENSIONS || '1024')
      : Number.parseInt(process.env.VECTOR_DIMENSIONS || '3072'),
  });

  const targetProvider = factory.createProvider({
    type: targetProviderType,
    connectionString: targetProviderType === 'neondb' ? process.env.POSTGRES_URL || '' : '',
    apiKey: targetProviderType === 'openai' ? process.env.OPENAI_API_KEY || '' : '',
    indexName: targetProviderType === 'openai' ? process.env.OPENAI_VECTOR_INDEX || 'roborail-docs' : '',
    embeddingModel: targetProviderType === 'neondb' 
      ? process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0'
      : process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
    dimensions: targetProviderType === 'neondb' 
      ? Number.parseInt(process.env.VECTOR_DIMENSIONS || '1024')
      : Number.parseInt(process.env.VECTOR_DIMENSIONS || '3072'),
  });

  return new VectorMigrationService(sourceProvider, targetProvider);
}

/**
 * Convenience function for NeonDB to OpenAI migration
 */
export async function migrateNeonToOpenAI(options: Omit<MigrationOptions, 'sourceProvider' | 'targetProvider'>): Promise<MigrationResult> {
  const migrationService = await createMigrationService('neondb', 'openai');
  return migrationService.migrateDocuments({
    ...options,
    sourceProvider: 'neondb',
    targetProvider: 'openai',
  });
}

/**
 * Convenience function for OpenAI to NeonDB migration
 */
export async function migrateOpenAIToNeon(options: Omit<MigrationOptions, 'sourceProvider' | 'targetProvider'>): Promise<MigrationResult> {
  const migrationService = await createMigrationService('openai', 'neondb');
  return migrationService.migrateDocuments({
    ...options,
    sourceProvider: 'openai',
    targetProvider: 'neondb',
  });
}