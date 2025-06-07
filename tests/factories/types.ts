import type { InferInsertModel } from 'drizzle-orm';
import type * as schema from '@/lib/db/schema';

/**
 * Base factory configuration types
 */
export interface FactoryOptions {
  /** Override default values */
  overrides?: Record<string, any>;
  /** Generate realistic data variations */
  realistic?: boolean;
  /** Seed for deterministic random generation */
  seed?: string;
}

export interface BatchFactoryOptions extends FactoryOptions {
  /** Number of items to create */
  count: number;
  /** Callback to customize each item */
  customizer?: (index: number) => Record<string, any>;
}

export interface RelationshipOptions {
  /** Create related entities */
  withRelations?: boolean;
  /** Depth of relationship creation */
  relationDepth?: number;
  /** Skip specific relations */
  skipRelations?: string[];
}

export interface PerformanceDataOptions {
  /** Scale factor for data generation (1x, 10x, 100x) */
  scale?: 'small' | 'medium' | 'large' | 'xlarge';
  /** Include performance test scenarios */
  scenarios?: string[];
  /** Generate data with specific patterns */
  patterns?: 'sequential' | 'random' | 'mixed';
}

/**
 * Entity-specific insert types
 */
export type UserInsert = InferInsertModel<typeof schema.user>;
export type ChatInsert = InferInsertModel<typeof schema.chat>;
export type MessageInsert = InferInsertModel<typeof schema.message>;
export type DocumentInsert = InferInsertModel<typeof schema.document>;
export type RAGDocumentInsert = InferInsertModel<typeof schema.ragDocument>;
export type DocumentContentInsert = InferInsertModel<
  typeof schema.documentContent
>;
export type DocumentChunkInsert = InferInsertModel<typeof schema.documentChunk>;
export type DocumentEmbeddingInsert = InferInsertModel<
  typeof schema.documentEmbedding
>;
export type SessionInsert = InferInsertModel<typeof schema.session>;
export type AccountInsert = InferInsertModel<typeof schema.account>;
export type VoteInsert = InferInsertModel<typeof schema.vote>;
export type SuggestionInsert = InferInsertModel<typeof schema.suggestion>;
export type StreamInsert = InferInsertModel<typeof schema.stream>;

/**
 * Complex relationship types
 */
export interface CompleteUser {
  user: UserInsert;
  sessions: SessionInsert[];
  accounts: AccountInsert[];
  chats: CompleteChat[];
  documents: CompleteRAGDocument[];
}

export interface CompleteChat {
  chat: ChatInsert;
  messages: MessageInsert[];
  votes: VoteInsert[];
  streams: StreamInsert[];
}

export interface CompleteRAGDocument {
  document: RAGDocumentInsert;
  content: DocumentContentInsert;
  chunks: DocumentChunkInsert[];
  embeddings: DocumentEmbeddingInsert[];
}

/**
 * Test scenario types
 */
export interface TestScenario {
  name: string;
  description: string;
  setup: () => Promise<any>;
  cleanup?: () => Promise<void>;
  data: Record<string, any>;
}

export interface PerformanceScenario extends TestScenario {
  scale: PerformanceDataOptions['scale'];
  metrics: {
    expectedRows: number;
    maxSetupTime: number;
    maxMemoryUsage: number;
  };
}

/**
 * Factory method signatures
 */
export type FactoryMethod<T> = (options?: FactoryOptions) => T;
export type BatchFactoryMethod<T> = (options: BatchFactoryOptions) => T[];
export type AsyncFactoryMethod<T> = (options?: FactoryOptions) => Promise<T>;
export type AsyncBatchFactoryMethod<T> = (
  options: BatchFactoryOptions,
) => Promise<T[]>;

/**
 * Database seeding types
 */
export interface SeederConfig {
  /** Environment (unit, integration, e2e, performance) */
  environment: 'unit' | 'integration' | 'e2e' | 'performance';
  /** Branch ID for Neon branch-specific seeding */
  branchId?: string;
  /** Database connection string */
  databaseUrl?: string;
  /** Clean database before seeding */
  clean?: boolean;
  /** Seed data size */
  size?: 'minimal' | 'standard' | 'large';
  /** Include specific scenarios */
  scenarios?: string[];
}

export interface SeederResult {
  success: boolean;
  environment: string;
  branchId?: string;
  rowsCreated: Record<string, number>;
  executionTime: number;
  memoryUsage: number;
  errors?: Error[];
}

/**
 * Database state management types
 */
export interface DatabaseSnapshot {
  id: string;
  branchId?: string;
  timestamp: Date;
  tables: Record<string, number>;
  metadata: Record<string, any>;
}

export interface DatabaseState {
  snapshot: DatabaseSnapshot;
  restore: () => Promise<void>;
  cleanup: () => Promise<void>;
}

/**
 * Performance monitoring types
 */
export interface PerformanceMetrics {
  operationType: 'insert' | 'select' | 'update' | 'delete';
  tableName: string;
  rowCount: number;
  executionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: Date;
}

export interface PerformanceReport {
  testSuite: string;
  metrics: PerformanceMetrics[];
  summary: {
    totalQueries: number;
    totalTime: number;
    averageTime: number;
    peakMemory: number;
    recommendations: string[];
  };
}
