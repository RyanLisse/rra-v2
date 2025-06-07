import { db } from '@/lib/db';
import { documentChunk } from '@/lib/db/schema';
import { eq, and, desc, asc, isNull } from 'drizzle-orm';
import type { DocumentChunk } from '@/lib/db/schema';

/**
 * Type definitions for ADE element types
 */
export type ADEElementType = 
  | 'paragraph'
  | 'title'
  | 'figure_caption'
  | 'table_text'
  | 'list_item'
  | 'header'
  | 'footer'
  | 'footnote'
  | null;

/**
 * Type for bounding box coordinates
 */
export type BoundingBox = [number, number, number, number] | {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence?: number;
} | null;

/**
 * Enhanced document chunk with ADE metadata
 */
export interface ADEDocumentChunk extends DocumentChunk {
  elementType: ADEElementType;
  pageNumber: number | null;
  bbox: BoundingBox;
}

/**
 * Helper functions for working with ADE-enhanced document chunks
 */
export class ADEChunkHelpers {
  /**
   * Create a document chunk with ADE metadata
   */
  static async createChunkWithADE(params: {
    documentId: string;
    chunkIndex: string;
    content: string;
    elementType?: ADEElementType;
    pageNumber?: number;
    bbox?: BoundingBox;
    metadata?: any;
    tokenCount?: string;
  }): Promise<DocumentChunk> {
    const [chunk] = await db.insert(documentChunk).values({
      documentId: params.documentId,
      chunkIndex: params.chunkIndex,
      content: params.content,
      elementType: params.elementType || null,
      pageNumber: params.pageNumber || null,
      bbox: params.bbox || null,
      metadata: params.metadata || null,
      tokenCount: params.tokenCount || null,
    }).returning();

    return chunk;
  }

  /**
   * Get chunks by element type
   */
  static async getChunksByElementType(
    documentId: string,
    elementType: ADEElementType
  ): Promise<DocumentChunk[]> {
    const whereConditions = [eq(documentChunk.documentId, documentId)];
    
    if (elementType === null) {
      whereConditions.push(isNull(documentChunk.elementType));
    } else {
      whereConditions.push(eq(documentChunk.elementType, elementType));
    }

    return await db
      .select()
      .from(documentChunk)
      .where(and(...whereConditions))
      .orderBy(asc(documentChunk.pageNumber), asc(documentChunk.chunkIndex));
  }

  /**
   * Get chunks by page number
   */
  static async getChunksByPage(
    documentId: string,
    pageNumber: number
  ): Promise<DocumentChunk[]> {
    return await db
      .select()
      .from(documentChunk)
      .where(
        and(
          eq(documentChunk.documentId, documentId),
          eq(documentChunk.pageNumber, pageNumber)
        )
      )
      .orderBy(asc(documentChunk.chunkIndex));
  }

  /**
   * Get all chunks for a document ordered by page and position
   */
  static async getChunksOrdered(documentId: string): Promise<DocumentChunk[]> {
    return await db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.documentId, documentId))
      .orderBy(
        asc(documentChunk.pageNumber),
        asc(documentChunk.chunkIndex)
      );
  }

  /**
   * Get document structure summary (titles, headers, etc.)
   */
  static async getDocumentStructure(documentId: string): Promise<{
    titles: DocumentChunk[];
    headers: DocumentChunk[];
    structure: DocumentChunk[];
  }> {
    const structuralElements = await db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.documentId, documentId))
      .orderBy(asc(documentChunk.pageNumber), asc(documentChunk.chunkIndex));

    const titles = structuralElements.filter(chunk => chunk.elementType === 'title');
    const headers = structuralElements.filter(chunk => chunk.elementType === 'header');
    const structure = structuralElements.filter(chunk => 
      ['title', 'header', 'figure_caption'].includes(chunk.elementType || '')
    );

    return { titles, headers, structure };
  }

  /**
   * Update chunk with ADE metadata
   */
  static async updateChunkADE(
    chunkId: string,
    adeData: {
      elementType?: ADEElementType;
      pageNumber?: number;
      bbox?: BoundingBox;
    }
  ): Promise<DocumentChunk> {
    const [updatedChunk] = await db
      .update(documentChunk)
      .set({
        elementType: adeData.elementType,
        pageNumber: adeData.pageNumber,
        bbox: adeData.bbox,
      })
      .where(eq(documentChunk.id, chunkId))
      .returning();

    return updatedChunk;
  }

  /**
   * Get chunks with specific bounding box criteria
   */
  static async getChunksInRegion(
    documentId: string,
    pageNumber: number,
    region?: {
      minX?: number;
      minY?: number;
      maxX?: number;
      maxY?: number;
    }
  ): Promise<DocumentChunk[]> {
    let chunks = await this.getChunksByPage(documentId, pageNumber);

    if (region && chunks.length > 0) {
      chunks = chunks.filter(chunk => {
        if (!chunk.bbox || !Array.isArray(chunk.bbox)) return true;
        
        const [x1, y1, x2, y2] = chunk.bbox;
        
        if (region.minX !== undefined && x2 < region.minX) return false;
        if (region.maxX !== undefined && x1 > region.maxX) return false;
        if (region.minY !== undefined && y2 < region.minY) return false;
        if (region.maxY !== undefined && y1 > region.maxY) return false;
        
        return true;
      });
    }

    return chunks;
  }

  /**
   * Generate enriched context for LLM prompts
   */
  static async generateEnrichedContext(
    documentId: string,
    options?: {
      includePageNumbers?: boolean;
      includeElementTypes?: boolean;
      includeStructuralContext?: boolean;
      maxChunks?: number;
    }
  ): Promise<string> {
    const {
      includePageNumbers = true,
      includeElementTypes = true,
      includeStructuralContext = true,
      maxChunks = 50
    } = options || {};

    const chunks = await this.getChunksOrdered(documentId);
    const relevantChunks = chunks.slice(0, maxChunks);

    let context = '';
    
    if (includeStructuralContext) {
      const { titles } = await this.getDocumentStructure(documentId);
      if (titles.length > 0) {
        context += 'Document Structure:\n';
        titles.forEach((title, index) => {
          context += `${index + 1}. ${title.content}${includePageNumbers && title.pageNumber ? ` (Page ${title.pageNumber})` : ''}\n`;
        });
        context += '\n';
      }
    }

    context += 'Document Content:\n\n';

    for (const chunk of relevantChunks) {
      let chunkPrefix = '';
      
      if (includeElementTypes && chunk.elementType) {
        chunkPrefix += `[${chunk.elementType.toUpperCase()}] `;
      }
      
      if (includePageNumbers && chunk.pageNumber) {
        chunkPrefix += `(Page ${chunk.pageNumber}) `;
      }

      context += `${chunkPrefix}${chunk.content}\n\n`;
    }

    return context;
  }

  /**
   * Validate bounding box format
   */
  static validateBoundingBox(bbox: any): bbox is BoundingBox {
    if (bbox === null) return true;
    
    if (Array.isArray(bbox)) {
      return bbox.length === 4 && bbox.every(coord => typeof coord === 'number');
    }
    
    if (typeof bbox === 'object') {
      return (
        typeof bbox.x1 === 'number' &&
        typeof bbox.y1 === 'number' &&
        typeof bbox.x2 === 'number' &&
        typeof bbox.y2 === 'number'
      );
    }
    
    return false;
  }

  /**
   * Check if element type is valid
   */
  static isValidElementType(type: any): type is ADEElementType {
    const validTypes = [
      'paragraph',
      'title',
      'figure_caption',
      'table_text',
      'list_item',
      'header',
      'footer',
      'footnote',
      null
    ];
    
    return validTypes.includes(type);
  }
}

/**
 * Export commonly used functions for convenience
 */
export const {
  createChunkWithADE,
  getChunksByElementType,
  getChunksByPage,
  getChunksOrdered,
  getDocumentStructure,
  updateChunkADE,
  getChunksInRegion,
  generateEnrichedContext,
  validateBoundingBox,
  isValidElementType,
} = ADEChunkHelpers;