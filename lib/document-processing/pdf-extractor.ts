/**
 * PDF Text Extraction
 *
 * This file handles extracting text content from PDF files using pdf-parse library.
 */

import PDFParser from 'pdf-parse';

/**
 * Result type for PDF text extraction
 */
export interface PDFExtractionResult {
  text: string;
  pageCount: number;
  metadata?: {
    language?: string;
    confidence?: number;
  };
}

/**
 * Extract text content from a PDF file path or URL
 *
 * @param filePathOrUrl - Path to the PDF file or URL
 * @returns Promise<PDFExtractionResult> - The extracted text and metadata
 */
export async function extractTextFromPDF(
  filePathOrUrl: string,
): Promise<PDFExtractionResult> {
  try {
    let pdfBuffer: Buffer;

    // Handle blob URLs
    if (filePathOrUrl.startsWith('https://')) {
      const response = await fetch(filePathOrUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error('Only blob URLs are supported for PDF extraction');
    }

    // Parse the PDF using pdf-parse
    const data = await PDFParser(pdfBuffer);

    return {
      text: data.text.trim(),
      pageCount: data.numpages,
      metadata: {
        language: 'en', // Default language detection
        confidence: 0.95, // Default confidence score
      },
    };
  } catch (error) {
    throw new Error(
      `PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Extract text content from a PDF buffer
 *
 * @param pdfBuffer - The PDF file content as a Buffer
 * @returns Promise<string> - The extracted text content
 */
export async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const data = await PDFParser(pdfBuffer);
  return data.text.trim();
}

/**
 * Extract metadata from a PDF buffer
 *
 * @param pdfBuffer - The PDF file content as a Buffer
 * @returns Promise<object> - Metadata including page count, author, etc.
 */
export async function extractPdfMetadata(pdfBuffer: Buffer): Promise<{
  pageCount?: number;
  author?: string;
  title?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}> {
  try {
    const data = await PDFParser(pdfBuffer);

    return {
      pageCount: data.numpages,
      author: data.info?.Author,
      title: data.info?.Title,
      subject: data.info?.Subject,
      creator: data.info?.Creator,
      producer: data.info?.Producer,
      creationDate: data.info?.CreationDate
        ? new Date(data.info.CreationDate)
        : undefined,
      modificationDate: data.info?.ModDate
        ? new Date(data.info.ModDate)
        : undefined,
    };
  } catch (error) {
    throw new Error(
      `PDF metadata extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
