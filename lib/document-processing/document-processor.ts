import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { TextSplitter } from '@/lib/chunking/text-splitter';
import type { CohereClient } from '@/lib/ai/cohere-client';
import {
  ADEChunkHelpers,
  type ADEElementType,
  type BoundingBox,
} from '@/lib/db/ade-helpers';
import {
  processDocumentWithAde,
  groupElementsByPage,
} from '@/lib/ade/processor';
import type { AdeOutput } from '@/lib/ade/types';

export interface DocumentProcessingResult {
  success: boolean;
  text?: string;
  metadata?: {
    pageCount?: number;
    wordCount?: number;
    charCount?: number;
    language?: string;
    processingTime?: number;
    confidence?: number;
    warnings?: string[];
  };
  error?: string;
}

export interface ProcessingOptions {
  maxRetries?: number;
  ocr?: boolean;
  preserveFormatting?: boolean;
  extractTables?: boolean;
  extractImages?: boolean;
  language?: string;
}

export class DocumentProcessor {
  private readonly options: ProcessingOptions;
  private textSplitter: TextSplitter;
  private cohereClient?: CohereClient;

  constructor(options: ProcessingOptions = {}, cohereClient?: CohereClient) {
    this.options = {
      maxRetries: 3,
      ocr: false,
      preserveFormatting: true,
      extractTables: true,
      extractImages: false,
      language: 'en',
      ...options,
    };
    this.textSplitter = new TextSplitter();
    this.cohereClient = cohereClient;
  }

  /**
   * Process document based on file type
   */
  async processDocument(
    filePath: string,
    mimeType: string,
  ): Promise<DocumentProcessingResult> {
    const startTime = Date.now();
    const extension = extname(filePath).toLowerCase();

    try {
      let result: DocumentProcessingResult;

      switch (mimeType) {
        case 'application/pdf':
          result = await this.processPDF(filePath);
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          result = await this.processDOCX(filePath);
          break;
        case 'text/plain':
          result = await this.processText(filePath);
          break;
        case 'text/markdown':
          result = await this.processMarkdown(filePath);
          break;
        default:
          // Try to process based on extension
          if (['.md', '.markdown'].includes(extension)) {
            result = await this.processMarkdown(filePath);
          } else if (['.txt', '.log'].includes(extension)) {
            result = await this.processText(filePath);
          } else if (extension === '.docx') {
            result = await this.processDOCX(filePath);
          } else {
            result = {
              success: false,
              error: `Unsupported file type: ${mimeType} (${extension})`,
            };
          }
      }

      if (result.success && result.text) {
        result.metadata = {
          ...result.metadata,
          processingTime: Date.now() - startTime,
          charCount: result.text.length,
          wordCount: result.text.split(/\s+/).filter((word) => word.length > 0)
            .length,
          language: this.detectLanguage(result.text),
        };
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Enhanced PDF processing with retry logic and better error handling
   */
  private async processPDF(
    filePath: string,
  ): Promise<DocumentProcessingResult> {
    let lastError: Error | null = null;
    const warnings: string[] = [];

    for (
      let attempt = 1;
      attempt <= (this.options.maxRetries ?? 3);
      attempt++
    ) {
      try {
        // Dynamically import pdf-parse to avoid build issues
        const pdf = (await import('pdf-parse')).default;

        const fileBuffer = await readFile(filePath);

        // Basic validation
        if (fileBuffer.length < 100) {
          throw new Error('PDF file appears to be corrupted or empty');
        }

        // Configure PDF parsing options
        const options = {
          normalizeWhitespace: true,
          disableCombineTextItems: false,
          max: 0, // Process all pages
        };

        const data = await pdf(fileBuffer, options);

        if (!data.text || data.text.trim().length === 0) {
          warnings.push('No text content extracted from PDF');

          if (this.options.ocr) {
            warnings.push('OCR processing would be attempted here');
            // Future: Add OCR processing with tesseract.js
          }

          throw new Error('No readable text found in PDF');
        }

        // Validate extracted text quality
        const textQuality = this.assessTextQuality(data.text);
        if (textQuality.confidence < 0.5) {
          warnings.push(
            `Low text extraction confidence: ${textQuality.confidence}`,
          );
        }

        // Clean and normalize text
        const cleanedText = this.cleanExtractedText(data.text);

        return {
          success: true,
          text: cleanedText,
          metadata: {
            pageCount: data.numpages || 0,
            confidence: textQuality.confidence,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < (this.options.maxRetries ?? 3)) {
          warnings.push(`Attempt ${attempt} failed: ${lastError.message}`);
          // Wait before retry with exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 1000),
          );
        }
      }
    }

    return {
      success: false,
      error: `PDF processing failed after ${this.options.maxRetries} attempts: ${lastError?.message}`,
      metadata: { warnings },
    };
  }

  /**
   * Process DOCX files
   */
  private async processDOCX(
    filePath: string,
  ): Promise<DocumentProcessingResult> {
    try {
      // Dynamically import mammoth to avoid bundling issues
      const mammoth = await import('mammoth');

      const { value, messages } = await mammoth.extractRawText({
        path: filePath,
      });

      if (!value.trim()) {
        return {
          success: false,
          error: 'DOCX file is empty or contains no readable text',
        };
      }

      const textQuality = this.assessTextQuality(value);
      const cleanedText = this.cleanExtractedText(value);

      const warnings = [
        ...(messages && messages.length > 0
          ? messages.map((m: any) => m.message)
          : []),
        ...textQuality.issues,
      ];

      return {
        success: true,
        text: cleanedText,
        metadata: {
          confidence: textQuality.confidence,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `DOCX processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Process plain text files
   */
  private async processText(
    filePath: string,
  ): Promise<DocumentProcessingResult> {
    try {
      const content = await readFile(filePath, 'utf-8');

      if (content.trim().length === 0) {
        return {
          success: false,
          error: 'Text file is empty',
        };
      }

      // Detect and handle different encodings
      const cleanedText = this.cleanExtractedText(content);

      return {
        success: true,
        text: cleanedText,
        metadata: {
          confidence: 1.0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Text processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Process Markdown files with structure preservation
   */
  private async processMarkdown(
    filePath: string,
  ): Promise<DocumentProcessingResult> {
    try {
      const content = await readFile(filePath, 'utf-8');

      if (content.trim().length === 0) {
        return {
          success: false,
          error: 'Markdown file is empty',
        };
      }

      // Preserve markdown structure while cleaning
      const cleanedText = this.preserveMarkdownStructure(content);

      return {
        success: true,
        text: cleanedText,
        metadata: {
          confidence: 1.0,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Markdown processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Clean and normalize extracted text
   */
  private cleanExtractedText(text: string): string {
    // Normalize line endings
    let cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Fix common OCR artifacts
    cleaned = cleaned.replace(/([a-z])\s*-\s*\n\s*([a-z])/g, '$1$2'); // Hyphenated words
    cleaned = cleaned.replace(/([.!?])\s*\n\s*([A-Z])/g, '$1\n\n$2'); // Sentence boundaries

    // Remove excessive whitespace while preserving paragraph breaks
    cleaned = cleaned.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
    cleaned = cleaned.replace(/\n[ \t]*\n/g, '\n\n'); // Clean paragraph breaks
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines

    // Remove page numbers and headers/footers (common patterns)
    cleaned = cleaned.replace(/^\d+\s*$/gm, ''); // Standalone page numbers
    cleaned = cleaned.replace(/^Page \d+ of \d+\s*$/gim, ''); // "Page X of Y"

    // Remove form feed characters
    cleaned = cleaned.replace(/\f/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * Preserve markdown structure during cleaning
   */
  private preserveMarkdownStructure(text: string): string {
    // Keep markdown headers, lists, and code blocks intact
    let processed = text;

    // Ensure proper spacing around headers
    processed = processed.replace(/\n(#{1,6}\s+.+)\n/g, '\n\n$1\n\n');

    // Preserve code blocks
    processed = processed.replace(/```[\s\S]*?```/g, (match) => {
      return `\n\n${match}\n\n`;
    });

    // Clean up excessive whitespace while preserving structure
    processed = processed.replace(/[ \t]+/g, ' ');
    processed = processed.replace(/\n{3,}/g, '\n\n');

    return processed.trim();
  }

  /**
   * Assess quality of extracted text
   */
  private assessTextQuality(text: string): {
    confidence: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let confidence = 1.0;

    // Check for common OCR artifacts
    const weirdCharacterRatio =
      (text.match(/[^\w\s\p{P}]/gu) || []).length / text.length;
    if (weirdCharacterRatio > 0.05) {
      issues.push('High ratio of unusual characters detected');
      confidence -= 0.3;
    }

    // Check for incomplete words (multiple single characters)
    const singleCharWords = (text.match(/\b\w\b/g) || []).length;
    const totalWords = (text.match(/\b\w+\b/g) || []).length;
    if (totalWords > 0 && singleCharWords / totalWords > 0.1) {
      issues.push('High ratio of single-character words (possible OCR errors)');
      confidence -= 0.2;
    }

    // Check for readable sentences
    const sentences = text.match(/[.!?]+/g) || [];
    const averageWordsPerSentence = totalWords / Math.max(sentences.length, 1);
    if (averageWordsPerSentence < 5 || averageWordsPerSentence > 50) {
      issues.push('Unusual sentence structure detected');
      confidence -= 0.1;
    }

    return {
      confidence: Math.max(0, Math.round(confidence * 100) / 100),
      issues,
    };
  }

  /**
   * Simple language detection
   */
  private detectLanguage(text: string): string {
    // Simple heuristic-based language detection
    // In production, consider using a proper language detection library

    const sample = text.slice(0, 1000).toLowerCase();

    // English indicators
    const englishWords = [
      'the',
      'and',
      'that',
      'have',
      'for',
      'not',
      'with',
      'you',
      'this',
      'but',
    ];
    const englishCount = englishWords.reduce(
      (count, word) =>
        count + (sample.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length,
      0,
    );

    if (englishCount > 5) return 'en';

    // Add more language detection logic as needed
    return 'unknown';
  }

  /**
   * Get supported file types
   */
  static getSupportedFileTypes(): string[] {
    return [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
  }

  /**
   * Check if file type is supported
   */
  static isFileTypeSupported(mimeType: string): boolean {
    return DocumentProcessor.getSupportedFileTypes().includes(mimeType);
  }

  /**
   * Upload document to database
   */
  async uploadDocument(params: {
    file: File;
    userId: string;
    db: any; // Use any for compatibility with different db instance types
  }) {
    const { file, userId, db } = params;

    // Validate file type
    const supportedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ];

    if (!supportedTypes.includes(file.type)) {
      throw new Error('Unsupported file type');
    }

    // Create document record
    const documentData = {
      fileName: `${nanoid()}_${file.name}`,
      originalName: file.name,
      filePath: `/uploads/${nanoid()}/${file.name}`,
      mimeType: file.type,
      fileSize: file.size.toString(),
      status: 'uploaded' as const,
      uploadedBy: userId,
    };

    const [document] = await db
      .insert(schema.ragDocument)
      .values(documentData)
      .returning();

    return document;
  }

  /**
   * Extract text from document
   */
  async extractText(params: {
    documentId: string;
    db: any; // Use any for compatibility with different db instance types
  }) {
    const { documentId, db } = params;

    // Get document
    const document = await db.query.ragDocument.findFirst({
      where: (doc: any, { eq }: any) => eq(doc.id, documentId),
    });

    if (!document) {
      throw new Error('Document not found');
    }

    try {
      // Process document
      const result = await this.processDocument(
        document.filePath,
        document.mimeType,
      );

      if (!result.success || !result.text) {
        throw new Error(result.error || 'Failed to extract text');
      }

      // Create content record
      const contentData = {
        documentId,
        extractedText: result.text,
        pageCount: result.metadata?.pageCount?.toString() || '0',
        charCount: result.text.length.toString(),
        metadata: result.metadata,
      };

      const [content] = await db
        .insert(schema.documentContent)
        .values(contentData)
        .returning();

      // Update document status
      await db
        .update(schema.ragDocument)
        .set({ status: 'text_extracted' })
        .where(eq(schema.ragDocument.id, documentId));

      return content;
    } catch (error) {
      // Update document status to error
      await db
        .update(schema.ragDocument)
        .set({ status: 'error' })
        .where(eq(schema.ragDocument.id, documentId));

      throw error;
    }
  }

  /**
   * Complete document processing pipeline with ADE integration
   */
  async processDocumentComplete(params: {
    documentId: string;
    db: any; // Use any for compatibility with different db instance types
    chunkSize?: number;
    chunkOverlap?: number;
    useADE?: boolean;
    generateEmbeddings?: boolean;
  }) {
    const {
      documentId,
      db,
      chunkSize = 500,
      chunkOverlap = 100,
      useADE = true,
      generateEmbeddings: shouldGenerateEmbeddings = true,
    } = params;

    try {
      // Get document
      const document = await db.query.ragDocument.findFirst({
        where: (doc: any, { eq }: any) => eq(doc.id, documentId),
      });

      if (!document) {
        throw new Error('Document not found');
      }

      console.log(
        `[ADE] Starting complete processing for document ${documentId}`,
      );

      // Extract text first
      const content = await this.extractText({ documentId, db });

      // Create chunks with ADE integration
      const chunks = await this.createChunks({
        documentId,
        content: content.extractedText || '',
        chunkSize,
        chunkOverlap,
        db,
        filePath: document.filePath,
        useADE,
      });

      console.log(
        `[ADE] Created ${chunks.length} chunks for document ${documentId}`,
      );

      // Generate embeddings if requested
      if (shouldGenerateEmbeddings && chunks.length > 0) {
        console.log(`[ADE] Generating embeddings for ${chunks.length} chunks`);

        const chunkData = chunks.map((chunk: any) => ({
          id: chunk.id,
          content: chunk.content,
        }));

        await this.generateEmbeddings({
          chunks: chunkData,
          db,
        });

        console.log(
          `[ADE] Successfully generated embeddings for document ${documentId}`,
        );
      }

      return {
        content,
        chunks,
        success: true,
      };
    } catch (error) {
      console.error(`[ADE] Failed to process document ${documentId}:`, error);

      // Update document status to error
      await db
        .update(schema.ragDocument)
        .set({ status: 'error' })
        .where(eq(schema.ragDocument.id, documentId));

      throw error;
    }
  }

  /**
   * Create chunks from document content with optional ADE metadata
   */
  async createChunks(params: {
    documentId: string;
    content: string;
    chunkSize?: number;
    chunkOverlap?: number;
    db: any; // Use any for compatibility with different db instance types
    filePath?: string;
    useADE?: boolean;
  }) {
    const {
      documentId,
      content,
      chunkSize = 500,
      chunkOverlap = 100,
      db,
      filePath,
      useADE = true,
    } = params;

    // Try to get ADE output if available
    let adeOutput: AdeOutput | null = null;
    if (useADE && filePath) {
      try {
        adeOutput = await this.tryGetAdeOutput(documentId, filePath);
      } catch (error) {
        console.warn(
          `[ADE] Failed to get ADE output for document ${documentId}:`,
          error,
        );
        // Continue with fallback chunking
      }
    }

    // Create chunks with ADE integration if available
    if (adeOutput && adeOutput.elements.length > 0) {
      return await this.createChunksWithADE(documentId, adeOutput, content, db);
    } else {
      return await this.createChunksTraditional(
        documentId,
        content,
        chunkSize,
        chunkOverlap,
        db,
      );
    }
  }

  /**
   * Create chunks using ADE structured elements
   */
  private async createChunksWithADE(
    documentId: string,
    adeOutput: AdeOutput,
    fallbackContent: string,
    db: any, // Use any for compatibility with different db instance types
  ) {
    const insertedChunks = [];
    let chunkIndex = 0;

    // Group elements by page for better organization
    const elementsByPage = groupElementsByPage(adeOutput.elements);

    // Process each page
    for (const [pageNumber, pageElements] of elementsByPage) {
      // Process each element on the page
      for (const element of pageElements) {
        if (!element.content?.trim()) continue;

        try {
          const chunk = await ADEChunkHelpers.createChunkWithADE({
            documentId,
            chunkIndex: chunkIndex.toString(),
            content: element.content.trim(),
            elementType: this.mapAdeElementType(element.type),
            pageNumber: element.pageNumber,
            bbox: this.mapAdeBoundingBox(element.bbox),
            metadata: {
              adeElementId: element.id,
              originalElementType: element.type,
              confidence: element.confidence,
              ...element.metadata,
            },
            tokenCount: this.estimateTokenCount(element.content).toString(),
          });

          insertedChunks.push(chunk);
          chunkIndex++;
        } catch (error) {
          console.warn(
            `[ADE] Failed to create chunk for element ${element.id}:`,
            error,
          );
          // Continue with next element
        }
      }
    }

    // Fallback: if no chunks were created from ADE, use traditional chunking
    if (insertedChunks.length === 0) {
      console.warn(
        `[ADE] No chunks created from ADE elements, falling back to traditional chunking`,
      );
      return await this.createChunksTraditional(
        documentId,
        fallbackContent,
        500,
        100,
        db,
      );
    }

    // Update document status
    await db
      .update(schema.ragDocument)
      .set({ status: 'chunked' })
      .where(eq(schema.ragDocument.id, documentId));

    console.log(
      `[ADE] Created ${insertedChunks.length} chunks with ADE metadata for document ${documentId}`,
    );
    return insertedChunks;
  }

  /**
   * Traditional chunking method (fallback)
   */
  private async createChunksTraditional(
    documentId: string,
    content: string,
    chunkSize: number,
    chunkOverlap: number,
    db: any, // Use any for compatibility with different db instance types
  ) {
    // Split content into chunks
    const chunks = this.textSplitter.splitText(content);

    // Create chunk records (traditional way, no ADE metadata)
    const chunkData = chunks.map((chunk, index) => ({
      documentId,
      chunkIndex: index.toString(),
      content: chunk.content,
      tokenCount: chunk.metadata.tokenCount.toString(),
      metadata: {
        startChar: chunk.metadata.startIndex,
        endChar: chunk.metadata.endIndex,
        ...chunk.metadata,
      },
      elementType: null, // No ADE data available
      pageNumber: null,
      bbox: null,
    }));

    const insertedChunks = await db
      .insert(schema.documentChunk)
      .values(chunkData)
      .returning();

    // Update document status
    await db
      .update(schema.ragDocument)
      .set({ status: 'chunked' })
      .where(eq(schema.ragDocument.id, documentId));

    console.log(
      `[ADE] Created ${insertedChunks.length} chunks with traditional chunking for document ${documentId}`,
    );
    return insertedChunks;
  }

  /**
   * Generate embeddings for chunks (backward compatible method)
   */
  async generateEmbeddings(params: {
    chunks: Array<{ id: string; content: string }>;
    batchSize?: number;
    db: any; // Use any for compatibility with different db instance types
  }) {
    const { chunks, batchSize = 25, db } = params;

    // Fetch full chunk data from database to get ADE metadata
    const chunkIds = chunks.map((c) => c.id);
    const fullChunks = await db.query.documentChunk.findMany({
      where: (chunk: any, { inArray }: any) => inArray(chunk.id, chunkIds),
    });

    // Create enhanced chunk objects with ADE metadata
    const enhancedChunks = chunks.map((chunk) => {
      const fullChunk = fullChunks.find((fc: any) => fc.id === chunk.id);
      return {
        id: chunk.id,
        content: chunk.content,
        elementType: fullChunk?.elementType || null,
        pageNumber: fullChunk?.pageNumber || null,
        bbox: fullChunk?.bbox || null,
        metadata: fullChunk?.metadata || null,
      };
    });

    // Use the enhanced embedding method
    return this.generateEmbeddingsWithADE({
      chunks: enhancedChunks,
      batchSize,
      db,
    });
  }

  /**
   * Try to get ADE output for a document
   */
  private async tryGetAdeOutput(
    documentId: string,
    filePath: string,
  ): Promise<AdeOutput | null> {
    try {
      // Only process PDFs with ADE for now
      if (!filePath.toLowerCase().endsWith('.pdf')) {
        return null;
      }

      console.log(`[ADE] Processing document ${documentId} with ADE`);

      const adeOutput = await processDocumentWithAde({
        documentId,
        filePath,
        documentType: 'pdf',
        options: {
          extractTables: true,
          extractFigures: true,
          preserveFormatting: true,
          confidence: 0.5,
        },
      });

      console.log(
        `[ADE] Successfully processed document ${documentId}, found ${adeOutput.elements.length} elements`,
      );
      return adeOutput;
    } catch (error) {
      console.warn(
        `[ADE] ADE processing failed for document ${documentId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Map ADE element types to our schema types
   */
  private mapAdeElementType(adeType: string): ADEElementType {
    const typeMapping: Record<string, ADEElementType> = {
      paragraph: 'paragraph',
      title: 'title',
      header: 'header',
      footer: 'footer',
      table_text: 'table_text',
      table: 'table_text',
      figure: 'figure_caption',
      caption: 'figure_caption',
      list_item: 'list_item',
      footnote: 'footnote',
    };

    const mapped = typeMapping[adeType.toLowerCase()];
    if (!mapped) {
      console.warn(
        `[ADE] Unknown element type '${adeType}', defaulting to 'paragraph'`,
      );
      return 'paragraph';
    }

    return mapped;
  }

  /**
   * Map ADE bounding box to our format
   */
  private mapAdeBoundingBox(adeBbox: any): BoundingBox {
    if (!adeBbox) return null;

    // Handle different bbox formats
    if (Array.isArray(adeBbox) && adeBbox.length === 4) {
      // [x1, y1, x2, y2] format
      return adeBbox as [number, number, number, number];
    }

    if (typeof adeBbox === 'object' && 'x1' in adeBbox) {
      // {x1, y1, x2, y2} format
      return [adeBbox.x1, adeBbox.y1, adeBbox.x2, adeBbox.y2];
    }

    console.warn(`[ADE] Invalid bounding box format:`, adeBbox);
    return null;
  }

  /**
   * Estimate token count for content
   */
  private estimateTokenCount(content: string): number {
    // Simple token estimation: roughly 4 characters per token
    return Math.ceil(content.length / 4);
  }

  /**
   * Enhanced generateEmbeddings with ADE context
   */
  async generateEmbeddingsWithADE(params: {
    chunks: Array<{
      id: string;
      content: string;
      elementType?: string | null;
      pageNumber?: number | null;
      bbox?: any;
      metadata?: any;
    }>;
    batchSize?: number;
    db: any; // Use any for compatibility with different db instance types
  }) {
    const { chunks, batchSize = 25, db } = params;

    if (!this.cohereClient) {
      // Get document ID from the first chunk
      const firstChunk = await db.query.documentChunk.findFirst({
        where: (c: any, { eq }: any) => eq(c.id, chunks[0].id),
      });

      if (!firstChunk?.documentId) {
        throw new Error('No document ID found for chunks');
      }

      const embeddings = chunks.map((chunk: any) => ({
        chunkId: chunk.id,
        documentId: firstChunk.documentId,
        embedding: JSON.stringify(
          Array(1024)
            .fill(0)
            .map(() => Math.random()),
        ),
        model: 'cohere-embed-v4.0',
      }));

      await db.insert(schema.documentEmbedding).values(embeddings);

      // Update document status
      const documentIdForUpdate = firstChunk.documentId;

      if (documentIdForUpdate) {
        await db
          .update(schema.ragDocument)
          .set({ status: 'processed' })
          .where(eq(schema.ragDocument.id, documentIdForUpdate));
      }

      return embeddings;
    }

    // Process in batches with enhanced context
    const allEmbeddings = [];
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);

      // Create enriched text for embedding with ADE context
      const enrichedTexts = batch.map((chunk) =>
        this.createEnrichedText(chunk),
      );

      // Generate embeddings via Cohere
      const embeddings =
        await this.cohereClient.generateEmbeddingBatch(enrichedTexts);

      // Get document ID from the first chunk in batch
      const batchFirstChunk = await db.query.documentChunk.findFirst({
        where: (c: any, { eq }: any) => eq(c.id, batch[0].id),
      });

      const embeddingData = batch.map((chunk, index) => ({
        chunkId: chunk.id,
        documentId: batchFirstChunk?.documentId || '',
        embedding: JSON.stringify(
          embeddings.embeddings[index]?.embedding || [],
        ),
        model: 'cohere-embed-v4.0',
      }));

      await db.insert(schema.documentEmbedding).values(embeddingData);
      allEmbeddings.push(...embeddingData);

      console.log(
        `[ADE] Generated embeddings for batch ${Math.floor(i / batchSize) + 1} (${batch.length} chunks)`,
      );
    }

    // Update document status
    const documentId = await db.query.documentChunk
      .findFirst({
        where: (c: any, { eq }: any) => eq(c.id, chunks[0].id),
      })
      .then((chunk: any) => chunk?.documentId);

    if (documentId) {
      await db
        .update(schema.ragDocument)
        .set({ status: 'processed' })
        .where(eq(schema.ragDocument.id, documentId));
    }

    console.log(
      `[ADE] Generated ${allEmbeddings.length} embeddings with ADE context`,
    );
    return allEmbeddings;
  }

  /**
   * Create enriched text for embedding with ADE metadata
   */
  private createEnrichedText(chunk: {
    content: string;
    elementType?: string | null;
    pageNumber?: number | null;
    bbox?: any;
    metadata?: any;
  }): string {
    let enrichedText = chunk.content;

    // Add element type context if available
    if (chunk.elementType) {
      const contextPrefix = `[${chunk.elementType.toUpperCase()}] `;
      enrichedText = contextPrefix + enrichedText;
    }

    // Add page number context if available
    if (chunk.pageNumber) {
      enrichedText = `Page ${chunk.pageNumber}: ${enrichedText}`;
    }

    // Add structural context from metadata if available
    if (chunk.metadata?.is_primary_title) {
      enrichedText = `[DOCUMENT TITLE] ${enrichedText}`;
    }

    if (chunk.metadata?.element_type === 'data_table') {
      enrichedText = `[TABLE DATA] ${enrichedText}`;
    }

    return enrichedText.trim();
  }

  /**
   * Hash content for deduplication
   */
  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
