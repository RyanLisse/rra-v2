import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

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

  constructor(options: ProcessingOptions = {}) {
    this.options = {
      maxRetries: 3,
      ocr: false,
      preserveFormatting: true,
      extractTables: true,
      extractImages: false,
      language: 'en',
      ...options,
    };
  }

  /**
   * Process document based on file type
   */
  async processDocument(filePath: string, mimeType: string): Promise<DocumentProcessingResult> {
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
          wordCount: result.text.split(/\s+/).filter(word => word.length > 0).length,
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
  private async processPDF(filePath: string): Promise<DocumentProcessingResult> {
    let lastError: Error | null = null;
    const warnings: string[] = [];

    for (let attempt = 1; attempt <= this.options.maxRetries!; attempt++) {
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
          warnings.push(`Low text extraction confidence: ${textQuality.confidence}`);
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
        
        if (attempt < this.options.maxRetries!) {
          warnings.push(`Attempt ${attempt} failed: ${lastError.message}`);
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
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
  private async processDOCX(filePath: string): Promise<DocumentProcessingResult> {
    try {
      // This would require mammoth or similar library
      // For now, return a placeholder implementation
      return {
        success: false,
        error: 'DOCX processing not yet implemented. Please convert to PDF first.',
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
  private async processText(filePath: string): Promise<DocumentProcessingResult> {
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
  private async processMarkdown(filePath: string): Promise<DocumentProcessingResult> {
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
    cleaned = cleaned.replace(/^Page \d+ of \d+\s*$/gmi, ''); // "Page X of Y"
    
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
  private assessTextQuality(text: string): { confidence: number; issues: string[] } {
    const issues: string[] = [];
    let confidence = 1.0;
    
    // Check for common OCR artifacts
    const weirdCharacterRatio = (text.match(/[^\w\s\p{P}]/gu) || []).length / text.length;
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
    const englishWords = ['the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but'];
    const englishCount = englishWords.reduce((count, word) => 
      count + (sample.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length, 0);
    
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
      // 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX - coming soon
    ];
  }

  /**
   * Check if file type is supported
   */
  static isFileTypeSupported(mimeType: string): boolean {
    return DocumentProcessor.getSupportedFileTypes().includes(mimeType);
  }
}