import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { randomUUID } from 'node:crypto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export interface TestMetrics {
  record(name: string, value: number): void;
  startTimer(name: string): { stop: () => void };
}

export interface TestFactories {
  createUser(
    overrides?: Partial<typeof schema.user.$inferInsert>,
  ): Promise<typeof schema.user.$inferSelect>;
  createUserWithAuth(
    overrides?: Partial<typeof schema.user.$inferInsert>,
  ): Promise<{
    user: typeof schema.user.$inferSelect;
    password: string;
  }>;
  createDocument(
    overrides?: Partial<typeof schema.ragDocument.$inferInsert>,
  ): Promise<typeof schema.ragDocument.$inferSelect>;
  createUserWithDocuments(options?: {
    documentCount?: number;
    processDocuments?: boolean;
  }): Promise<{
    user: typeof schema.user.$inferSelect;
    documents: (typeof schema.ragDocument.$inferSelect)[];
  }>;
}

export interface NeonBranchContext {
  db: PostgresJsDatabase<typeof schema>;
  branchId?: string;
  metrics: TestMetrics;
  factories: TestFactories;
  cleanup: () => Promise<void>;
}

class SimpleMetrics implements TestMetrics {
  private metrics: Map<string, number[]> = new Map();

  record(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)?.push(value);
  }

  startTimer(name: string): { stop: () => void } {
    const start = Date.now();
    return {
      stop: () => {
        const duration = Date.now() - start;
        this.record(name, duration);
      },
    };
  }

  getMetrics(): Record<
    string,
    { count: number; avg: number; min: number; max: number }
  > {
    const result: Record<string, any> = {};
    for (const [name, values] of this.metrics) {
      result[name] = {
        count: values.length,
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }
    return result;
  }
}

function createTestFactories(
  database: PostgresJsDatabase<typeof schema>,
): TestFactories {
  return {
    async createUser(overrides = {}) {
      const userData = {
        id: randomUUID(),
        email: `test-${nanoid(8)}@example.com`,
        name: `Test User ${nanoid(4)}`,
        type: 'regular' as const,
        emailVerified: true,
        isAnonymous: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };

      const [user] = await database
        .insert(schema.user)
        .values(userData)
        .returning();
      return user;
    },

    async createUserWithAuth(overrides = {}) {
      const password = `password-${nanoid(8)}`;
      // For testing, we'll use a simple hash simulation
      const hashedPassword = `hashed_${password}`;

      const user = await this.createUser({
        ...overrides,
        password: hashedPassword,
      });

      return { user, password };
    },

    async createDocument(overrides = {}) {
      const userId = overrides.uploadedBy || (await this.createUser()).id;

      const documentData = {
        id: randomUUID(),
        fileName: `document-${nanoid(8)}.pdf`,
        originalName: `Test Document ${nanoid(4)}.pdf`,
        filePath: `/uploads/${nanoid()}/${nanoid()}.pdf`,
        mimeType: 'application/pdf',
        fileSize: '1024000',
        status: 'uploaded' as const,
        uploadedBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };

      const [document] = await database
        .insert(schema.ragDocument)
        .values(documentData)
        .returning();
      return document;
    },

    async createUserWithDocuments(options = {}) {
      const { documentCount = 1, processDocuments = false } = options;

      const user = await this.createUser();
      const documents = [];

      for (let i = 0; i < documentCount; i++) {
        const doc = await this.createDocument({
          uploadedBy: user.id,
          originalName: `RoboRail Documentation Part ${i + 1}.pdf`,
          status: processDocuments ? 'processed' : 'uploaded',
        });
        documents.push(doc);

        if (processDocuments) {
          // Create mock content for the document
          const [content] = await database
            .insert(schema.documentContent)
            .values({
              documentId: doc.id,
              extractedText: `This is test content for RoboRail documentation part ${i + 1}. It contains information about calibration, alignment, and chuck procedures.`,
              pageCount: '10',
              charCount: '1000',
              metadata: {},
            })
            .returning();

          // Create mock chunks
          for (let j = 0; j < 3; j++) {
            const [chunk] = await database
              .insert(schema.documentChunk)
              .values({
                documentId: doc.id,
                chunkIndex: j.toString(),
                content: `This is test chunk ${j} of document ${i}: RoboRail calibration measurement and alignment procedures. Test content for searching.`,
                tokenCount: '100',
                metadata: { startChar: j * 100, endChar: (j + 1) * 100 },
              })
              .returning();

            // Create mock embeddings
            await database.insert(schema.documentEmbedding).values({
              chunkId: chunk.id,
              embedding: JSON.stringify(
                Array(1024)
                  .fill(0)
                  .map(() => Math.random()),
              ),
              model: 'cohere-embed-v4.0',
            });
          }
        }
      }

      return { user, documents };
    },
  };
}

/**
 * Setup a Neon branch context for testing
 * This provides a simplified interface that matches what the tests expect
 */
export async function setupNeonBranch(
  suiteName: string,
): Promise<NeonBranchContext> {
  // Use test database URL if available, otherwise fall back to main database
  const databaseUrl = process.env.POSTGRES_URL_TEST || process.env.POSTGRES_URL;

  if (!databaseUrl) {
    throw new Error(
      'POSTGRES_URL or POSTGRES_URL_TEST environment variable is required',
    );
  }

  // Create a dedicated test connection
  const client = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  const db = drizzle(client, { schema });

  const metrics = new SimpleMetrics();
  const factories = createTestFactories(db);

  return {
    db,
    branchId: `test-branch-${nanoid(8)}`,
    metrics,
    factories,
    cleanup: async () => {
      // Close the database connection
      await client.end();
      console.log(`Cleanup for test suite: ${suiteName}`);
    },
  };
}
