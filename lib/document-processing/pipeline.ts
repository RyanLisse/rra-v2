import { DocumentProcessor } from './document-processor';
import { DocumentStatusManager } from './status-manager';
import { SemanticTextSplitter } from '@/lib/chunking/text-splitter';
import { db } from '@/lib/db';
import { ragDocument, documentContent, documentChunk } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { processDocumentWithAde } from '@/lib/ade/processor';
import { saveAdeElements } from '@/lib/ade/database';

export interface ProcessingPipelineOptions {
  skipTextExtraction?: boolean;
  skipAdeProcessing?: boolean;
  skipChunking?: boolean;
  skipEmbedding?: boolean;
  maxRetries?: number;
  processingTimeout?: number; // milliseconds
  useAdeForEmbedding?: boolean; // Use ADE elements for enhanced embeddings
}

export interface PipelineResult {
  success: boolean;
  documentId: string;
  status: string;
  stats?: {
    textExtraction?: any;
    adeProcessing?: any;
    chunking?: any;
    embedding?: any;
  };
  errors?: string[];
  warnings?: string[];
}

export class DocumentProcessingPipeline {
  private options: ProcessingPipelineOptions;

  constructor(options: ProcessingPipelineOptions = {}) {
    this.options = {
      skipTextExtraction: false,
      skipAdeProcessing: true, // Default to skip ADE for now (opt-in)
      skipChunking: false,
      skipEmbedding: false,
      maxRetries: 3,
      processingTimeout: 30 * 60 * 1000, // 30 minutes
      useAdeForEmbedding: false, // Default to traditional text chunking
      ...options,
    };
  }

  /**
   * Process a document through the complete pipeline
   */
  async processDocument(
    documentId: string,
    userId: string,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const result: PipelineResult = {
      success: false,
      documentId,
      status: 'processing',
      stats: {},
      errors: [],
      warnings: [],
    };

    let statusManager: DocumentStatusManager | undefined;

    try {
      // Initialize status manager
      statusManager = await DocumentStatusManager.create(documentId);

      // Fetch document details
      const document = await db
        .select()
        .from(ragDocument)
        .where(eq(ragDocument.id, documentId))
        .limit(1)
        .then((results) => results[0]);

      const content = document
        ? await db
            .select()
            .from(documentContent)
            .where(eq(documentContent.documentId, documentId))
            .limit(1)
            .then((results) => results[0])
        : null;

      if (!document) {
        throw new Error('Document not found');
      }

      if (document.uploadedBy !== userId) {
        throw new Error('Access denied');
      }

      // Step 1: Text Extraction
      if (!this.options.skipTextExtraction && document.status === 'uploaded') {
        const textResult = await this.performTextExtraction(
          document,
          statusManager,
        );
        if (result.stats) {
          result.stats.textExtraction = textResult;
        }

        if (!textResult.success) {
          result.errors?.push(`Text extraction failed: ${textResult.error}`);
          result.status = 'error';
          return result;
        }

        if (textResult.warnings) {
          result.warnings?.push(...textResult.warnings);
        }
      }

      // Step 2: ADE Processing (optional)
      if (
        !this.options.skipAdeProcessing &&
        document.status === 'text_extracted'
      ) {
        const adeResult = await this.performAdeProcessing(
          document,
          statusManager,
        );
        if (result.stats) {
          result.stats.adeProcessing = adeResult;
        }

        if (!adeResult.success) {
          result.warnings?.push(`ADE processing failed: ${adeResult.error}`);
          // Don't fail the pipeline - continue with traditional processing
        }

        if (adeResult.warnings) {
          result.warnings?.push(...adeResult.warnings);
        }
      }

      // Step 3: Chunking
      const chunkingStatus =
        this.options.useAdeForEmbedding && !this.options.skipAdeProcessing
          ? 'ade_processed'
          : 'text_extracted';

      if (
        !this.options.skipChunking &&
        [chunkingStatus, 'processing'].includes(document.status)
      ) {
        const chunkResult = await this.performChunking(
          documentId,
          statusManager,
        );
        if (result.stats) {
          result.stats.chunking = chunkResult;
        }

        if (!chunkResult.success) {
          result.errors?.push(`Chunking failed: ${chunkResult.error}`);
          result.status = 'error';
          return result;
        }
      }

      // Step 4: Embedding (placeholder for future implementation)
      if (!this.options.skipEmbedding && document.status === 'chunked') {
        const embeddingResult = await this.performEmbedding(
          documentId,
          statusManager,
        );
        if (result.stats) {
          result.stats.embedding = embeddingResult;
        }

        if (!embeddingResult.success) {
          result.errors?.push(`Embedding failed: ${embeddingResult.error}`);
          result.status = 'error';
          return result;
        }
      }

      // Update final status
      await db
        .update(ragDocument)
        .set({
          status: 'processed',
          updatedAt: new Date(),
        })
        .where(eq(ragDocument.id, documentId));

      result.success = true;
      result.status = 'processed';

      console.log(
        `Document ${documentId} processed successfully in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      console.error(`Pipeline error for document ${documentId}:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(errorMessage);
      result.status = 'error';

      // Update document status to error
      try {
        if (statusManager) {
          await statusManager.updateStatus({
            status: 'error',
            error: errorMessage,
          });
        } else {
          await db
            .update(ragDocument)
            .set({
              status: 'error',
              updatedAt: new Date(),
            })
            .where(eq(ragDocument.id, documentId));
        }
      } catch (statusUpdateError) {
        console.error(
          'Failed to update document status to error:',
          statusUpdateError,
        );
      }
    }

    return result;
  }

  /**
   * Perform text extraction step
   */
  private async performTextExtraction(
    document: any,
    statusManager: DocumentStatusManager,
  ): Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
    stats?: any;
  }> {
    try {
      await statusManager.startStep('text_extraction');

      const processor = new DocumentProcessor({
        maxRetries: this.options.maxRetries,
        preserveFormatting: true,
        extractTables: true,
      });

      await statusManager.updateStepProgress(
        'text_extraction',
        25,
        'Processing document...',
      );

      const result = await processor.processDocument(
        document.filePath,
        document.mimeType,
      );

      if (!result.success || !result.text) {
        throw new Error(result.error || 'Failed to extract text from document');
      }

      await statusManager.updateStepProgress(
        'text_extraction',
        75,
        'Saving extracted text...',
      );

      // Save extracted text to file
      const textFilename = `${document.fileName.replace(/\.[^.]+$/, '')}.txt`;
      const textFilePath = join(process.cwd(), 'uploads', textFilename);
      await writeFile(textFilePath, result.text || '');

      // Save content to database
      await db.transaction(async (tx) => {
        await tx.insert(documentContent).values({
          documentId: document.id,
          textFilePath: textFilePath,
          extractedText:
            result.text && result.text.length > 10000 ? undefined : result.text,
          pageCount: result.metadata?.pageCount?.toString(),
          charCount: result.metadata?.charCount?.toString(),
          metadata: result.metadata,
        });

        await tx
          .update(ragDocument)
          .set({
            status: 'text_extracted',
            updatedAt: new Date(),
          })
          .where(eq(ragDocument.id, document.id));
      });

      await statusManager.completeStep('text_extraction', {
        textLength: result.text?.length || 0,
        confidence: result.metadata?.confidence,
        processingTime: result.metadata?.processingTime,
      });

      return {
        success: true,
        warnings: result.metadata?.warnings,
        stats: {
          textLength: result.text?.length || 0,
          confidence: result.metadata?.confidence,
          processingTime: result.metadata?.processingTime,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await statusManager.failStep('text_extraction', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Perform ADE processing step
   */
  private async performAdeProcessing(
    document: any,
    statusManager: DocumentStatusManager,
  ): Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
    stats?: any;
  }> {
    try {
      await statusManager.startStep('ade_processing');

      await statusManager.updateStepProgress(
        'ade_processing',
        25,
        'Preparing document for ADE...',
      );

      // Process document with ADE
      const adeOutput = await processDocumentWithAde({
        documentId: document.id,
        filePath: document.filePath,
        documentType: 'pdf',
        options: {
          extractTables: true,
          extractFigures: true,
          preserveFormatting: true,
          confidence: 0.5,
        },
      });

      await statusManager.updateStepProgress(
        'ade_processing',
        75,
        'Saving ADE elements...',
      );

      // Save ADE elements to database
      await saveAdeElements(adeOutput);

      const stats = {
        totalElements: adeOutput.totalElements,
        pageCount: adeOutput.pageCount,
        processingTimeMs: adeOutput.processingTimeMs,
        confidence: adeOutput.confidence,
        elementsByType: this.countElementsByType(adeOutput.elements),
      };

      await statusManager.completeStep('ade_processing', stats);

      return {
        success: true,
        stats,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await statusManager.failStep('ade_processing', errorMessage);

      // Log error but don't fail the pipeline
      console.warn(
        `ADE processing failed for document ${document.id}:`,
        errorMessage,
      );

      return {
        success: false,
        error: errorMessage,
        warnings: [
          'ADE processing failed, continuing with traditional text processing',
        ],
      };
    }
  }

  /**
   * Perform chunking step
   */
  private async performChunking(
    documentId: string,
    statusManager: DocumentStatusManager,
  ): Promise<{ success: boolean; error?: string; stats?: any }> {
    try {
      await statusManager.startStep('chunking');

      // Get document and content
      const document = await db
        .select()
        .from(ragDocument)
        .where(eq(ragDocument.id, documentId))
        .limit(1)
        .then((results) => results[0]);

      const content = document
        ? await db
            .select()
            .from(documentContent)
            .where(eq(documentContent.documentId, documentId))
            .limit(1)
            .then((results) => results[0])
        : null;

      if (!document || !content) {
        throw new Error('Document or content not found');
      }

      // Get text content
      let textContent: string;
      if (content.extractedText) {
        textContent = content.extractedText;
      } else if (content.textFilePath) {
        const { readFile } = await import('node:fs/promises');
        textContent = await readFile(content.textFilePath, 'utf-8');
      } else {
        throw new Error('No text content available');
      }

      await statusManager.updateStepProgress(
        'chunking',
        25,
        'Analyzing document structure...',
      );

      // Determine document type and create splitter
      const documentType = this.determineDocumentType(
        document.originalName,
        textContent,
      );
      const splitter = SemanticTextSplitter.createForDocumentType(documentType);

      await statusManager.updateStepProgress(
        'chunking',
        50,
        'Creating semantic chunks...',
      );

      // Create chunks
      const chunks = splitter.splitText(textContent, documentType);

      if (chunks.length === 0) {
        throw new Error('No chunks created from document text');
      }

      await statusManager.updateStepProgress(
        'chunking',
        75,
        'Storing chunks in database...',
      );

      // Store chunks in database
      const chunkInserts = chunks.map((chunk) => ({
        documentId: documentId,
        chunkIndex: chunk.metadata.chunkIndex.toString(),
        content: chunk.content,
        tokenCount: chunk.metadata.tokenCount.toString(),
        metadata: {
          startIndex: chunk.metadata.startIndex,
          endIndex: chunk.metadata.endIndex,
          overlap: chunk.metadata.overlap,
          documentType: chunk.metadata.documentType,
          section: chunk.metadata.section,
          quality: chunk.metadata.quality,
        },
      }));

      await db.transaction(async (tx) => {
        // Remove existing chunks if any
        await tx
          .delete(documentChunk)
          .where(eq(documentChunk.documentId, documentId));

        // Insert new chunks
        await tx.insert(documentChunk).values(chunkInserts);

        // Update document status
        await tx
          .update(ragDocument)
          .set({
            status: 'chunked',
            updatedAt: new Date(),
          })
          .where(eq(ragDocument.id, documentId));
      });

      const stats = {
        totalChunks: chunks.length,
        averageChunkSize: Math.round(
          chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) /
            chunks.length,
        ),
        documentType,
      };

      await statusManager.completeStep('chunking', stats);

      return { success: true, stats };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await statusManager.failStep('chunking', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Perform embedding step (placeholder)
   */
  private async performEmbedding(
    documentId: string,
    statusManager: DocumentStatusManager,
  ): Promise<{ success: boolean; error?: string; stats?: any }> {
    try {
      await statusManager.startStep('embedding');

      // Placeholder for embedding implementation
      // This would integrate with Cohere or other embedding services

      await statusManager.updateStepProgress(
        'embedding',
        50,
        'Generating embeddings...',
      );

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await statusManager.updateStepProgress(
        'embedding',
        100,
        'Storing embeddings...',
      );

      // Update document status
      await db
        .update(ragDocument)
        .set({
          status: 'embedded',
          updatedAt: new Date(),
        })
        .where(eq(ragDocument.id, documentId));

      await statusManager.completeStep('embedding');

      return { success: true, stats: { placeholder: true } };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await statusManager.failStep('embedding', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Determine document type for chunking strategy
   */
  private determineDocumentType(
    filename: string,
    content: string,
  ): 'academic' | 'technical' | 'general' | 'manual' | 'code' | 'markdown' {
    const filename_lower = filename.toLowerCase();

    // Check for code files
    if (filename_lower.match(/\.(js|ts|py|java|cpp|c|php|rb|go|rs)$/)) {
      return 'code';
    }

    // Check for markdown files
    if (filename_lower.match(/\.(md|markdown)$/)) {
      return 'markdown';
    }

    // Check for manual/guide indicators
    const manualKeywords = [
      'manual',
      'guide',
      'handbook',
      'documentation',
      'instruction',
      'tutorial',
    ];
    const hasManualStructure =
      /\b(step \d+|chapter \d+|section \d+|procedure|instructions)\b/i.test(
        content,
      );

    if (
      manualKeywords.some((keyword) => filename_lower.includes(keyword)) ||
      hasManualStructure
    ) {
      return 'manual';
    }

    // Check for technical indicators
    const technicalKeywords = [
      'api',
      'technical',
      'specification',
      'protocol',
      'implementation',
    ];
    const hasCodeBlocks = /```|```\n|\bfunction\b|\bclass\b|\bdef\b/.test(
      content,
    );
    const hasTechnicalTerms =
      /\b(API|HTTP|JSON|XML|SQL|database|server|client)\b/gi.test(content);

    if (
      technicalKeywords.some((keyword) => filename_lower.includes(keyword)) ||
      hasCodeBlocks ||
      hasTechnicalTerms
    ) {
      return 'technical';
    }

    // Check for academic indicators
    const academicKeywords = [
      'research',
      'paper',
      'study',
      'analysis',
      'abstract',
      'methodology',
    ];
    const hasAcademicStructure =
      /\b(abstract|methodology|conclusion|references|bibliography)\b/i.test(
        content,
      );

    if (
      academicKeywords.some((keyword) => filename_lower.includes(keyword)) ||
      hasAcademicStructure
    ) {
      return 'academic';
    }

    return 'general';
  }

  /**
   * Process multiple documents in batch
   */
  async processBatch(
    documentIds: string[],
    userId: string,
  ): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];

    for (const documentId of documentIds) {
      try {
        const result = await this.processDocument(documentId, userId);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          documentId,
          status: 'error',
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
      }
    }

    return results;
  }

  /**
   * Get pipeline configuration for different document types
   */
  static getOptimizedConfig(documentType: string): ProcessingPipelineOptions {
    const configs = {
      academic: {
        maxRetries: 3,
        processingTimeout: 45 * 60 * 1000, // 45 minutes for academic papers
      },
      technical: {
        maxRetries: 2,
        processingTimeout: 30 * 60 * 1000, // 30 minutes for technical docs
      },
      manual: {
        maxRetries: 3,
        processingTimeout: 60 * 60 * 1000, // 60 minutes for large manuals
      },
      general: {
        maxRetries: 2,
        processingTimeout: 20 * 60 * 1000, // 20 minutes for general documents
      },
    };

    return configs[documentType as keyof typeof configs] || configs.general;
  }

  /**
   * Count elements by type for ADE processing stats
   */
  private countElementsByType(elements: any[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const element of elements) {
      counts[element.type] = (counts[element.type] || 0) + 1;
    }

    return counts;
  }
}
