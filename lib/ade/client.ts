import {
  type AdeConfig,
  AdeConfigSchema,
  type LandingAiApiResponse,
  AdeError,
  AdeTimeoutError,
  AdeRateLimitError,
  AdeValidationError,
} from './types';
import { readFile } from 'node:fs/promises';

/**
 * Landing AI ADE (Advanced Document Extraction) Client
 * Handles communication with Landing AI's ADE API for structured document processing
 */
export class AdeClient {
  private readonly config: AdeConfig;

  constructor(config: Partial<AdeConfig>) {
    // Validate and set defaults for configuration
    const validatedConfig = AdeConfigSchema.parse({
      apiKey: config.apiKey || process.env.LANDING_AI_API_KEY,
      endpoint:
        config.endpoint ||
        process.env.LANDING_AI_ENDPOINT ||
        'https://api.landing.ai/v1/ade',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024,
    });

    this.config = validatedConfig;

    if (!this.config.apiKey) {
      throw new AdeValidationError('Landing AI API key is required');
    }
  }

  /**
   * Process a document through Landing AI ADE
   */
  async processDocument(
    filePath: string,
    documentId: string,
  ): Promise<LandingAiApiResponse> {
    try {
      // Validate file exists and size
      const fileBuffer = await this.validateAndReadFile(filePath);

      // Prepare the request
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([fileBuffer]),
        filePath.split('/').pop(),
      );
      formData.append('document_id', documentId);
      formData.append('extract_tables', 'true');
      formData.append('extract_figures', 'true');
      formData.append('preserve_formatting', 'true');

      // Execute request with retries
      return await this.executeWithRetries(async () => {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'X-Document-ID': documentId,
          },
          body: formData,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        return await this.handleResponse(response);
      });
    } catch (error) {
      if (error instanceof AdeError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new AdeTimeoutError(this.config.timeout);
      }

      throw new AdeError(
        `Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ADE_PROCESSING_ERROR',
        500,
        error,
      );
    }
  }

  /**
   * Simulate ADE processing for development/testing
   * This provides a realistic simulation when Landing AI API is not available
   */
  async simulateProcessing(
    filePath: string,
    documentId: string,
  ): Promise<LandingAiApiResponse> {
    // Add realistic processing delay
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 2000),
    );

    // Generate mock elements based on file type and size
    const fileBuffer = await this.validateAndReadFile(filePath);
    const fileSize = fileBuffer.length;
    const estimatedPages = Math.max(1, Math.floor(fileSize / (100 * 1024))); // Rough estimate

    const mockElements = this.generateMockElements(documentId, estimatedPages);

    return {
      status: 'success',
      data: {
        elements: mockElements,
        document_metadata: {
          total_pages: estimatedPages,
          processing_time_ms: 1500 + Math.random() * 1000,
          confidence_score: 0.85 + Math.random() * 0.1,
        },
      },
    };
  }

  /**
   * Get processing status (for async operations)
   */
  async getProcessingStatus(jobId: string): Promise<{
    status: string;
    progress: number;
    result?: LandingAiApiResponse;
  }> {
    try {
      const response = await fetch(`${this.config.endpoint}/status/${jobId}`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(10000), // Shorter timeout for status checks
      });

      if (!response.ok) {
        throw new AdeError(
          `Failed to get processing status: ${response.statusText}`,
          'ADE_STATUS_ERROR',
          response.status,
        );
      }

      return await response.json();
    } catch (error) {
      throw new AdeError(
        `Failed to get processing status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ADE_STATUS_ERROR',
        500,
        error,
      );
    }
  }

  private async validateAndReadFile(filePath: string): Promise<Buffer> {
    try {
      const fileBuffer = await readFile(filePath);

      if (fileBuffer.length > this.config.maxFileSize) {
        throw new AdeValidationError(
          `File size ${fileBuffer.length} exceeds maximum allowed size ${this.config.maxFileSize}`,
        );
      }

      // Validate file type (basic check)
      if (!filePath.toLowerCase().endsWith('.pdf')) {
        throw new AdeValidationError(
          'Only PDF files are currently supported for ADE processing',
        );
      }

      return fileBuffer;
    } catch (error) {
      if (error instanceof AdeError) {
        throw error;
      }
      throw new AdeValidationError(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async executeWithRetries<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors or rate limits
        if (
          error instanceof AdeValidationError ||
          error instanceof AdeRateLimitError
        ) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === this.config.retries) {
          break;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  private async handleResponse(
    response: Response,
  ): Promise<LandingAiApiResponse> {
    if (response.status === 429) {
      const retryAfter = Number.parseInt(
        response.headers.get('Retry-After') || '60',
      );
      throw new AdeRateLimitError(retryAfter);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new AdeError(
        `ADE API error: ${response.statusText}`,
        'ADE_API_ERROR',
        response.status,
        errorText,
      );
    }

    try {
      const data = await response.json();

      if (data.status === 'error') {
        throw new AdeError(
          data.error?.message || 'ADE processing failed',
          data.error?.code || 'ADE_PROCESSING_ERROR',
          500,
          data.error,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof AdeError) {
        throw error;
      }
      throw new AdeError(
        `Failed to parse ADE response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ADE_RESPONSE_ERROR',
        500,
        error,
      );
    }
  }

  private generateMockElements(documentId: string, pageCount: number) {
    const elements = [];
    let elementId = 1;

    for (let page = 1; page <= pageCount; page++) {
      // Generate title/header
      elements.push({
        element_id: `${documentId}-elem-${elementId++}`,
        element_type: 'title',
        text_content: `Document Title - Page ${page}`,
        page_number: page,
        bounding_box: { x1: 50, y1: 50, x2: 550, y2: 80 },
        confidence_score: 0.92 + Math.random() * 0.07,
        metadata: { is_primary_title: page === 1 },
      });

      // Generate paragraphs
      const paragraphCount = 2 + Math.floor(Math.random() * 4);
      for (let p = 0; p < paragraphCount; p++) {
        elements.push({
          element_id: `${documentId}-elem-${elementId++}`,
          element_type: 'paragraph',
          text_content: `This is a simulated paragraph ${p + 1} on page ${page}. It contains realistic text content for testing ADE integration with proper structure and formatting.`,
          page_number: page,
          bounding_box: {
            x1: 50,
            y1: 100 + p * 60,
            x2: 550,
            y2: 150 + p * 60,
          },
          confidence_score: 0.88 + Math.random() * 0.1,
        });
      }

      // Occasionally add table or figure
      if (Math.random() > 0.6) {
        const isTable = Math.random() > 0.5;
        elements.push({
          element_id: `${documentId}-elem-${elementId++}`,
          element_type: isTable ? 'table' : 'figure',
          text_content: isTable
            ? 'Column 1\tColumn 2\tColumn 3\nValue 1\tValue 2\tValue 3'
            : undefined,
          image_data: !isTable
            ? `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==`
            : undefined,
          page_number: page,
          bounding_box: { x1: 50, y1: 400, x2: 550, y2: 500 },
          confidence_score: 0.85 + Math.random() * 0.1,
          metadata: { element_type: isTable ? 'data_table' : 'chart' },
        });
      }
    }

    return elements;
  }
}

// Default client instance with environment configuration
let defaultClient: AdeClient | null = null;

export function getAdeClient(config?: Partial<AdeConfig>): AdeClient {
  if (!defaultClient || config) {
    defaultClient = new AdeClient(config || {});
  }
  return defaultClient;
}
