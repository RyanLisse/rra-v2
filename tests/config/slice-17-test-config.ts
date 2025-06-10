import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getTestDatabaseUrl } from './neon-branch-setup';
import * as schema from '@/lib/db/schema';
import { createAdeTestDataFactory } from '../fixtures/ade-test-data';
import {
  type MockAdeProcessor,
  createMockAdeProcessor,
} from '../mocks/ade-processor';
import type { AdeElementType } from '@/lib/ade/types';

export interface Slice17TestContext {
  db: ReturnType<typeof drizzle>;
  pool: Pool;
  adeProcessor: MockAdeProcessor;
  testDataFactory: ReturnType<typeof createAdeTestDataFactory>;
  factories: {
    createUserWithAuth: () => Promise<{ user: any; session?: any }>;
    createDocumentWithAde: (
      userId: string,
      scenario?: string,
    ) => Promise<{
      document: any;
      adeOutput: any;
      chunks: any[];
    }>;
    createMixedDocumentSet: (userId: string) => Promise<{
      enhancedDocs: any[];
      legacyDocs: any[];
      allChunks: any[];
    }>;
    createPerformanceDataset: (
      userId: string,
      size: 'small' | 'medium' | 'large',
    ) => Promise<{
      documents: any[];
      chunks: any[];
      embeddings: any[];
    }>;
  };
  utils: {
    runEnhancedSearch: (
      query: string,
      filters?: EnhancedSearchFilters,
    ) => Promise<any[]>;
    formatContextForLLM: (chunks: any[], query: string) => string;
    generateCitations: (chunks: any[]) => Array<{
      id: string;
      source: string;
      content: string;
      elementType?: string;
      pageNumber?: number;
    }>;
    measureSearchPerformance: (searchFn: () => Promise<any>) => Promise<{
      duration: number;
      memoryUsage: any;
      result: any;
    }>;
  };
  cleanup: () => Promise<void>;
}

export interface EnhancedSearchFilters {
  elementTypes?: AdeElementType[];
  pageRange?: { start: number; end: number };
  documentIds?: string[];
  confidence?: { min: number; max?: number };
  spatialArea?: { x1: number; y1: number; x2: number; y2: number };
}

/**
 * Setup comprehensive test context for Slice 17 testing
 */
export async function setupSlice17TestContext(
  testSuiteName: string,
  options?: {
    adeProcessorConfig?: 'fast' | 'slow' | 'unreliable' | 'perfect';
    enablePerformanceTracking?: boolean;
    preloadTestData?: boolean;
  },
): Promise<Slice17TestContext> {
  const {
    adeProcessorConfig = 'fast',
    enablePerformanceTracking = true,
    preloadTestData = false,
  } = options || {};

  // Setup database connection
  const pool = new Pool({ connectionString: getTestDatabaseUrl() });
  const db = drizzle(pool, { schema });

  // Setup ADE processor mock
  const adeProcessor = createMockAdeProcessor(adeProcessorConfig);
  const testDataFactory = createAdeTestDataFactory();

  // Performance tracking
  const performanceMetrics: Array<{
    operation: string;
    duration: number;
    timestamp: number;
  }> = [];

  const trackPerformance = async <T>(
    operation: string,
    fn: () => Promise<T>,
  ): Promise<T> => {
    if (!enablePerformanceTracking) {
      return fn();
    }

    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;

    performanceMetrics.push({
      operation,
      duration,
      timestamp: startTime,
    });

    return result;
  };

  // Factory functions
  const factories = {
    createUserWithAuth: async () => {
      return trackPerformance('createUserWithAuth', async () => {
        const userData = {
          email: `test.${Date.now()}@example.com`,
          password: 'hashedpassword123',
          emailVerified: true,
          name: 'Test User',
          type: 'regular' as const,
        };

        const [user] = await db
          .insert(schema.user)
          .values(userData)
          .returning();

        // Create a basic session (simplified for testing)
        const sessionData = {
          userId: user.id,
          token: `token_${Date.now()}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        const [session] = await db
          .insert(schema.session)
          .values(sessionData)
          .returning();

        return { user, session };
      });
    },

    createDocumentWithAde: async (userId: string, scenario = 'mixed') => {
      return trackPerformance('createDocumentWithAde', async () => {
        // Create document
        const docData = {
          fileName: `ade_test_${Date.now()}.pdf`,
          originalName: `ADE Test Document - ${scenario}.pdf`,
          filePath: `/uploads/ade_test_${Date.now()}.pdf`,
          mimeType: 'application/pdf',
          fileSize: (5 * 1024 * 1024).toString(),
          status: 'uploaded' as const,
          uploadedBy: userId,
        };

        const [document] = await db
          .insert(schema.ragDocument)
          .values(docData)
          .returning();

        // Process with ADE
        const adeOutput = await adeProcessor.processDocumentWithScenario(
          {
            documentId: document.id,
            filePath: docData.filePath,
            documentType: 'pdf',
          },
          scenario as any,
        );

        // Create enhanced chunks
        const chunksData = testDataFactory.createEnhancedDocumentChunks(
          document.id,
          adeOutput,
          'element_per_chunk',
        );

        const chunks = await db
          .insert(schema.documentChunk)
          .values(chunksData)
          .returning();

        // Create embeddings
        const embeddingsData = chunks.map((chunk) => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(
            Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
          ),
          model: 'cohere-embed-v4.0',
        }));

        await db.insert(schema.documentEmbedding).values(embeddingsData);

        // Update document status
        await db
          .update(schema.ragDocument)
          .set({ status: 'processed' })
          .where(schema.ragDocument.id === document.id);

        return { document, adeOutput, chunks };
      });
    },

    createMixedDocumentSet: async (userId: string) => {
      return trackPerformance('createMixedDocumentSet', async () => {
        // Create enhanced documents
        const enhancedPromises = ['simple', 'complex', 'table_heavy'].map(
          (scenario) => factories.createDocumentWithAde(userId, scenario),
        );

        const enhancedResults = await Promise.all(enhancedPromises);
        const enhancedDocs = enhancedResults.map((r) => r.document);

        // Create legacy documents (without ADE metadata)
        const legacyDocs = [];
        const legacyChunks = [];

        for (let i = 0; i < 2; i++) {
          const docData = {
            fileName: `legacy_${i}_${Date.now()}.pdf`,
            originalName: `Legacy Document ${i + 1}.pdf`,
            filePath: `/uploads/legacy_${i}_${Date.now()}.pdf`,
            mimeType: 'application/pdf',
            fileSize: (3 * 1024 * 1024).toString(),
            status: 'processed' as const,
            uploadedBy: userId,
          };

          const [doc] = await db
            .insert(schema.ragDocument)
            .values(docData)
            .returning();
          legacyDocs.push(doc);

          // Create legacy chunks without ADE metadata
          const chunksData = Array.from({ length: 5 }, (_, chunkIndex) => ({
            documentId: doc.id,
            chunkIndex: chunkIndex.toString(),
            content: `Legacy chunk ${chunkIndex} without ADE metadata.`,
            metadata: { chunkIndex, legacy: true },
            tokenCount: '12',
            elementType: null,
            pageNumber: null,
            bbox: null,
          }));

          const chunks = await db
            .insert(schema.documentChunk)
            .values(chunksData)
            .returning();
          legacyChunks.push(...chunks);

          // Create embeddings for legacy chunks
          const embeddingsData = chunks.map((chunk) => ({
            chunkId: chunk.id,
            embedding: JSON.stringify(
              Array.from({ length: 1536 }, () => Math.random() * 2 - 1),
            ),
            model: 'cohere-embed-v4.0',
          }));

          await db.insert(schema.documentEmbedding).values(embeddingsData);
        }

        const allChunks = [
          ...enhancedResults.flatMap((r) => r.chunks),
          ...legacyChunks,
        ];

        return { enhancedDocs, legacyDocs, allChunks };
      });
    },

    createPerformanceDataset: async (
      userId: string,
      size: 'small' | 'medium' | 'large',
    ) => {
      return trackPerformance('createPerformanceDataset', async () => {
        const sizeConfigs = {
          small: { docCount: 5, chunksPerDoc: 20 },
          medium: { docCount: 15, chunksPerDoc: 50 },
          large: { docCount: 50, chunksPerDoc: 100 },
        };

        const config = sizeConfigs[size];
        const { documents: docTemplates, chunks: chunkTemplates } =
          testDataFactory.createPerformanceTestData(
            config.docCount,
            config.chunksPerDoc,
            userId,
          );

        // Insert documents
        const documents = await db
          .insert(schema.ragDocument)
          .values(docTemplates)
          .returning();

        // Create chunks with document IDs
        const chunksData = [];
        documents.forEach((doc, docIndex) => {
          const docChunks = chunkTemplates
            .slice(
              docIndex * config.chunksPerDoc,
              (docIndex + 1) * config.chunksPerDoc,
            )
            .map((chunk) => ({ ...chunk, documentId: doc.id }));
          chunksData.push(...docChunks);
        });

        const chunks = await db
          .insert(schema.documentChunk)
          .values(chunksData)
          .returning();

        // Create embeddings
        const embeddingsData = chunks.map((chunk) => ({
          chunkId: chunk.id,
          embedding: JSON.stringify(testDataFactory.createRealisticEmbedding()),
          model: 'cohere-embed-v4.0',
        }));

        const embeddings = await db
          .insert(schema.documentEmbedding)
          .values(embeddingsData)
          .returning();

        return { documents, chunks, embeddings };
      });
    },
  };

  // Utility functions
  const utils = {
    runEnhancedSearch: async (
      query: string,
      filters: EnhancedSearchFilters = {},
    ) => {
      return trackPerformance('runEnhancedSearch', async () => {
        const whereConditions: any[] = [];

        // Apply element type filters
        if (filters.elementTypes?.length) {
          whereConditions.push(
            schema.documentChunk.elementType.in(filters.elementTypes),
          );
        }

        // Apply page range filters
        if (filters.pageRange) {
          whereConditions.push(
            schema.documentChunk.pageNumber.gte(filters.pageRange.start),
          );
          if (filters.pageRange.end) {
            whereConditions.push(
              schema.documentChunk.pageNumber.lte(filters.pageRange.end),
            );
          }
        }

        // Apply document ID filters
        if (filters.documentIds?.length) {
          whereConditions.push(
            schema.documentChunk.documentId.in(filters.documentIds),
          );
        }

        // Basic search query
        const baseQuery = db.query.documentChunk.findMany({
          where:
            whereConditions.length > 0
              ? (chunk, { and }) =>
                  and(...whereConditions.map((condition) => condition))
              : undefined,
          with: {
            document: true,
            embedding: true,
          },
          limit: 20,
        });

        const results = await baseQuery;

        // Apply post-processing filters
        let filteredResults = results;

        // Apply confidence filtering
        if (filters.confidence) {
          filteredResults = filteredResults.filter((chunk) => {
            const confidence = chunk.metadata?.confidence || 0;
            return (
              confidence >= filters.confidence?.min &&
              (!filters.confidence?.max ||
                confidence <= filters.confidence?.max)
            );
          });
        }

        // Apply spatial filtering
        if (filters.spatialArea) {
          filteredResults = filteredResults.filter((chunk) => {
            if (!chunk.bbox || !Array.isArray(chunk.bbox)) return false;
            const [x1, y1, x2, y2] = chunk.bbox;
            const area = filters.spatialArea!;

            // Check if bounding boxes overlap
            return !(
              x2 < area.x1 ||
              x1 > area.x2 ||
              y2 < area.y1 ||
              y1 > area.y2
            );
          });
        }

        return filteredResults;
      });
    },

    formatContextForLLM: (chunks: any[], query: string) => {
      const documentName =
        chunks[0]?.document?.originalName || 'Unknown Document';
      const uniquePages = [
        ...new Set(chunks.map((c) => c.pageNumber).filter(Boolean)),
      ];
      const elementTypes = [
        ...new Set(chunks.map((c) => c.elementType).filter(Boolean)),
      ];

      const systemPrompt = `You are an AI assistant analyzing technical documentation.

Document: ${documentName}
Pages Referenced: ${uniquePages.join(', ')}
Content Types: ${elementTypes.join(', ')}
Query: ${query}

Enhanced Context:`;

      const contextWithMetadata = chunks
        .map((chunk, index) => {
          const elementTag = chunk.elementType
            ? `[${chunk.elementType.toUpperCase()}]`
            : '[CONTENT]';
          const pageInfo = chunk.pageNumber
            ? ` (Page ${chunk.pageNumber})`
            : '';
          const positionInfo = chunk.bbox
            ? ` at (${chunk.bbox[0]}, ${chunk.bbox[1]})`
            : '';

          return `${elementTag}${pageInfo}${positionInfo}:
${chunk.content}`;
        })
        .join('\n\n---\n\n');

      return `${systemPrompt}\n\n${contextWithMetadata}`;
    },

    generateCitations: (chunks: any[]) => {
      return chunks.map((chunk, index) => {
        const documentName = chunk.document?.originalName || 'Unknown Document';
        const elementType = chunk.elementType
          ? ` (${chunk.elementType.replace('_', ' ')})`
          : '';
        const pageInfo = chunk.pageNumber
          ? `, page ${chunk.pageNumber}`
          : `, chunk ${Number.parseInt(chunk.chunkIndex) + 1}`;

        return {
          id: `citation-${index + 1}`,
          source: `${documentName}${pageInfo}${elementType}`,
          content: chunk.content,
          elementType: chunk.elementType,
          pageNumber: chunk.pageNumber,
        };
      });
    },

    measureSearchPerformance: async (searchFn: () => Promise<any>) => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      const result = await searchFn();

      const endTime = Date.now();
      const endMemory = process.memoryUsage();

      return {
        duration: endTime - startTime,
        memoryUsage: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external,
        },
        result,
      };
    },
  };

  // Preload test data if requested
  if (preloadTestData) {
    const { user } = await factories.createUserWithAuth();
    await factories.createMixedDocumentSet(user.id);
  }

  const cleanup = async () => {
    if (enablePerformanceTracking && performanceMetrics.length > 0) {
      console.log('\n=== Slice 17 Performance Summary ===');
      console.log(`Test Suite: ${testSuiteName}`);
      console.log(`Total Operations: ${performanceMetrics.length}`);

      const totalDuration = performanceMetrics.reduce(
        (sum, metric) => sum + metric.duration,
        0,
      );
      console.log(`Total Duration: ${totalDuration}ms`);

      const avgDuration = totalDuration / performanceMetrics.length;
      console.log(`Average Duration: ${avgDuration.toFixed(2)}ms`);

      // Show slowest operations
      const slowest = performanceMetrics
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3);

      console.log('Slowest Operations:');
      slowest.forEach((metric, index) => {
        console.log(
          `  ${index + 1}. ${metric.operation}: ${metric.duration}ms`,
        );
      });

      console.log('=====================================\n');
    }

    await pool.end();
  };

  return {
    db,
    pool,
    adeProcessor,
    testDataFactory,
    factories,
    utils,
    cleanup,
  };
}

/**
 * Test configuration presets for different scenarios
 */
export const slice17TestPresets = {
  performance: {
    adeProcessorConfig: 'fast' as const,
    enablePerformanceTracking: true,
    preloadTestData: false,
  },
  reliability: {
    adeProcessorConfig: 'unreliable' as const,
    enablePerformanceTracking: false,
    preloadTestData: true,
  },
  comprehensive: {
    adeProcessorConfig: 'perfect' as const,
    enablePerformanceTracking: true,
    preloadTestData: true,
  },
  development: {
    adeProcessorConfig: 'fast' as const,
    enablePerformanceTracking: false,
    preloadTestData: false,
  },
};

/**
 * Assertion helpers for Slice 17 testing
 */
export const slice17Assertions = {
  /**
   * Assert that chunks have proper ADE metadata
   */
  assertEnhancedChunks: (chunks: any[]) => {
    chunks.forEach((chunk, index) => {
      if (chunk.elementType) {
        expect(chunk.elementType).toBeTruthy();
        expect(chunk.pageNumber).toBeGreaterThan(0);
        expect(chunk.bbox).toBeDefined();
        expect(Array.isArray(chunk.bbox)).toBe(true);
        expect(chunk.bbox).toHaveLength(4);
      }
    });
  },

  /**
   * Assert that search results are properly filtered
   */
  assertFilteredResults: (results: any[], filters: EnhancedSearchFilters) => {
    if (filters.elementTypes) {
      results.forEach((result) => {
        if (result.elementType) {
          expect(filters.elementTypes).toContain(result.elementType);
        }
      });
    }

    if (filters.pageRange) {
      results.forEach((result) => {
        if (result.pageNumber) {
          expect(result.pageNumber).toBeGreaterThanOrEqual(
            filters.pageRange?.start,
          );
          if (filters.pageRange?.end) {
            expect(result.pageNumber).toBeLessThanOrEqual(
              filters.pageRange?.end,
            );
          }
        }
      });
    }
  },

  /**
   * Assert that context formatting includes structural information
   */
  assertContextFormatting: (context: string, expectedElements: string[]) => {
    expectedElements.forEach((element) => {
      expect(context).toContain(`[${element.toUpperCase()}]`);
    });
    expect(context).toContain('Page ');
    expect(context).toContain('at (');
  },

  /**
   * Assert that citations include enhanced metadata
   */
  assertEnhancedCitations: (citations: any[]) => {
    citations.forEach((citation) => {
      expect(citation.source).toBeTruthy();
      expect(citation.content).toBeTruthy();

      if (citation.elementType) {
        expect(citation.source).toContain('(');
        expect(citation.source).toContain(')');
      }

      if (citation.pageNumber) {
        expect(citation.source).toContain('page');
      }
    });
  },
};
