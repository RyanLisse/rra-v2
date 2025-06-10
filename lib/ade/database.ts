import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import {
  type AdeOutput,
  type AdeElement,
  type DbAdeElement,
  AdeError,
} from './types';
import { eq } from 'drizzle-orm';

// We'll add this to the schema later - for now, define the operations interface

/**
 * Save ADE elements to database
 */
export async function saveAdeElements(adeOutput: AdeOutput): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Update document status to indicate ADE processing completion
      await tx
        .update(ragDocument)
        .set({
          status: 'processed',
          updatedAt: new Date(),
        })
        .where(eq(ragDocument.id, adeOutput.documentId));

      // TODO: Insert ADE elements when schema is updated
      // For now, we'll store a summary in the document metadata
      const adeMetadata = {
        adeProcessed: true,
        totalElements: adeOutput.totalElements,
        pageCount: adeOutput.pageCount,
        processingTimeMs: adeOutput.processingTimeMs,
        confidence: adeOutput.confidence,
        elementsByType: countElementsByType(adeOutput.elements),
        processedAt: new Date().toISOString(),
      };

      // Store ADE metadata (this would be in document metadata field)
      console.log(
        `[ADE] Saving metadata for document ${adeOutput.documentId}:`,
        adeMetadata,
      );

      // Note: In a full implementation, we would:
      // 1. Insert into documentAdeElements table
      // 2. Update document with ADE metadata
      // 3. Link elements to chunks for enhanced retrieval
    });
  } catch (error) {
    throw new AdeError(
      `Failed to save ADE elements: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_SAVE_ERROR',
      500,
      error,
    );
  }
}

/**
 * Get ADE elements for a document
 */
export async function getDocumentElements(
  documentId: string,
): Promise<AdeElement[]> {
  try {
    // TODO: Implement when schema is available
    // For now, return empty array as this is a placeholder

    console.log(`[ADE] Getting elements for document ${documentId}`);

    // In full implementation:
    // const elements = await db.select().from(documentAdeElements)
    //   .where(eq(documentAdeElements.documentId, documentId))
    //   .orderBy(documentAdeElements.pageNumber, documentAdeElements.createdAt);

    // return elements.map(transformDbElementToAdeElement);

    return [];
  } catch (error) {
    throw new AdeError(
      `Failed to get document elements: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_GET_ERROR',
      500,
      error,
    );
  }
}

/**
 * Get elements by type for a document
 */
export async function getElementsByType(
  documentId: string,
  elementType: string,
): Promise<AdeElement[]> {
  try {
    const allElements = await getDocumentElements(documentId);
    return allElements.filter((element) => element.type === elementType);
  } catch (error) {
    throw new AdeError(
      `Failed to get elements by type: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_FILTER_ERROR',
      500,
      error,
    );
  }
}

/**
 * Get elements by page for a document
 */
export async function getElementsByPage(
  documentId: string,
  pageNumber: number,
): Promise<AdeElement[]> {
  try {
    const allElements = await getDocumentElements(documentId);
    return allElements.filter((element) => element.pageNumber === pageNumber);
  } catch (error) {
    throw new AdeError(
      `Failed to get elements by page: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_PAGE_ERROR',
      500,
      error,
    );
  }
}

/**
 * Delete ADE elements for a document
 */
export async function deleteDocumentElements(
  documentId: string,
): Promise<void> {
  try {
    // TODO: Implement when schema is available
    // await db.delete(documentAdeElements)
    //   .where(eq(documentAdeElements.documentId, documentId));

    console.log(`[ADE] Deleting elements for document ${documentId}`);
  } catch (error) {
    throw new AdeError(
      `Failed to delete document elements: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_DELETE_ERROR',
      500,
      error,
    );
  }
}

/**
 * Check if document has been processed with ADE
 */
export async function isDocumentAdeProcessed(
  documentId: string,
): Promise<boolean> {
  try {
    const [document] = await db
      .select({
        status: ragDocument.status,
      })
      .from(ragDocument)
      .where(eq(ragDocument.id, documentId))
      .limit(1);

    return (
      document?.status === 'ade_processed' ||
      document?.status === 'processed' ||
      document?.status === 'embedded'
    );
  } catch (error) {
    throw new AdeError(
      `Failed to check ADE processing status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_STATUS_ERROR',
      500,
      error,
    );
  }
}

/**
 * Get ADE processing statistics for a document
 */
export async function getDocumentAdeStats(documentId: string): Promise<{
  totalElements: number;
  elementsByType: Record<string, number>;
  pageCount: number;
  confidence?: number;
  processedAt?: string;
} | null> {
  try {
    // TODO: Implement when schema is available
    // For now, return mock data based on document status

    const isProcessed = await isDocumentAdeProcessed(documentId);
    if (!isProcessed) {
      return null;
    }

    // Mock statistics - in real implementation, would aggregate from database
    return {
      totalElements: 0,
      elementsByType: {},
      pageCount: 1,
      confidence: 0.9,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw new AdeError(
      `Failed to get ADE statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_STATS_ERROR',
      500,
      error,
    );
  }
}

/**
 * Search elements by content
 */
export async function searchElementsByContent(
  documentId: string,
  searchQuery: string,
): Promise<AdeElement[]> {
  try {
    const allElements = await getDocumentElements(documentId);

    const query = searchQuery.toLowerCase();
    return allElements.filter((element) =>
      element.content?.toLowerCase().includes(query),
    );
  } catch (error) {
    throw new AdeError(
      `Failed to search elements: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'ADE_DATABASE_SEARCH_ERROR',
      500,
      error,
    );
  }
}

// Helper functions

/**
 * Count elements by type
 */
function countElementsByType(elements: AdeElement[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const element of elements) {
    counts[element.type] = (counts[element.type] || 0) + 1;
  }

  return counts;
}

/**
 * Transform database element to ADE element format
 */
function transformDbElementToAdeElement(dbElement: DbAdeElement): AdeElement {
  return {
    id: dbElement.adeElementId,
    type: dbElement.elementType,
    content: dbElement.content,
    imagePath: dbElement.imagePath,
    pageNumber: dbElement.pageNumber,
    bbox: dbElement.bbox
      ? (dbElement.bbox as [number, number, number, number])
      : undefined,
    confidence: dbElement.confidence,
    metadata: dbElement.rawElementData?.metadata,
  };
}

/**
 * Transform ADE element to database format
 */
function transformAdeElementToDbElement(
  element: AdeElement,
  documentId: string,
): Omit<DbAdeElement, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    documentId,
    adeElementId: element.id,
    elementType: element.type,
    content: element.content,
    imagePath: element.imagePath,
    pageNumber: element.pageNumber,
    bbox: element.bbox ? Array.from(element.bbox) : undefined,
    confidence: element.confidence,
    rawElementData: element as Record<string, any>,
  };
}
