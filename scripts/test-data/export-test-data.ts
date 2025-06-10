#!/usr/bin/env bun

/**
 * Test Data Export Script
 *
 * This script exports test data from databases for sharing, backup,
 * or importing into other environments.
 *
 * Usage:
 *   bun run scripts/test-data/export-test-data.ts --env=unit --format=json
 *   bun run scripts/test-data/export-test-data.ts --branch=test-123 --format=sql
 *   bun run scripts/test-data/export-test-data.ts --tables=users,chats --output=./exports/
 */

import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';
import { getTestBranchManager } from '@/lib/testing/neon-test-branches';

interface ExportOptions {
  environment?: 'unit' | 'integration' | 'e2e' | 'performance';
  branch?: string;
  databaseUrl?: string;
  format: 'json' | 'sql' | 'csv';
  output: string;
  tables: string[];
  compress: boolean;
  includeSchema: boolean;
  anonymize: boolean;
  limit?: number;
  verbose: boolean;
}

interface ExportResult {
  format: string;
  tables: Record<string, number>;
  files: string[];
  size: number;
  executionTime: number;
}

/**
 * Parse command line arguments
 */
function parseArguments(): ExportOptions {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      env: { type: 'string', short: 'e' },
      branch: { type: 'string', short: 'b' },
      database: { type: 'string', short: 'd' },
      format: { type: 'string', short: 'f', default: 'json' },
      output: { type: 'string', short: 'o', default: './exports' },
      tables: { type: 'string', multiple: true },
      compress: { type: 'boolean', short: 'c', default: false },
      'include-schema': { type: 'boolean', default: false },
      anonymize: { type: 'boolean', short: 'a', default: false },
      limit: { type: 'string' },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  return {
    environment: values.env as any,
    branch: values.branch,
    databaseUrl: values.database,
    format: (values.format as any) || 'json',
    output: values.output || './exports',
    tables: values.tables || [],
    compress: values.compress ?? false,
    includeSchema: values['include-schema'] ?? false,
    anonymize: values.anonymize ?? false,
    limit: values.limit ? Number.parseInt(values.limit) : undefined,
    verbose: values.verbose ?? false,
  };
}

/**
 * Print help information
 */
function printHelp(): void {
  console.log(`
Test Data Export Script

Usage:
  bun run scripts/test-data/export-test-data.ts [options]

Options:
  -e, --env <env>          Environment: unit, integration, e2e, performance
  -b, --branch <branch>    Neon branch ID to export from
  -d, --database <url>     Database URL to export from
  -f, --format <format>    Export format: json, sql, csv (default: json)
  -o, --output <path>      Output directory (default: ./exports)
  --tables <tables>        Specific tables to export (comma-separated)
  -c, --compress           Compress output files
  --include-schema         Include schema definition
  -a, --anonymize          Anonymize sensitive data
  --limit <number>         Limit rows per table
  -v, --verbose            Verbose output
  -h, --help               Show this help

Examples:
  # Export all data as JSON
  bun run scripts/test-data/export-test-data.ts --env=unit --format=json

  # Export specific tables as SQL
  bun run scripts/test-data/export-test-data.ts --tables=users,chats --format=sql

  # Export anonymized data
  bun run scripts/test-data/export-test-data.ts --anonymize --format=json

  # Export from Neon branch
  bun run scripts/test-data/export-test-data.ts --branch=br-test-123

Available Tables:
  users, sessions, accounts, chats, messages, votes, documents, suggestions,
  streams, ragDocuments, documentContent, documentChunks, documentEmbeddings
`);
}

/**
 * Get database connection
 */
async function getDatabaseConnection(
  options: ExportOptions,
): Promise<{ db: any; connection: postgres.Sql }> {
  let databaseUrl: string;

  if (options.branch) {
    if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
      throw new Error(
        'NEON_API_KEY and NEON_PROJECT_ID required for branch operations',
      );
    }

    const branchManager = getTestBranchManager();
    const connectionString = branchManager.getConnectionString(options.branch);

    if (!connectionString) {
      throw new Error(
        `Could not get connection string for branch: ${options.branch}`,
      );
    }

    databaseUrl = connectionString;
  } else {
    databaseUrl =
      options.databaseUrl ||
      process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://test:test@localhost:5432/test_db';
  }

  const connection = postgres(databaseUrl, { max: 5 });
  const db = drizzle(connection, { schema });

  return { db, connection };
}

/**
 * Get table definitions and data
 */
async function getTableData(
  db: any,
  tableName: string,
  options: ExportOptions,
): Promise<any[]> {
  const table = getTableByName(tableName);
  if (!table) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  if (options.verbose) {
    console.log(`  📊 Exporting ${tableName}...`);
  }

  let query = db.select().from(table);

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const data = await query;

  // Anonymize if requested
  if (options.anonymize) {
    return anonymizeData(data, tableName);
  }

  return data;
}

/**
 * Get table by name
 */
function getTableByName(tableName: string): any {
  const tableMap: Record<string, any> = {
    users: schema.user,
    sessions: schema.session,
    accounts: schema.account,
    chats: schema.chat,
    messages: schema.message,
    votes: schema.vote,
    documents: schema.document,
    suggestions: schema.suggestion,
    streams: schema.stream,
    ragDocuments: schema.ragDocument,
    documentContent: schema.documentContent,
    documentChunks: schema.documentChunk,
    documentEmbeddings: schema.documentEmbedding,
  };

  return tableMap[tableName];
}

/**
 * Anonymize sensitive data
 */
function anonymizeData(data: any[], tableName: string): any[] {
  const anonymizers: Record<string, (item: any) => any> = {
    users: (user) => ({
      ...user,
      email: user.email ? `user${user.id.slice(0, 8)}@example.com` : null,
      name: user.name ? `User ${user.id.slice(0, 8)}` : null,
      password: '***ANONYMIZED***',
    }),
    sessions: (session) => ({
      ...session,
      token: '***ANONYMIZED***',
      ipAddress: '127.0.0.1',
      userAgent: 'Anonymized User Agent',
    }),
    accounts: (account) => ({
      ...account,
      accessToken: '***ANONYMIZED***',
      refreshToken: '***ANONYMIZED***',
      idToken: '***ANONYMIZED***',
      accountId: `anon_${account.id.slice(0, 8)}`,
    }),
  };

  const anonymizer = anonymizers[tableName];
  if (!anonymizer) {
    return data;
  }

  return data.map(anonymizer);
}

/**
 * Export data as JSON
 */
async function exportAsJSON(
  tableData: Record<string, any[]>,
  options: ExportOptions,
): Promise<string[]> {
  const files: string[] = [];

  for (const [tableName, data] of Object.entries(tableData)) {
    const filename = `${tableName}.json`;
    const filepath = join(options.output, filename);

    const exportData = {
      table: tableName,
      exported_at: new Date().toISOString(),
      row_count: data.length,
      anonymized: options.anonymize,
      data,
    };

    await writeFile(filepath, JSON.stringify(exportData, null, 2));
    files.push(filepath);

    if (options.verbose) {
      console.log(`  ✓ Exported ${data.length} rows to ${filename}`);
    }
  }

  return files;
}

/**
 * Export data as SQL
 */
async function exportAsSQL(
  tableData: Record<string, any[]>,
  options: ExportOptions,
): Promise<string[]> {
  const files: string[] = [];

  for (const [tableName, data] of Object.entries(tableData)) {
    const filename = `${tableName}.sql`;
    const filepath = join(options.output, filename);

    const lines: string[] = [];

    // Add header
    lines.push(`-- Export of ${tableName}`);
    lines.push(`-- Exported at: ${new Date().toISOString()}`);
    lines.push(`-- Row count: ${data.length}`);
    lines.push(`-- Anonymized: ${options.anonymize}`);
    lines.push('');

    if (data.length > 0) {
      // Get column names from first row
      const columns = Object.keys(data[0]);
      const quotedColumns = columns.map((col) => `"${col}"`).join(', ');

      // Generate INSERT statements
      const tableName_postgres = getPostgresTableName(tableName);

      for (const row of data) {
        const values = columns
          .map((col) => {
            const value = row[col];
            if (value === null || value === undefined) {
              return 'NULL';
            }
            if (typeof value === 'string') {
              return `'${value.replace(/'/g, "''")}'`;
            }
            if (typeof value === 'boolean') {
              return value ? 'TRUE' : 'FALSE';
            }
            if (value instanceof Date) {
              return `'${value.toISOString()}'`;
            }
            if (typeof value === 'object') {
              return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
            }
            return String(value);
          })
          .join(', ');

        lines.push(
          `INSERT INTO "${tableName_postgres}" (${quotedColumns}) VALUES (${values});`,
        );
      }
    }

    await writeFile(filepath, lines.join('\n'));
    files.push(filepath);

    if (options.verbose) {
      console.log(`  ✓ Exported ${data.length} rows to ${filename}`);
    }
  }

  return files;
}

/**
 * Export data as CSV
 */
async function exportAsCSV(
  tableData: Record<string, any[]>,
  options: ExportOptions,
): Promise<string[]> {
  const files: string[] = [];

  for (const [tableName, data] of Object.entries(tableData)) {
    const filename = `${tableName}.csv`;
    const filepath = join(options.output, filename);

    if (data.length === 0) {
      await writeFile(filepath, '');
      files.push(filepath);
      continue;
    }

    const lines: string[] = [];

    // Header row
    const columns = Object.keys(data[0]);
    lines.push(columns.map((col) => `"${col}"`).join(','));

    // Data rows
    for (const row of data) {
      const values = columns
        .map((col) => {
          const value = row[col];
          if (value === null || value === undefined) {
            return '';
          }
          if (typeof value === 'object') {
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          }
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(',');

      lines.push(values);
    }

    await writeFile(filepath, lines.join('\n'));
    files.push(filepath);

    if (options.verbose) {
      console.log(`  ✓ Exported ${data.length} rows to ${filename}`);
    }
  }

  return files;
}

/**
 * Get PostgreSQL table name from schema name
 */
function getPostgresTableName(schemaName: string): string {
  const tableMap: Record<string, string> = {
    users: 'User',
    sessions: 'Session',
    accounts: 'Account',
    chats: 'Chat',
    messages: 'Message_v2',
    votes: 'Vote_v2',
    documents: 'Document',
    suggestions: 'Suggestion',
    streams: 'Stream',
    ragDocuments: 'RAGDocument',
    documentContent: 'DocumentContent',
    documentChunks: 'DocumentChunk',
    documentEmbeddings: 'DocumentEmbedding',
  };

  return tableMap[schemaName] || schemaName;
}

/**
 * Get all table names
 */
function getAllTableNames(): string[] {
  return [
    'users',
    'sessions',
    'accounts',
    'chats',
    'messages',
    'votes',
    'documents',
    'suggestions',
    'streams',
    'ragDocuments',
    'documentContent',
    'documentChunks',
    'documentEmbeddings',
  ];
}

/**
 * Main export function
 */
async function main(): Promise<void> {
  const options = parseArguments();

  if (options.verbose) {
    console.log('📤 Starting test data export...');
    console.log('Options:', JSON.stringify(options, null, 2));
  }

  const startTime = Date.now();

  try {
    // Ensure output directory exists
    await mkdir(options.output, { recursive: true });

    // Get database connection
    const { db, connection } = await getDatabaseConnection(options);

    try {
      // Determine which tables to export
      const tablesToExport =
        options.tables.length > 0 ? options.tables : getAllTableNames();

      console.log(
        `📊 Exporting ${tablesToExport.length} tables in ${options.format} format...`,
      );

      // Collect data from all tables
      const tableData: Record<string, any[]> = {};
      const tableCounts: Record<string, number> = {};

      for (const tableName of tablesToExport) {
        try {
          const data = await getTableData(db, tableName, options);
          tableData[tableName] = data;
          tableCounts[tableName] = data.length;
        } catch (error) {
          console.warn(`⚠️  Could not export table ${tableName}:`, error);
          tableCounts[tableName] = 0;
        }
      }

      // Export data in requested format
      let files: string[] = [];

      switch (options.format) {
        case 'json':
          files = await exportAsJSON(tableData, options);
          break;
        case 'sql':
          files = await exportAsSQL(tableData, options);
          break;
        case 'csv':
          files = await exportAsCSV(tableData, options);
          break;
        default:
          throw new Error(`Unsupported format: ${options.format}`);
      }

      // Calculate total size
      const totalSize = files.reduce((sum, file) => {
        try {
          const stats = Bun.file(file);
          return sum + (stats.size || 0);
        } catch {
          return sum;
        }
      }, 0);

      const executionTime = Date.now() - startTime;

      // Print summary
      console.log('\n📋 Export Summary:');
      console.log('==================');
      console.log(`Format: ${options.format}`);
      console.log(`Output Directory: ${options.output}`);
      console.log(`Execution Time: ${executionTime}ms`);
      console.log(`Total Size: ${(totalSize / 1024).toFixed(1)} KB`);
      console.log(`Files Created: ${files.length}`);

      if (options.anonymize) {
        console.log('🔒 Data anonymized');
      }

      console.log('\nTables Exported:');
      Object.entries(tableCounts).forEach(([table, count]) => {
        console.log(`  ${table}: ${count.toLocaleString()} rows`);
      });

      const totalRows = Object.values(tableCounts).reduce(
        (sum, count) => sum + count,
        0,
      );
      console.log(`  Total: ${totalRows.toLocaleString()} rows`);

      console.log('\nFiles Created:');
      files.forEach((file) => {
        console.log(`  ${file}`);
      });

      console.log('\n✅ Export completed successfully!');
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('❌ Export failed:', error);

    if (options.verbose && error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }

    process.exit(1);
  }
}

// Run the script
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
