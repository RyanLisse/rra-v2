/**
 * Inngest Event Type Definitions
 *
 * This file defines all event schemas used throughout the Inngest workflow system.
 * Events follow a standardized naming convention: [domain].[action]
 */

export interface EventSchemas {
  /**
   * Document Upload Events
   */
  'document.uploaded': {
    data: {
      documentId: string;
      userId: string;
      filePath: string;
      metadata?: {
        originalName?: string;
        fileSize?: number;
        mimeType?: string;
      };
    };
  };

  /**
   * Text Extraction Events
   */
  'document.text-extracted': {
    data: {
      documentId: string;
      userId: string;
      textLength: number;
      extractedAt: Date;
      metadata?: {
        extractionDuration?: number;
        language?: string;
        confidence?: number;
      };
    };
  };

  'document.extraction-failed': {
    data: {
      documentId: string;
      userId: string;
      error: string;
      failedAt: Date;
      attemptCount?: number;
    };
  };

  /**
   * Document Chunking Events
   */
  'document.chunked': {
    data: {
      documentId: string;
      userId: string;
      chunkCount: number;
      chunkedAt: Date;
      metadata?: {
        chunkingStrategy?: string;
        averageChunkSize?: number;
      };
    };
  };

  'document.chunking-failed': {
    data: {
      documentId: string;
      userId: string;
      error: string;
      failedAt: Date;
    };
  };

  /**
   * Embedding Generation Events
   */
  'document.embedded': {
    data: {
      documentId: string;
      userId: string;
      embeddingCount: number;
      embeddedAt: Date;
      metadata?: {
        embeddingModel?: string;
        vectorDimensions?: number;
      };
    };
  };

  'document.embedding-failed': {
    data: {
      documentId: string;
      userId: string;
      error: string;
      failedAt: Date;
    };
  };

  /**
   * Image Extraction Events
   */
  'document.images-extracted': {
    data: {
      documentId: string;
      userId: string;
      imagesCreated: number;
      totalPages: number;
      outputDirectory?: string;
      images?: Array<{
        id: string;
        pageNumber: number;
        imagePath: string;
        width?: number;
        height?: number;
      }>;
      metadata?: {
        conversionTime?: number;
        imageFormat?: string;
        quality?: number;
      };
    };
  };

  'document.image-extraction-failed': {
    data: {
      documentId: string;
      userId: string;
      error: string;
      failedAt: Date;
      metadata?: {
        attemptCount?: number;
        step?: string;
      };
    };
  };

  /**
   * ADE Processing Events
   */
  'document.ade-processed': {
    data: {
      documentId: string;
      userId: string;
      elementsExtracted: number;
      chunksEnhanced: number;
      averageConfidence: number;
      metadata?: {
        processingTime?: number;
        totalPages?: number;
        imagesProcessed?: number;
        provider?: string;
      };
    };
  };

  'document.ade-processing-failed': {
    data: {
      documentId: string;
      userId: string;
      error: string;
      failedAt: Date;
      metadata?: {
        attemptCount?: number;
        step?: string;
      };
    };
  };

  /**
   * General Processing Error Events
   */
  'document.processing-failed': {
    data: {
      documentId: string;
      userId: string;
      step: string;
      error: string;
      metadata?: any;
    };
  };

  /**
   * Document Processing Completion Events
   */
  'document.processed': {
    data: {
      documentId: string;
      userId: string;
      processedAt: Date;
      finalStatus: 'processed' | 'failed';
      metadata?: {
        totalProcessingTime?: number;
        pipelineSteps?: string[];
      };
    };
  };

  /**
   * User Activity Events
   */
  'user.document-viewed': {
    data: {
      userId: string;
      documentId: string;
      viewedAt: Date;
      sessionId?: string;
    };
  };

  'user.search-performed': {
    data: {
      userId: string;
      query: string;
      resultCount: number;
      searchedAt: Date;
      documentIds?: string[];
    };
  };

  /**
   * System Events
   */
  'system.health-check': {
    data: {
      timestamp: Date;
      status: 'healthy' | 'degraded' | 'unhealthy';
      metrics?: {
        responseTime?: number;
        memoryUsage?: number;
        dbConnections?: number;
      };
    };
  };

  'system.cleanup-requested': {
    data: {
      targetType: 'documents' | 'embeddings' | 'chunks' | 'temp-files';
      olderThan: Date;
      userId?: string;
    };
  };
}

/**
 * Type helper to extract event data for a specific event name
 */
export type EventData<T extends keyof EventSchemas> = EventSchemas[T]['data'];

/**
 * Union type of all possible event names
 */
export type EventName = keyof EventSchemas;

/**
 * Generic event structure
 */
export interface InngestEvent<T extends EventName = EventName> {
  name: T;
  data: EventSchemas[T]['data'];
  id?: string;
  ts?: number;
  user?: {
    id: string;
    email?: string;
  };
}

/**
 * Event validation helpers
 */
export const validateEventData = <T extends EventName>(
  eventName: T,
  data: unknown,
): data is EventSchemas[T]['data'] => {
  // Basic validation - in a real implementation, you might use Zod or similar
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Event-specific validation
  switch (eventName) {
    case 'document.uploaded':
      return (
        !!(data as any).documentId &&
        !!(data as any).userId &&
        !!(data as any).filePath
      );

    case 'document.text-extracted':
      return (
        !!(data as any).documentId &&
        !!(data as any).userId &&
        typeof (data as any).textLength === 'number' &&
        !!(data as any).extractedAt
      );

    // Add more validation as needed
    default:
      return true;
  }
};

/**
 * Event builder helpers
 */
export const createEvent = <T extends EventName>(
  name: T,
  data: EventSchemas[T]['data'],
  options?: { id?: string; user?: { id: string; email?: string } },
): InngestEvent<T> => {
  return {
    name,
    data,
    id:
      options?.id ||
      `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ts: Date.now(),
    user: options?.user,
  };
};
