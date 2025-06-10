/**
 * Example: ADE Integration Usage in Document Processing
 *
 * This file demonstrates how to use the enhanced DocumentProcessor
 * with ADE metadata integration for creating intelligent document chunks.
 */

import { DocumentProcessor } from './document-processor';
import { db } from '@/lib/db';
import { ADEChunkHelpers } from '@/lib/db/ade-helpers';
import { CohereClient } from '@/lib/ai/cohere-client';

/**
 * Example: Processing a document with ADE integration
 */
export async function processDocumentWithADEExample(documentId: string) {
  // Initialize processor with Cohere client for embeddings
  const cohereClient = new CohereClient();
  const processor = new DocumentProcessor({}, cohereClient);

  try {
    console.log(`Starting ADE-enhanced processing for document ${documentId}`);

    // Extract text first
    const content = await processor.extractText({ documentId, db });

    // Create chunks with ADE
    const chunks = await processor.createChunks({
      documentId,
      content: content.extractedText || '',
      db,
      useADE: true,
    });

    // Generate embeddings if cohereClient is available
    if (chunks.length > 0) {
      const chunkData = chunks.map((chunk: any) => ({
        id: chunk.id,
        content: chunk.content,
      }));

      await processor.generateEmbeddings({
        chunks: chunkData,
        db,
      });
    }

    console.log(`Successfully processed document ${documentId}:`);
    console.log(`- Created ${chunks.length} chunks`);
    console.log(
      `- ADE metadata available: ${chunks.some((c: any) => c.elementType !== null)}`,
    );

    return { content, chunks };
  } catch (error) {
    console.error(`Failed to process document ${documentId}:`, error);
    throw error;
  }
}

/**
 * Example: Traditional processing without ADE (fallback)
 */
export async function processDocumentTraditionalExample(documentId: string) {
  const processor = new DocumentProcessor();

  try {
    // Extract text
    const content = await processor.extractText({ documentId, db });

    // Create chunks without ADE
    const chunks = await processor.createChunks({
      documentId,
      content: content.extractedText || '',
      db,
      useADE: false, // Disable ADE
    });

    // Generate embeddings
    const chunkData = chunks.map((chunk: any) => ({
      id: chunk.id,
      content: chunk.content,
    }));

    await processor.generateEmbeddings({
      chunks: chunkData,
      db,
    });

    return { content, chunks };
  } catch (error) {
    console.error(`Failed to process document traditionally:`, error);
    throw error;
  }
}

/**
 * Example: Retrieving and working with ADE-enhanced chunks
 */
export async function workWithADEChunksExample(documentId: string) {
  try {
    // Get all chunks ordered by page and position
    const chunks = await ADEChunkHelpers.getChunksOrdered(documentId);

    console.log(`Found ${chunks.length} chunks for document ${documentId}`);

    // Get document structure (titles, headers)
    const structure = await ADEChunkHelpers.getDocumentStructure(documentId);
    console.log(`Document structure:`);
    console.log(`- ${structure.titles.length} titles`);
    console.log(`- ${structure.headers.length} headers`);

    // Get chunks by element type
    const paragraphs = await ADEChunkHelpers.getChunksByElementType(
      documentId,
      'paragraph',
    );
    const tables = await ADEChunkHelpers.getChunksByElementType(
      documentId,
      'table_text',
    );

    console.log(`Content breakdown:`);
    console.log(`- ${paragraphs.length} paragraph chunks`);
    console.log(`- ${tables.length} table chunks`);

    // Generate enriched context for LLM prompts
    const enrichedContext = await ADEChunkHelpers.generateEnrichedContext(
      documentId,
      {
        includePageNumbers: true,
        includeElementTypes: true,
        includeStructuralContext: true,
        maxChunks: 20,
      },
    );

    console.log(
      `Generated enriched context (${enrichedContext.length} characters)`,
    );

    return {
      chunks,
      structure,
      paragraphs,
      tables,
      enrichedContext,
    };
  } catch (error) {
    console.error(`Failed to work with ADE chunks:`, error);
    throw error;
  }
}

/**
 * Example: Searching within specific document regions
 */
export async function searchDocumentRegionExample(
  documentId: string,
  pageNumber: number,
  searchRegion?: {
    minX?: number;
    minY?: number;
    maxX?: number;
    maxY?: number;
  },
) {
  try {
    // Get chunks in a specific region of a page
    const chunks = await ADEChunkHelpers.getChunksInRegion(
      documentId,
      pageNumber,
      searchRegion,
    );

    console.log(
      `Found ${chunks.length} chunks in region on page ${pageNumber}`,
    );

    // Example: Get chunks from the top half of page 1
    const topHalfChunks = await ADEChunkHelpers.getChunksInRegion(
      documentId,
      1,
      { maxY: 400 }, // Assuming page height is ~800 units
    );

    return {
      regionChunks: chunks,
      topHalfChunks,
    };
  } catch (error) {
    console.error(`Failed to search document region:`, error);
    throw error;
  }
}

/**
 * Example: Batch processing multiple documents with ADE
 */
export async function batchProcessDocumentsExample(documentIds: string[]) {
  const processor = new DocumentProcessor({}, new CohereClient());
  const results = [];

  for (const documentId of documentIds) {
    try {
      console.log(`Processing document ${documentId}...`);

      // Extract text
      const content = await processor.extractText({ documentId, db });

      // Create chunks with ADE
      const chunks = await processor.createChunks({
        documentId,
        content: content.extractedText || '',
        db,
        useADE: true,
      });

      // Generate embeddings
      if (chunks.length > 0) {
        const chunkData = chunks.map((chunk: any) => ({
          id: chunk.id,
          content: chunk.content,
        }));

        await processor.generateEmbeddings({
          chunks: chunkData,
          db,
        });
      }

      results.push({
        documentId,
        success: true,
        chunksCreated: chunks.length,
        adeDataAvailable: chunks.some((c: any) => c.elementType !== null),
      });

      console.log(`✓ Completed ${documentId}`);
    } catch (error) {
      console.error(`✗ Failed ${documentId}:`, error);

      results.push({
        documentId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Example: Error handling and graceful degradation
 */
export async function robustDocumentProcessingExample(documentId: string) {
  const processor = new DocumentProcessor();

  try {
    // Try ADE processing first
    console.log(`Attempting ADE processing for ${documentId}`);

    // Extract text
    const content = await processor.extractText({ documentId, db });

    // Create chunks with ADE
    const chunks = await processor.createChunks({
      documentId,
      content: content.extractedText || '',
      db,
      useADE: true,
    });

    // Generate embeddings
    if (chunks.length > 0) {
      const chunkData = chunks.map((chunk: any) => ({
        id: chunk.id,
        content: chunk.content,
      }));

      await processor.generateEmbeddings({
        chunks: chunkData,
        db,
      });
    }

    const adeSuccess = chunks.some((c: any) => c.elementType !== null);

    if (adeSuccess) {
      console.log(`✓ ADE processing successful`);
      return { content, chunks, processingMethod: 'ADE' };
    } else {
      console.log(`⚠ ADE processing fell back to traditional chunking`);
      return { content, chunks, processingMethod: 'traditional' };
    }
  } catch (error) {
    console.warn(`ADE processing failed, trying traditional:`, error);

    try {
      // Fallback to traditional processing
      const result = await processDocumentTraditionalExample(documentId);
      return { ...result, processingMethod: 'traditional_fallback' };
    } catch (fallbackError) {
      console.error(`All processing methods failed:`, fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Example: Using ADE data for enhanced search and retrieval
 */
export async function enhancedDocumentSearchExample(
  documentId: string,
  query: string,
) {
  try {
    // Get all chunks with their ADE metadata
    const chunks = await ADEChunkHelpers.getChunksOrdered(documentId);

    // Filter chunks by element type for more precise search
    const searchableChunks = chunks.filter((chunk) => {
      // Prioritize certain element types for search
      const priorityTypes = ['title', 'paragraph', 'table_text'];
      return !chunk.elementType || priorityTypes.includes(chunk.elementType);
    });

    // Simple text matching (in real implementation, use vector search)
    const matchingChunks = searchableChunks.filter((chunk) =>
      chunk.content.toLowerCase().includes(query.toLowerCase()),
    );

    // Sort by element type priority (titles first, then paragraphs, etc.)
    const sortedMatches = matchingChunks.sort((a, b) => {
      const typeOrder = ['title', 'paragraph', 'table_text', 'list_item'];
      const aIndex = a.elementType ? typeOrder.indexOf(a.elementType) : 999;
      const bIndex = b.elementType ? typeOrder.indexOf(b.elementType) : 999;

      if (aIndex !== bIndex) return aIndex - bIndex;

      // Secondary sort by page number
      return (a.pageNumber || 0) - (b.pageNumber || 0);
    });

    return {
      query,
      totalChunks: chunks.length,
      searchableChunks: searchableChunks.length,
      matches: sortedMatches,
      hasAdeData: chunks.some((c: any) => c.elementType !== null),
    };
  } catch (error) {
    console.error(`Enhanced search failed:`, error);
    throw error;
  }
}

/**
 * Type definitions for the examples
 */
export interface DocumentProcessingResult {
  documentId: string;
  success: boolean;
  chunksCreated?: number;
  adeDataAvailable?: boolean;
  processingMethod?: 'ADE' | 'traditional' | 'traditional_fallback';
  error?: string;
}

export interface SearchResult {
  query: string;
  totalChunks: number;
  searchableChunks: number;
  matches: any[];
  hasAdeData: boolean;
}
