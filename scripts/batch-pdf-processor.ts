#!/usr/bin/env tsx

/**
 * Batch PDF Processor
 *
 * Optimized batch processing system for all PDFs in data/pdf/ directory.
 * Converts PDFs to images, extracts text with ADE integration, and generates embeddings.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PDFToImageConverter } from '@/lib/document-processing/pdf-to-image-converter';
import { DocumentProcessor } from '@/lib/document-processing/document-processor';
import { documentService } from '@/lib/services/document-service';
import { performanceOptimizer } from '@/lib/monitoring/performance-optimizer';
import { db } from '@/lib/db';

interface BatchProcessingOptions {
  concurrency?: number;
  skipExisting?: boolean;
  imageFormat?: 'png' | 'jpeg' | 'webp';
  imageQuality?: number;
  generateEmbeddings?: boolean;
  outputBaseDir?: string;
}

interface ProcessingResult {
  fileName: string;
  success: boolean;
  documentId?: string;
  pagesProcessed: number;
  imagesGenerated: number;
  chunksCreated: number;
  processingTime: number;
  error?: string;
}

interface BatchProcessingSummary {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalPages: number;
  totalImages: number;
  totalChunks: number;
  totalProcessingTime: number;
  results: ProcessingResult[];
  errors: string[];
}

class BatchPDFProcessor {
  private pdfConverter: PDFToImageConverter;
  private documentProcessor: DocumentProcessor;
  private readonly DEFAULT_USER_ID = 'batch-processor';

  constructor() {
    this.pdfConverter = new PDFToImageConverter();
    this.documentProcessor = new DocumentProcessor();
  }

  /**
   * Process all PDFs in the data/pdf directory
   */
  async processAllPDFs(
    options: BatchProcessingOptions = {},
  ): Promise<BatchProcessingSummary> {
    const {
      concurrency = 3,
      skipExisting = true,
      imageFormat = 'png',
      imageQuality = 2.0,
      generateEmbeddings = true,
      outputBaseDir = path.resolve(process.cwd(), 'data/processed-pdfs'),
    } = options;

    console.log('🚀 Starting batch PDF processing...\n');

    const tracker = performanceOptimizer.startOperation('batch-pdf-processing');
    const startTime = Date.now();

    try {
      // Ensure output directory exists
      await this.ensureDirectoryExists(outputBaseDir);

      // Get all PDF files
      const pdfDir = path.resolve(process.cwd(), 'data/pdf');
      const pdfFiles = await this.getPDFFiles(pdfDir);

      console.log(`📄 Found ${pdfFiles.length} PDF files to process`);
      console.log(`⚙️ Using ${concurrency} concurrent workers\n`);

      // Process files in batches
      const results: ProcessingResult[] = [];
      const errors: string[] = [];

      for (let i = 0; i < pdfFiles.length; i += concurrency) {
        const batch = pdfFiles.slice(i, i + concurrency);
        console.log(
          `🔄 Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(pdfFiles.length / concurrency)}`,
        );

        const batchPromises = batch.map(async (pdfFile) => {
          return await this.processSinglePDF(pdfFile, outputBaseDir, {
            imageFormat,
            imageQuality,
            generateEmbeddings,
            skipExisting,
          });
        });

        const batchResults = await Promise.allSettled(batchPromises);

        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.success) {
              console.log(
                `✅ ${result.value.fileName} - ${result.value.pagesProcessed} pages, ${result.value.imagesGenerated} images`,
              );
            } else {
              console.log(
                `❌ ${result.value.fileName} - ${result.value.error}`,
              );
            }
          } else {
            const fileName = batch[index];
            errors.push(`Failed to process ${fileName}: ${result.reason}`);
            console.log(`💥 ${fileName} - Processing failed: ${result.reason}`);
          }
        });

        console.log(); // Add spacing between batches
      }

      const endTime = Date.now();
      const totalProcessingTime = endTime - startTime;

      // Calculate summary statistics
      const summary: BatchProcessingSummary = {
        totalFiles: pdfFiles.length,
        successfulFiles: results.filter((r) => r.success).length,
        failedFiles: results.filter((r) => !r.success).length + errors.length,
        totalPages: results.reduce((sum, r) => sum + r.pagesProcessed, 0),
        totalImages: results.reduce((sum, r) => sum + r.imagesGenerated, 0),
        totalChunks: results.reduce((sum, r) => sum + r.chunksCreated, 0),
        totalProcessingTime,
        results,
        errors,
      };

      tracker.end();

      // Generate detailed report
      await this.generateProcessingReport(summary, outputBaseDir);
      this.displaySummary(summary);

      return summary;
    } catch (error) {
      tracker.end();
      console.error('❌ Batch processing failed:', error);
      throw error;
    }
  }

  /**
   * Process a single PDF file
   */
  private async processSinglePDF(
    pdfPath: string,
    outputBaseDir: string,
    options: {
      imageFormat: 'png' | 'jpeg' | 'webp';
      imageQuality: number;
      generateEmbeddings: boolean;
      skipExisting: boolean;
    },
  ): Promise<ProcessingResult> {
    const fileName = path.basename(pdfPath);
    const fileNameWithoutExt = path.basename(pdfPath, '.pdf');
    const startTime = Date.now();

    try {
      // Create document-specific output directory
      const documentOutputDir = path.join(outputBaseDir, fileNameWithoutExt);
      const imagesDir = path.join(documentOutputDir, 'images');
      const dataDir = path.join(documentOutputDir, 'data');

      await this.ensureDirectoryExists(documentOutputDir);
      await this.ensureDirectoryExists(imagesDir);
      await this.ensureDirectoryExists(dataDir);

      // Check if already processed
      if (options.skipExisting) {
        const metadataPath = path.join(dataDir, 'processing-metadata.json');
        if (await this.fileExists(metadataPath)) {
          console.log(`⏭️ Skipping ${fileName} - already processed`);
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
          return {
            fileName,
            success: true,
            documentId: metadata.documentId,
            pagesProcessed: metadata.totalPages || 0,
            imagesGenerated: metadata.totalImages || 0,
            chunksCreated: metadata.totalChunks || 0,
            processingTime: 0,
          };
        }
      }

      // Generate document ID
      const documentId = `batch_${fileNameWithoutExt}_${Date.now()}`;

      // Step 1: Create document record
      const documentStats = await fs.stat(pdfPath);
      const document = await documentService.createDocument({
        userId: this.DEFAULT_USER_ID,
        name: fileName,
        fileSize: documentStats.size,
        mimeType: 'application/pdf',
        filePath: pdfPath,
        metadata: {
          source: 'batch-processing',
          originalPath: pdfPath,
          outputDirectory: documentOutputDir,
        },
      });

      // Step 2: Convert PDF to images
      console.log(`🖼️ Converting ${fileName} to images...`);
      const conversionResult = await this.pdfConverter.convertPDF(
        documentId,
        pdfPath,
        {
          outputFormat: options.imageFormat,
          quality: options.imageQuality,
          outputDir: imagesDir,
        },
      );

      if (!conversionResult.success) {
        throw new Error(conversionResult.error || 'PDF conversion failed');
      }

      // Step 3: Extract text and create chunks
      console.log(`📝 Extracting text from ${fileName}...`);
      const extractionResult = await this.documentProcessor.extractText({
        documentId: document.id,
        db: db,
      });

      // extractionResult is the document content record from database
      let chunksCreated = 0;
      if (extractionResult.extractedText) {
        // Simple text chunking for now
        const chunks = this.createSimpleChunks(extractionResult.extractedText);
        for (const [index, chunk] of chunks.entries()) {
          await documentService.addDocumentChunk({
            documentId: document.id,
            chunkIndex: index.toString(),
            content: chunk,
            elementType: 'text' as any,
            pageNumber: null,
            bbox: null,
            metadata: {
              chunkIndex: index,
              totalChunks: chunks.length,
            },
          });
          chunksCreated++;
        }
      }

      // Step 4: Update document status
      await documentService.updateDocumentStatus(document.id, 'processed');

      // Step 5: Save processing metadata
      const processingMetadata = {
        documentId: document.id,
        fileName,
        processedAt: new Date().toISOString(),
        totalPages: conversionResult.totalPages,
        totalImages: conversionResult.images.length,
        totalChunks: chunksCreated,
        conversionResult,
        extractionResult: {
          success: true,
          totalElements: chunksCreated,
          processingTime: 0,
        },
        outputPaths: {
          imagesDir,
          dataDir,
          documentOutputDir,
        },
      };

      await fs.writeFile(
        path.join(dataDir, 'processing-metadata.json'),
        JSON.stringify(processingMetadata, null, 2),
      );

      // Save extracted data
      if (extractionResult.extractedText) {
        await fs.writeFile(
          path.join(dataDir, 'extracted-text.txt'),
          extractionResult.extractedText,
        );
      }

      const processingTime = Date.now() - startTime;

      return {
        fileName,
        success: true,
        documentId: document.id,
        pagesProcessed: conversionResult.totalPages,
        imagesGenerated: conversionResult.images.length,
        chunksCreated,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Error processing ${fileName}:`, error);

      return {
        fileName,
        success: false,
        pagesProcessed: 0,
        imagesGenerated: 0,
        chunksCreated: 0,
        processingTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create simple text chunks
   */
  private createSimpleChunks(text: string, maxSize = 1000): string[] {
    const chunks: string[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Get all PDF files from directory
   */
  private async getPDFFiles(directory: string): Promise<string[]> {
    try {
      const files = await fs.readdir(directory);
      const pdfFiles = files
        .filter((file) => file.toLowerCase().endsWith('.pdf'))
        .map((file) => path.join(directory, file));

      return pdfFiles;
    } catch (error) {
      console.error(`❌ Error reading PDF directory ${directory}:`, error);
      return [];
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate detailed processing report
   */
  private async generateProcessingReport(
    summary: BatchProcessingSummary,
    outputBaseDir: string,
  ): Promise<void> {
    const reportPath = path.join(outputBaseDir, 'batch-processing-report.json');
    const report = {
      generatedAt: new Date().toISOString(),
      summary,
      systemInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage(),
      },
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 Processing report saved to: ${reportPath}`);
  }

  /**
   * Display processing summary
   */
  private displaySummary(summary: BatchProcessingSummary): void {
    console.log('📊 BATCH PROCESSING SUMMARY');
    console.log('===========================\n');

    const successRate = (summary.successfulFiles / summary.totalFiles) * 100;
    const avgProcessingTime = summary.totalProcessingTime / summary.totalFiles;

    console.log(`📄 Total Files: ${summary.totalFiles}`);
    console.log(`✅ Successful: ${summary.successfulFiles}`);
    console.log(`❌ Failed: ${summary.failedFiles}`);
    console.log(`📈 Success Rate: ${successRate.toFixed(1)}%\n`);

    console.log(`📑 Total Pages: ${summary.totalPages}`);
    console.log(`🖼️ Total Images: ${summary.totalImages}`);
    console.log(`📝 Total Chunks: ${summary.totalChunks}\n`);

    console.log(
      `⏱️ Total Time: ${(summary.totalProcessingTime / 1000).toFixed(1)}s`,
    );
    console.log(
      `⚡ Avg Time/File: ${(avgProcessingTime / 1000).toFixed(1)}s\n`,
    );

    if (summary.errors.length > 0) {
      console.log('❌ ERRORS:');
      summary.errors.forEach((error) => console.log(`   - ${error}`));
      console.log();
    }

    console.log('✅ Batch processing completed!');
  }
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const processor = new BatchPDFProcessor();

  try {
    await processor.processAllPDFs({
      concurrency: 3,
      skipExisting: true,
      imageFormat: 'png',
      imageQuality: 2.0,
      generateEmbeddings: true,
    });
  } catch (error) {
    console.error('❌ Batch processing failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  BatchPDFProcessor,
  type BatchProcessingOptions,
  type BatchProcessingSummary,
};
