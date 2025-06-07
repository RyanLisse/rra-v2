import type { AdeElement, AdeOutput, AdeProcessRequest } from '@/lib/ade/types';
import { createAdeTestDataFactory, createMockAdeApiResponse } from '../fixtures/ade-test-data';

/**
 * Mock ADE processor for testing enhanced RAG pipeline
 */
export class MockAdeProcessor {
  private processingDelay: number;
  private successRate: number;
  private testDataFactory = createAdeTestDataFactory();

  constructor(options?: {
    processingDelay?: number;
    successRate?: number;
  }) {
    this.processingDelay = options?.processingDelay ?? 100;
    this.successRate = options?.successRate ?? 0.95;
  }

  /**
   * Mock ADE processing with realistic output
   */
  async processDocument(request: AdeProcessRequest): Promise<AdeOutput> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, this.processingDelay));

    // Simulate occasional failures
    if (Math.random() > this.successRate) {
      throw new Error(`ADE processing failed for document ${request.documentId}`);
    }

    // Determine document characteristics from file path
    const characteristics = this.analyzeDocumentPath(request.filePath);
    
    return this.testDataFactory.createAdeOutput(
      request.documentId,
      characteristics.pageCount,
      characteristics.elementsPerPage,
      {
        confidence: characteristics.confidence,
        processingTimeMs: this.processingDelay + (Math.random() * 1000),
      },
    );
  }

  /**
   * Process multiple documents in batch
   */
  async processBatch(requests: AdeProcessRequest[]): Promise<AdeOutput[]> {
    const results: AdeOutput[] = [];
    
    // Process in parallel with some realistic delay
    const promises = requests.map(async (request, index) => {
      // Stagger the requests slightly
      await new Promise(resolve => setTimeout(resolve, index * 50));
      return this.processDocument(request);
    });

    return Promise.all(promises);
  }

  /**
   * Extract specific element types from a document
   */
  async extractElementTypes(
    documentId: string,
    elementTypes: Array<AdeElement['type']>,
    pageRange?: { start: number; end: number },
  ): Promise<AdeElement[]> {
    await new Promise(resolve => setTimeout(resolve, this.processingDelay / 2));

    const pageCount = pageRange ? (pageRange.end - pageRange.start + 1) : 10;
    const startPage = pageRange?.start ?? 1;
    
    const elements: AdeElement[] = [];
    
    for (let page = startPage; page < startPage + pageCount; page++) {
      elementTypes.forEach((elementType, index) => {
        // Create 1-2 elements of each requested type per page
        const count = Math.floor(Math.random() * 2) + 1;
        
        for (let i = 0; i < count; i++) {
          elements.push(
            this.testDataFactory.createAdeElement(elementType, page, {
              id: `filtered_${elementType}_${page}_${i}`,
            }),
          );
        }
      });
    }

    return elements;
  }

  /**
   * Simulate different document processing scenarios
   */
  async processDocumentWithScenario(
    request: AdeProcessRequest,
    scenario: 'simple' | 'complex' | 'table_heavy' | 'figure_heavy' | 'mixed',
  ): Promise<AdeOutput> {
    await new Promise(resolve => setTimeout(resolve, this.processingDelay));

    const scenarioConfigs = {
      simple: {
        pageCount: 3,
        elementsPerPage: 4,
        elementTypes: ['title', 'paragraph'],
        confidence: 0.9,
      },
      complex: {
        pageCount: 15,
        elementsPerPage: 12,
        elementTypes: ['title', 'paragraph', 'list_item', 'table', 'figure', 'header', 'footer'],
        confidence: 0.85,
      },
      table_heavy: {
        pageCount: 8,
        elementsPerPage: 6,
        elementTypes: ['title', 'table', 'table_text'],
        confidence: 0.8,
      },
      figure_heavy: {
        pageCount: 10,
        elementsPerPage: 5,
        elementTypes: ['title', 'figure', 'caption'],
        confidence: 0.75,
      },
      mixed: {
        pageCount: 12,
        elementsPerPage: 8,
        elementTypes: ['title', 'paragraph', 'list_item', 'table', 'figure'],
        confidence: 0.88,
      },
    };

    const config = scenarioConfigs[scenario];
    const elements: AdeElement[] = [];

    for (let page = 1; page <= config.pageCount; page++) {
      // Ensure each page has a title
      elements.push(
        this.testDataFactory.createAdeElement('title', page, {
          id: `${scenario}_title_${page}`,
          confidence: config.confidence + 0.05,
        }),
      );

      // Add other elements based on scenario
      for (let i = 1; i < config.elementsPerPage; i++) {
        const elementType = config.elementTypes[
          Math.floor(Math.random() * config.elementTypes.length)
        ] as AdeElement['type'];
        
        elements.push(
          this.testDataFactory.createAdeElement(elementType, page, {
            id: `${scenario}_${elementType}_${page}_${i}`,
            confidence: config.confidence + (Math.random() * 0.1 - 0.05),
          }),
        );
      }
    }

    return {
      documentId: request.documentId,
      elements,
      processingTimeMs: this.processingDelay + (elements.length * 10),
      totalElements: elements.length,
      pageCount: config.pageCount,
      confidence: config.confidence,
    };
  }

  /**
   * Simulate processing with different quality levels
   */
  async processWithQuality(
    request: AdeProcessRequest,
    quality: 'high' | 'medium' | 'low',
  ): Promise<AdeOutput> {
    const qualityConfigs = {
      high: {
        confidence: 0.92,
        processingTime: this.processingDelay * 2,
        detectionAccuracy: 0.98,
      },
      medium: {
        confidence: 0.85,
        processingTime: this.processingDelay,
        detectionAccuracy: 0.9,
      },
      low: {
        confidence: 0.75,
        processingTime: this.processingDelay * 0.5,
        detectionAccuracy: 0.8,
      },
    };

    const config = qualityConfigs[quality];
    await new Promise(resolve => setTimeout(resolve, config.processingTime));

    const baseOutput = await this.processDocument(request);
    
    // Adjust elements based on quality
    const adjustedElements = baseOutput.elements.map(element => ({
      ...element,
      confidence: Math.min(1.0, (element.confidence || 0.8) * config.detectionAccuracy),
    }));

    // Remove some elements for lower quality (simulate missed detections)
    const finalElements = quality === 'low' 
      ? adjustedElements.filter(() => Math.random() < config.detectionAccuracy)
      : adjustedElements;

    return {
      ...baseOutput,
      elements: finalElements,
      confidence: config.confidence,
      totalElements: finalElements.length,
    };
  }

  /**
   * Test error scenarios
   */
  async processWithError(
    request: AdeProcessRequest,
    errorType: 'timeout' | 'rate_limit' | 'invalid_format' | 'service_unavailable',
  ): Promise<never> {
    await new Promise(resolve => setTimeout(resolve, this.processingDelay / 2));

    const errors = {
      timeout: new Error('ADE processing timeout after 30 seconds'),
      rate_limit: new Error('Rate limit exceeded, retry after 60 seconds'),
      invalid_format: new Error('Unsupported document format or corrupted file'),
      service_unavailable: new Error('ADE service temporarily unavailable'),
    };

    throw errors[errorType];
  }

  /**
   * Generate comparison data for performance testing
   */
  generatePerformanceComparison(documentCount: number) {
    const baseline = {
      processingTime: documentCount * 500, // 500ms per document baseline
      memoryUsage: documentCount * 10 * 1024 * 1024, // 10MB per document
      accuracy: 0.7, // Basic text extraction accuracy
    };

    const enhanced = {
      processingTime: documentCount * (this.processingDelay + 200), // Additional overhead
      memoryUsage: documentCount * 15 * 1024 * 1024, // 15MB per document (more metadata)
      accuracy: 0.9, // Higher accuracy with structure detection
      structuralMetadata: documentCount * 8, // Average elements per document
    };

    return { baseline, enhanced };
  }

  /**
   * Analyze document path to determine characteristics
   */
  private analyzeDocumentPath(filePath: string): {
    pageCount: number;
    elementsPerPage: number;
    confidence: number;
  } {
    const fileName = filePath.toLowerCase();
    
    // Determine document type from filename
    if (fileName.includes('manual') || fileName.includes('guide')) {
      return {
        pageCount: 20,
        elementsPerPage: 10,
        confidence: 0.9,
      };
    } else if (fileName.includes('spec') || fileName.includes('technical')) {
      return {
        pageCount: 15,
        elementsPerPage: 12,
        confidence: 0.85,
      };
    } else if (fileName.includes('faq') || fileName.includes('quick')) {
      return {
        pageCount: 5,
        elementsPerPage: 6,
        confidence: 0.95,
      };
    } else if (fileName.includes('large') || fileName.includes('performance')) {
      return {
        pageCount: 50,
        elementsPerPage: 15,
        confidence: 0.8,
      };
    }

    // Default characteristics
    return {
      pageCount: 10,
      elementsPerPage: 8,
      confidence: 0.87,
    };
  }

  /**
   * Generate mock API response format
   */
  createMockApiResponse(
    documentId: string,
    success: boolean = true,
    elements?: AdeElement[],
  ) {
    return createMockAdeApiResponse(documentId, success, elements);
  }

  /**
   * Configure processor behavior for testing
   */
  configure(options: {
    processingDelay?: number;
    successRate?: number;
  }) {
    if (options.processingDelay !== undefined) {
      this.processingDelay = options.processingDelay;
    }
    if (options.successRate !== undefined) {
      this.successRate = options.successRate;
    }
  }

  /**
   * Reset to default configuration
   */
  reset() {
    this.processingDelay = 100;
    this.successRate = 0.95;
  }
}

/**
 * Factory for creating configured mock processors
 */
export const createMockAdeProcessor = (scenario?: 'fast' | 'slow' | 'unreliable' | 'perfect') => {
  const configs = {
    fast: { processingDelay: 50, successRate: 0.95 },
    slow: { processingDelay: 500, successRate: 0.9 },
    unreliable: { processingDelay: 200, successRate: 0.7 },
    perfect: { processingDelay: 100, successRate: 1.0 },
  };

  const config = scenario ? configs[scenario] : undefined;
  return new MockAdeProcessor(config);
};

/**
 * Integration utilities for testing
 */
export const adeTestUtils = {
  /**
   * Create test documents with realistic ADE processing scenarios
   */
  createTestDocumentWithAdeProcessing: async (
    processor: MockAdeProcessor,
    documentId: string,
    filePath: string,
    scenario?: 'simple' | 'complex' | 'table_heavy' | 'figure_heavy' | 'mixed',
  ) => {
    const request: AdeProcessRequest = {
      documentId,
      filePath,
      documentType: 'pdf',
      options: {
        extractTables: true,
        extractFigures: true,
        preserveFormatting: true,
        confidence: 0.5,
      },
    };

    if (scenario) {
      return processor.processDocumentWithScenario(request, scenario);
    } else {
      return processor.processDocument(request);
    }
  },

  /**
   * Validate ADE output structure
   */
  validateAdeOutput: (output: AdeOutput): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!output.documentId) {
      errors.push('Missing documentId');
    }

    if (!Array.isArray(output.elements)) {
      errors.push('Elements must be an array');
    } else {
      output.elements.forEach((element, index) => {
        if (!element.id) {
          errors.push(`Element ${index} missing id`);
        }
        if (!element.type) {
          errors.push(`Element ${index} missing type`);
        }
        if (!element.pageNumber || element.pageNumber < 1) {
          errors.push(`Element ${index} invalid pageNumber`);
        }
        if (element.confidence && (element.confidence < 0 || element.confidence > 1)) {
          errors.push(`Element ${index} invalid confidence value`);
        }
      });
    }

    if (output.totalElements !== undefined && output.totalElements !== output.elements.length) {
      errors.push('totalElements does not match elements array length');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Compare processing performance
   */
  measureProcessingPerformance: async (
    processor: MockAdeProcessor,
    requests: AdeProcessRequest[],
  ) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    const results = await processor.processBatch(requests);

    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    return {
      duration: endTime - startTime,
      documentsProcessed: requests.length,
      elementsExtracted: results.reduce((sum, result) => sum + result.elements.length, 0),
      averageConfidence: results.reduce((sum, result) => sum + (result.confidence || 0), 0) / results.length,
      memoryUsage: {
        heapUsedDelta: endMemory.heapUsed - startMemory.heapUsed,
        heapTotalDelta: endMemory.heapTotal - startMemory.heapTotal,
      },
      throughput: requests.length / ((endTime - startTime) / 1000), // documents per second
    };
  },
};