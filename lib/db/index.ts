import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Export ADE helpers for working with enriched document chunks
export * from './ade-helpers';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is required');
}

// Connection pool configuration for optimal performance
const connectionConfig = {
  max: 20, // Maximum number of connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout
  prepare: false, // Disable prepared statements for better performance with connection pooling
  transform: {
    undefined: null, // Transform undefined to null for better PostgreSQL compatibility
  },
};

const client = postgres(process.env.POSTGRES_URL, connectionConfig);

export const db = drizzle(client, {
  schema,
  logger: process.env.NODE_ENV === 'development',
});

// Health check function for database connectivity
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await client`SELECT 1 as health_check`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// Graceful shutdown function
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await client.end();
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}
