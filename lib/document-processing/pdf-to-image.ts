/**
 * PDF to Image Conversion Service
 *
 * Provides a unified interface for converting PDF documents to images
 * using either pdf-to-img (lightweight) or pdf2pic (feature-rich) libraries.
 *
 * @author AI Assistant
 * @version 1.0.0
 */

import { pdf } from 'pdf-to-img';
import { fromPath } from 'pdf2pic';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface ConversionOptions {
  /** Output directory for images */
  outputPath?: string;
  /** Image scale/quality (pdf-to-img: scale factor, pdf2pic: density) */
  quality?: number;
  /** Maximum pages to convert (0 = all pages) */
  maxPages?: number;
  /** Image format (png, jpg) */
  format?: 'png' | 'jpg';
  /** Image width (pdf2pic only) */
  width?: number;
  /** Image height (pdf2pic only) */
  height?: number;
  /** PDF password if protected */
  password?: string;
}

export interface ConversionResult {
  success: boolean;
  pages: number;
  outputPath: string;
  files: string[];
  timeTaken: number;
  library: 'pdf-to-img' | 'pdf2pic';
  error?: string;
}

export class PdfToImageConverter {
  private useLibrary: 'pdf-to-img' | 'pdf2pic' | 'auto' = 'auto';

  constructor(preferredLibrary: 'pdf-to-img' | 'pdf2pic' | 'auto' = 'auto') {
    this.useLibrary = preferredLibrary;
  }

  /**
   * Convert PDF to images using the best available library
   */
  async convertPdf(
    pdfPath: string,
    options: ConversionOptions = {},
  ): Promise<ConversionResult> {
    const startTime = performance.now();

    // Default options
    const opts = {
      outputPath: options.outputPath || './converted-images',
      quality: options.quality || 2.0,
      maxPages: options.maxPages || 0,
      format: options.format || ('png' as const),
      width: options.width || 595, // Default A4 width
      height: options.height || 842, // Default A4 height
      password: options.password || '',
    };

    // Ensure output directory exists
    await fs.mkdir(opts.outputPath, { recursive: true });

    try {
      // Auto-select library based on system capabilities
      const library = await this.selectLibrary();

      let result: ConversionResult;

      if (library === 'pdf-to-img') {
        result = await this.convertWithPdfToImg(pdfPath, opts);
      } else {
        result = await this.convertWithPdf2pic(pdfPath, opts);
      }

      result.timeTaken = performance.now() - startTime;
      return result;
    } catch (error) {
      return {
        success: false,
        pages: 0,
        outputPath: opts.outputPath,
        files: [],
        timeTaken: performance.now() - startTime,
        library: 'pdf-to-img', // fallback
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Convert using pdf-to-img library (pure JavaScript)
   */
  private async convertWithPdfToImg(
    pdfPath: string,
    options: Required<ConversionOptions>,
  ): Promise<ConversionResult> {
    const pdfOptions: any = {
      scale: options.quality,
    };

    if (options.password) {
      pdfOptions.password = options.password;
    }

    const document = await pdf(pdfPath, pdfOptions);
    const files: string[] = [];
    let pageCount = 0;

    for await (const image of document) {
      pageCount++;

      if (options.maxPages > 0 && pageCount > options.maxPages) {
        break;
      }

      const filename = `page-${pageCount.toString().padStart(3, '0')}.${options.format}`;
      const filepath = path.join(options.outputPath, filename);

      await fs.writeFile(filepath, image);
      files.push(filepath);
    }

    return {
      success: true,
      pages: pageCount,
      outputPath: options.outputPath,
      files,
      timeTaken: 0, // Will be set by caller
      library: 'pdf-to-img',
    };
  }

  /**
   * Convert using pdf2pic library (GraphicsMagick + Ghostscript)
   */
  private async convertWithPdf2pic(
    pdfPath: string,
    options: Required<ConversionOptions>,
  ): Promise<ConversionResult> {
    const pdf2picOptions = {
      density: Math.round(options.quality * 50), // Convert scale to density
      saveFilename: 'page',
      savePath: options.outputPath,
      format: options.format,
      width: options.width || 800,
      height: options.height || 1000,
    };

    const convert = fromPath(pdfPath, pdf2picOptions);
    const files: string[] = [];

    if (options.maxPages === 1) {
      // Single page conversion
      const result = await convert(1, { responseType: 'image' });
      if (result.path) {
        files.push(result.path);
      }

      return {
        success: true,
        pages: 1,
        outputPath: options.outputPath,
        files,
        timeTaken: 0,
        library: 'pdf2pic',
      };
    } else {
      // Bulk conversion
      const maxPages = options.maxPages || -1; // -1 = all pages
      const results = await convert.bulk(maxPages, { responseType: 'image' });

      results.forEach((result) => {
        if (result.path) {
          files.push(result.path);
        }
      });

      return {
        success: true,
        pages: results.length,
        outputPath: options.outputPath,
        files,
        timeTaken: 0,
        library: 'pdf2pic',
      };
    }
  }

  /**
   * Automatically select the best available library
   */
  private async selectLibrary(): Promise<'pdf-to-img' | 'pdf2pic'> {
    if (this.useLibrary !== 'auto') {
      return this.useLibrary;
    }

    try {
      // Test if pdf2pic dependencies are available
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      await execAsync('gm version');
      await execAsync('gs --version');

      return 'pdf2pic'; // System dependencies available
    } catch {
      return 'pdf-to-img'; // Fallback to pure JavaScript
    }
  }

  /**
   * Check system capabilities and dependencies
   */
  async checkSystemCapabilities(): Promise<{
    pdfToImg: boolean;
    pdf2pic: boolean;
    systemDeps: {
      graphicsMagick: boolean;
      ghostscript: boolean;
    };
  }> {
    const result = {
      pdfToImg: false,
      pdf2pic: false,
      systemDeps: {
        graphicsMagick: false,
        ghostscript: false,
      },
    };

    // Check pdf-to-img
    try {
      await import('pdf-to-img');
      result.pdfToImg = true;
    } catch {}

    // Check pdf2pic
    try {
      await import('pdf2pic');
      result.pdf2pic = true;
    } catch {}

    // Check system dependencies
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      try {
        await execAsync('gm version');
        result.systemDeps.graphicsMagick = true;
      } catch {}

      try {
        await execAsync('gs --version');
        result.systemDeps.ghostscript = true;
      } catch {}
    } catch {}

    return result;
  }
}

// Export convenience functions
export const convertPdfToImages = (
  pdfPath: string,
  options?: ConversionOptions,
) => {
  const converter = new PdfToImageConverter();
  return converter.convertPdf(pdfPath, options);
};

export const checkPdfConversionCapabilities = () => {
  const converter = new PdfToImageConverter();
  return converter.checkSystemCapabilities();
};
