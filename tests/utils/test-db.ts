import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { beforeEach, afterEach } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '@/lib/db/schema';

// Test database connection
let testDb: ReturnType<typeof drizzle>;
let connection: postgres.Sql;

export function setupTestDb() {
  beforeEach(async () => {
    // Create test database connection
    const databaseUrl =
      process.env.TEST_DATABASE_URL ||
      'postgresql://test:test@localhost:5432/test_db';
    connection = postgres(databaseUrl, { max: 1 });
    testDb = drizzle(connection, { schema });

    // Run migrations
    await migrate(testDb, { migrationsFolder: './lib/db/migrations' });
  });

  afterEach(async () => {
    // Clean up all tables
    await testDb.delete(schema.documentEmbedding);
    await testDb.delete(schema.documentChunk);
    await testDb.delete(schema.documentContent);
    await testDb.delete(schema.ragDocument);
    await testDb.delete(schema.suggestion);
    await testDb.delete(schema.document);
    await testDb.delete(schema.vote);
    await testDb.delete(schema.message);
    await testDb.delete(schema.messageDeprecated);
    await testDb.delete(schema.chat);
    await testDb.delete(schema.stream);
    await testDb.delete(schema.session);
    await testDb.delete(schema.account);
    await testDb.delete(schema.user);

    await connection.end();
  });

  return () => testDb;
}

// Transaction helper for isolated tests
export async function withTransaction<T>(
  db: ReturnType<typeof drizzle>,
  callback: (tx: any) => Promise<T>,
): Promise<T> {
  return await db.transaction(callback);
}
