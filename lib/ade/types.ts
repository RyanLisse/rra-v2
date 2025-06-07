import { z } from 'zod';

// ADE Element Types based on Landing AI ADE capabilities
export const ADE_ELEMENT_TYPES = [
  'paragraph',
  'table_text', 
  'figure',
  'list_item',
  'title',
  'header',
  'table',
  'caption',
  'footer'
] as const;

export type AdeElementType = typeof ADE_ELEMENT_TYPES[number];

// Zod schema for bounding box coordinates [x1, y1, x2, y2]
export const BboxSchema = z.tuple([
  z.number().min(0), // x1
  z.number().min(0), // y1
  z.number().min(0), // x2
  z.number().min(0)  // y2
]);

// Zod schema for ADE element
export const AdeElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ADE_ELEMENT_TYPES),
  content: z.string().optional(),
  imagePath: z.string().optional(),
  pageNumber: z.number().int().positive(),
  bbox: BboxSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.any()).optional(),
});

// Zod schema for ADE output
export const AdeOutputSchema = z.object({
  documentId: z.string().min(1),
  elements: z.array(AdeElementSchema),
  processingTimeMs: z.number().positive().optional(),
  totalElements: z.number().int().min(0).optional(),
  pageCount: z.number().int().positive().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

// Zod schema for ADE configuration
export const AdeConfigSchema = z.object({
  apiKey: z.string().min(1),
  endpoint: z.string().url(),
  timeout: z.number().positive().default(30000),
  retries: z.number().int().min(0).max(5).default(3),
  maxFileSize: z.number().positive().default(50 * 1024 * 1024), // 50MB
});

// Zod schema for ADE processing request
export const AdeProcessRequestSchema = z.object({
  documentId: z.string().min(1),
  filePath: z.string().min(1),
  documentType: z.enum(['pdf', 'image']),
  options: z.object({
    extractTables: z.boolean().default(true),
    extractFigures: z.boolean().default(true),
    preserveFormatting: z.boolean().default(true),
    confidence: z.number().min(0).max(1).default(0.5),
  }).optional(),
});

// TypeScript types inferred from Zod schemas
export type BoundingBox = z.infer<typeof BboxSchema>;
export type AdeElement = z.infer<typeof AdeElementSchema>;
export type AdeOutput = z.infer<typeof AdeOutputSchema>;
export type AdeConfig = z.infer<typeof AdeConfigSchema>;
export type AdeProcessRequest = z.infer<typeof AdeProcessRequestSchema>;

// Landing AI API response types (for transformation)
export interface LandingAiApiResponse {
  status: 'success' | 'error';
  data?: {
    elements: Array<{
      element_id: string;
      element_type: string;
      text_content?: string;
      image_data?: string;
      page_number: number;
      bounding_box: {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      };
      confidence_score: number;
      metadata?: Record<string, any>;
    }>;
    document_metadata: {
      total_pages: number;
      processing_time_ms: number;
      confidence_score: number;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Error types
export class AdeError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'AdeError';
  }
}

export class AdeTimeoutError extends AdeError {
  constructor(timeout: number) {
    super(`ADE processing timeout after ${timeout}ms`, 'ADE_TIMEOUT', 408);
  }
}

export class AdeRateLimitError extends AdeError {
  constructor(retryAfter: number) {
    super(`Rate limit exceeded, retry after ${retryAfter}s`, 'ADE_RATE_LIMIT', 429);
  }
}

export class AdeValidationError extends AdeError {
  constructor(message: string, details?: any) {
    super(message, 'ADE_VALIDATION', 400, details);
  }
}

// Database types for ADE elements storage
export interface DbAdeElement {
  id: string;
  documentId: string;
  adeElementId: string;
  elementType: AdeElementType;
  content?: string;
  imagePath?: string;
  pageNumber: number;
  bbox?: number[]; // Stored as JSON array
  confidence?: number;
  rawElementData: Record<string, any>; // Full ADE element data
  createdAt: Date;
  updatedAt: Date;
}

// Processing status types
export type AdeProcessingStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'rate_limited';

export interface AdeProcessingJob {
  id: string;
  documentId: string;
  status: AdeProcessingStatus;
  progress: number; // 0-100
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  retryCount: number;
  maxRetries: number;
}