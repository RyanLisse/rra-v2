/**
 * Agentic Document Integration
 * Integrates the TypeScript agentic document processor with the existing RAG system
 */

import { db } from '@/lib/db';
import {
  ragDocument,
  documentContent,
  documentChunk,
  documentEmbedding,
} from '@/lib/db/schema';
import {
  createAgenticDocProcessor,
  type DocumentAnalysis,
  type DocumentElement,
} from './agentic-doc';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs/promises';
import { generateEmbedding } from '@/lib/ai/multimodal-embeddings';

export interface AgenticProcessingResult {
  documentId: string;
  analysis: DocumentAnalysis;
  chunksCreated: number;
  embeddingsGenerated: number;
  processingTime: number;
}

export interface AgenticProcessingOptions {
  generateEmbeddings: boolean;
  chunkSize: number;
  overlapSize: number;
  confidenceThreshold: number;
  enableStructuralAnalysis: boolean;
}

/**
 * Agentic Document Integration Service
 */
export class AgenticDocumentService {
  private processor = createAgenticDocProcessor({
    model: 'gpt-4o',
    maxTokens: 4000,
    temperature: 0.1,
    enableVisionAnalysis: true,
    confidenceThreshold: 0.7,
  });

  /**
   * Process document with agentic analysis and integrate with RAG system
   */
  async processDocumentWithAgentic(
    documentId: string,
    userId: string,
    options: Partial<AgenticProcessingOptions> = {},
  ): Promise<AgenticProcessingResult> {
    const startTime = Date.now();

    const opts: AgenticProcessingOptions = {
      generateEmbeddings: true,
      chunkSize: 1000,
      overlapSize: 200,
      confidenceThreshold: 0.7,
      enableStructuralAnalysis: true,
      ...options,
    };

    try {
      // Get document information from database
      const document = await this.getDocumentInfo(documentId);
      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Find PDF file and associated images
      const { pdfPath, imagePaths } = await this.findDocumentFiles(
        document.fileName,
      );

      // Run agentic analysis
      const analysis = await this.processor.analyzeDocument(
        pdfPath,
        imagePaths,
        {
          analyzeStructure: opts.enableStructuralAnalysis,
          extractTables: true,
          identifyFigures: true,
          generateSummary: true,
          extractKeyTopics: true,
          confidenceThreshold: opts.confidenceThreshold,
        },
      );

      // Store analysis results
      await this.storeAnalysisResults(documentId, analysis);

      // Create enhanced chunks with agentic metadata
      const chunks = await this.createAgenticChunks(documentId, analysis, opts);

      // Generate embeddings if requested
      let embeddingsGenerated = 0;
      if (opts.generateEmbeddings) {
        const chunksWithDocId = chunks.map((chunk) => ({
          ...chunk,
          metadata: { ...chunk.metadata, documentId },
        }));
        embeddingsGenerated = await this.generateChunkEmbeddings(
          chunksWithDocId,
          userId,
        );
      }

      // Update document status
      await this.updateDocumentStatus(documentId, 'processed');

      const processingTime = Date.now() - startTime;

      return {
        documentId,
        analysis,
        chunksCreated: chunks.length,
        embeddingsGenerated,
        processingTime,
      };
    } catch (error) {
      console.error('Agentic document processing failed:', error);
      await this.updateDocumentStatus(documentId, 'failed');
      throw error;
    }
  }

  /**
   * Query document using agentic analysis
   */
  async queryDocumentAgentic(
    documentId: string,
    query: string,
    includeVisualContext = true,
  ): Promise<{
    answer: string;
    relevantElements: DocumentElement[];
    confidence: number;
    sources: Array<{
      chunkId: string;
      content: string;
      elementType: string;
      pageNumber: number;
      confidence: number;
    }>;
  }> {
    // Get stored analysis
    const analysis = await this.getStoredAnalysis(documentId);
    if (!analysis) {
      throw new Error(`No agentic analysis found for document: ${documentId}`);
    }

    // Query using agentic processor
    const result = await this.processor.queryDocument(
      analysis,
      query,
      includeVisualContext,
    );

    // Get related chunks for additional context
    const chunks = await this.getRelatedChunks(
      documentId,
      result.relevantElements,
    );

    return {
      ...result,
      sources: chunks,
    };
  }

  /**
   * Get enhanced document summary with agentic insights
   */
  async getDocumentSummary(documentId: string): Promise<{
    title: string;
    summary: string;
    keyTopics: string[];
    structure: {
      totalPages: number;
      totalElements: number;
      hasTable: boolean;
      hasFigures: boolean;
      hasHeaders: boolean;
      sectionCount: number;
    };
    elements: {
      type: string;
      count: number;
      averageConfidence: number;
    }[];
  }> {
    const analysis = await this.getStoredAnalysis(documentId);
    if (!analysis) {
      throw new Error(`No agentic analysis found for document: ${documentId}`);
    }

    // Calculate element statistics
    const elementStats = this.calculateElementStats(analysis.elements);

    return {
      title: analysis.title || `Document ${documentId}`,
      summary: analysis.summary,
      keyTopics: analysis.keyTopics,
      structure: {
        totalPages: analysis.totalPages,
        totalElements: analysis.elements.length,
        ...analysis.structure,
      },
      elements: elementStats,
    };
  }

  /**
   * Private helper methods
   */
  private async getDocumentInfo(documentId: string) {
    const results = await db
      .select()
      .from(ragDocument)
      .where(eq(ragDocument.id, documentId))
      .limit(1);

    return results[0] || null;
  }

  private async findDocumentFiles(documentTitle: string): Promise<{
    pdfPath: string;
    imagePaths: string[];
  }> {
    // Find PDF file
    const pdfDir = path.resolve(process.cwd(), 'data/pdf');
    const pdfFiles = await fs.readdir(pdfDir);
    const pdfFile = pdfFiles.find((file) =>
      file
        .toLowerCase()
        .includes(documentTitle.toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')),
    );

    if (!pdfFile) {
      throw new Error(`PDF file not found for document: ${documentTitle}`);
    }

    const pdfPath = path.join(pdfDir, pdfFile);

    // Find associated images
    const imagesDir = path.resolve(process.cwd(), 'data/processed-pdfs-images');
    const documentFolder = pdfFile.replace('.pdf', '');
    const documentImagesDir = path.join(imagesDir, documentFolder, 'images');

    let imagePaths: string[] = [];
    try {
      const imageFiles = await fs.readdir(documentImagesDir);
      imagePaths = imageFiles
        .filter((file) => file.endsWith('.png'))
        .sort((a, b) => {
          const pageA = Number.parseInt(a.match(/page-(\d+)/)?.[1] || '0');
          const pageB = Number.parseInt(b.match(/page-(\d+)/)?.[1] || '0');
          return pageA - pageB;
        })
        .map((file) => path.join(documentImagesDir, file));
    } catch (error) {
      console.warn(`No images found for document: ${documentTitle}`);
    }

    return { pdfPath, imagePaths };
  }

  private async storeAnalysisResults(
    documentId: string,
    analysis: DocumentAnalysis,
  ): Promise<void> {
    // Update document status to indicate agentic processing is complete
    await db
      .update(ragDocument)
      .set({
        status: 'ade_processed',
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, documentId));

    // Store individual elements as structured data (optional - could be separate table)
    const elementsJson = JSON.stringify(analysis.elements);
    await db.insert(documentContent).values({
      documentId,
      extractedText: elementsJson,
      metadata: {
        type: 'agentic_elements',
        elementCount: analysis.elements.length,
        structure: analysis.structure,
        title: analysis.title,
        summary: analysis.summary,
        keyTopics: analysis.keyTopics,
      },
    });
  }

  private async createAgenticChunks(
    documentId: string,
    analysis: DocumentAnalysis,
    options: AgenticProcessingOptions,
  ): Promise<Array<{ id: string; content: string; metadata: any }>> {
    const chunks: Array<{ id: string; content: string; metadata: any }> = [];

    // Create chunks from high-confidence elements
    const highConfidenceElements = analysis.elements.filter(
      (el) => el.confidence >= options.confidenceThreshold,
    );

    for (const element of highConfidenceElements) {
      // Create chunk for each significant element
      if (element.content.length > 50) {
        // Only meaningful content
        const chunkId = `${documentId}_agentic_${element.id}`;

        const chunkContent = this.formatElementContent(element, analysis);

        chunks.push({
          id: chunkId,
          content: chunkContent,
          metadata: {
            elementId: element.id,
            elementType: element.type,
            pageNumber: element.boundingBox.pageNumber,
            confidence: element.confidence,
            boundingBox: element.boundingBox,
            isAgenticChunk: true,
            relationships: element.relationships || [],
          },
        });
      }
    }

    // Store chunks in database
    for (const chunk of chunks) {
      await db.insert(documentChunk).values({
        documentId,
        content: chunk.content,
        chunkIndex: chunks.indexOf(chunk).toString(),
        tokenCount: Math.ceil(chunk.content.length / 4).toString(),
        metadata: chunk.metadata,
        elementType: chunk.metadata?.elementType || 'paragraph',
        pageNumber: chunk.metadata?.pageNumber || 1,
        confidence: chunk.metadata?.confidence
          ? chunk.metadata.confidence.toFixed(3)
          : null,
        adeElementId: chunk.metadata?.elementId || null,
      });
    }

    return chunks;
  }

  private formatElementContent(
    element: DocumentElement,
    analysis: DocumentAnalysis,
  ): string {
    let content = `[${element.type.toUpperCase()}] ${element.content}`;

    // Add context for better understanding
    if (element.type === 'table') {
      content = `Table on page ${element.boundingBox.pageNumber}: ${element.content}`;
    } else if (element.type === 'figure') {
      content = `Figure on page ${element.boundingBox.pageNumber}: ${element.content}`;
    } else if (element.type === 'title' || element.type === 'header') {
      content = `Section header: ${element.content}`;
    }

    // Add document context
    content += `\n\nDocument: ${analysis.title || 'Unknown'}`;
    content += `\nPage: ${element.boundingBox.pageNumber}`;
    content += `\nElement type: ${element.type}`;
    content += `\nConfidence: ${element.confidence}`;

    return content;
  }

  private async generateChunkEmbeddings(
    chunks: Array<{ id: string; content: string; metadata: any }>,
    userId: string,
  ): Promise<number> {
    let embeddingsGenerated = 0;

    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(chunk.content);

        await db.insert(documentEmbedding).values({
          documentId: chunk.metadata?.documentId,
          chunkId: chunk.id,
          embeddingType: 'text',
          embedding: JSON.stringify(embedding),
          model: 'text-embedding-3-large',
        });

        embeddingsGenerated++;
      } catch (error) {
        console.error(
          `Failed to generate embedding for chunk ${chunk.id}:`,
          error,
        );
      }
    }

    return embeddingsGenerated;
  }

  private async updateDocumentStatus(
    documentId: string,
    status:
      | 'uploaded'
      | 'processing'
      | 'text_extracted'
      | 'images_extracted'
      | 'ade_processing'
      | 'ade_processed'
      | 'chunked'
      | 'embedded'
      | 'processed'
      | 'error'
      | 'error_image_extraction'
      | 'error_ade_processing'
      | 'failed',
  ): Promise<void> {
    await db
      .update(ragDocument)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, documentId));
  }

  private async getStoredAnalysis(
    documentId: string,
  ): Promise<DocumentAnalysis | null> {
    // Get content first to check for stored analysis
    const contentResults = await db
      .select()
      .from(documentContent)
      .where(eq(documentContent.documentId, documentId))
      .limit(1);

    const content = contentResults[0];
    if (!content?.metadata || typeof content.metadata !== 'object') {
      return null;
    }

    const metadata = content.metadata as Record<string, any>;
    if (!metadata.agenticAnalysis) {
      return null;
    }

    // Get elements from stored content
    const elementsData = await db
      .select()
      .from(documentContent)
      .where(eq(documentContent.documentId, documentId))
      .limit(1);

    if (!elementsData[0]) {
      return null;
    }

    const elements = JSON.parse(elementsData[0].extractedText || '[]');
    const agenticMeta = (elementsData[0].metadata as Record<string, any>) || {};

    return {
      documentId,
      title: agenticMeta.title,
      totalPages:
        elements.length > 0
          ? Math.max(...elements.map((el: any) => el.boundingBox.pageNumber))
          : 1,
      elements,
      structure: agenticMeta.structure,
      summary: agenticMeta.summary,
      keyTopics: agenticMeta.keyTopics,
      metadata: {
        processedAt: agenticMeta.processedAt,
        totalElements: agenticMeta.totalElements,
        averageConfidence: agenticMeta.averageConfidence,
      },
    };
  }

  private async getRelatedChunks(
    documentId: string,
    relevantElements: DocumentElement[],
  ): Promise<
    Array<{
      chunkId: string;
      content: string;
      elementType: string;
      pageNumber: number;
      confidence: number;
    }>
  > {
    const elementIds = relevantElements.map((el) => el.id);

    const chunks = await db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.documentId, documentId));

    return chunks
      .filter((chunk) => {
        const metadata = chunk.metadata as any;
        return (
          metadata?.isAgenticChunk && elementIds.includes(metadata?.elementId)
        );
      })
      .map((chunk) => {
        const metadata = chunk.metadata as any;
        return {
          chunkId: chunk.id,
          content: chunk.content,
          elementType: metadata?.elementType || 'unknown',
          pageNumber: metadata?.pageNumber || 1,
          confidence: metadata?.confidence || 0,
        };
      });
  }

  private calculateElementStats(elements: DocumentElement[]): Array<{
    type: string;
    count: number;
    averageConfidence: number;
  }> {
    const stats = new Map<string, { count: number; totalConfidence: number }>();

    elements.forEach((element) => {
      const current = stats.get(element.type) || {
        count: 0,
        totalConfidence: 0,
      };
      stats.set(element.type, {
        count: current.count + 1,
        totalConfidence: current.totalConfidence + element.confidence,
      });
    });

    return Array.from(stats.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      averageConfidence: data.totalConfidence / data.count,
    }));
  }
}

/**
 * Export singleton instance
 */
export const agenticDocumentService = new AgenticDocumentService();

/**
 * Helper function to process document with agentic analysis
 */
export async function processDocumentAgentic(
  documentId: string,
  userId: string,
  options?: Partial<AgenticProcessingOptions>,
): Promise<AgenticProcessingResult> {
  return agenticDocumentService.processDocumentWithAgentic(
    documentId,
    userId,
    options,
  );
}

/**
 * Helper function to query document with agentic insights
 */
export async function queryDocumentAgentic(
  documentId: string,
  query: string,
  includeVisualContext = true,
) {
  return agenticDocumentService.queryDocumentAgentic(
    documentId,
    query,
    includeVisualContext,
  );
}
