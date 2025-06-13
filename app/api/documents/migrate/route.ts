/**
 * Vector Search Provider Migration API
 * 
 * Handles migration of documents between different vector search providers
 * (e.g., NeonDB <-> OpenAI Vector Store).
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { createMigrationService, type MigrationOptions } from '@/lib/search/migration-utils';
import { z } from 'zod';

// Request validation schema
const migrationRequestSchema = z.object({
  sourceProvider: z.enum(['neondb', 'openai']),
  targetProvider: z.enum(['neondb', 'openai']),
  documentIds: z.array(z.string()).optional(),
  batchSize: z.number().min(1).max(50).default(10),
  dryRun: z.boolean().default(false),
});

const migrationStatusSchema = z.object({
  documentIds: z.array(z.string()),
});

/**
 * POST /api/documents/migrate
 * Start migration of documents between providers
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { isAuthenticated, getUser } = getKindeServerSession();
    if (!isAuthenticated || !getUser()) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUser();
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 400 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validatedData = migrationRequestSchema.parse(body);

    const {
      sourceProvider,
      targetProvider,
      documentIds,
      batchSize,
      dryRun,
    } = validatedData;

    // Validate provider combination
    if (sourceProvider === targetProvider) {
      return NextResponse.json(
        { error: 'Source and target providers must be different' },
        { status: 400 }
      );
    }

    // Create migration service
    const migrationService = await createMigrationService(sourceProvider, targetProvider);

    // Execute migration
    const migrationOptions: MigrationOptions = {
      sourceProvider,
      targetProvider,
      userId,
      documentIds,
      batchSize,
      dryRun,
    };

    const result = await migrationService.migrateDocuments(migrationOptions);

    // Return result
    return NextResponse.json({
      success: result.success,
      migration: {
        sourceProvider,
        targetProvider,
        documentsProcessed: result.documentsProcessed,
        documentsSucceeded: result.documentsSucceeded,
        documentsFailed: result.documentsFailed,
        errors: result.errors,
        timeMs: result.timeMs,
        dryRun,
      },
    });

  } catch (error) {
    console.error('Migration API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/documents/migrate?documentIds=id1,id2,id3
 * Get migration status for specific documents
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { isAuthenticated, getUser } = getKindeServerSession();
    if (!isAuthenticated || !getUser()) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUser();
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 400 }
      );
    }

    // Parse query parameters
    const url = new URL(request.url);
    const documentIdsParam = url.searchParams.get('documentIds');
    const sourceProvider = url.searchParams.get('sourceProvider') as 'neondb' | 'openai' || 'neondb';
    const targetProvider = url.searchParams.get('targetProvider') as 'neondb' | 'openai' || 'openai';

    if (!documentIdsParam) {
      return NextResponse.json(
        { error: 'documentIds parameter is required' },
        { status: 400 }
      );
    }

    const documentIds = documentIdsParam.split(',').filter(id => id.trim());

    if (documentIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one document ID is required' },
        { status: 400 }
      );
    }

    // Create migration service
    const migrationService = await createMigrationService(sourceProvider, targetProvider);

    // Get migration status
    const status = await migrationService.getMigrationStatus(documentIds, userId);

    // Validate migration integrity
    const validation = await migrationService.validateMigration(documentIds, userId);

    return NextResponse.json({
      status: {
        total: status.total,
        migrated: status.migrated,
        pending: status.pending,
        failed: status.failed,
        migrationRate: status.total > 0 ? status.migrated / status.total : 0,
      },
      validation: {
        isValid: validation.isValid,
        missingDocuments: validation.missingDocuments,
        errors: validation.errors,
      },
      providers: {
        source: sourceProvider,
        target: targetProvider,
      },
    });

  } catch (error) {
    console.error('Migration status API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get migration status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/documents/migrate
 * Sync specific documents between providers
 */
export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const { isAuthenticated, getUser } = getKindeServerSession();
    if (!isAuthenticated || !getUser()) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await getUser();
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID not found' },
        { status: 400 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const { documentId, sourceProvider = 'neondb', targetProvider = 'openai' } = body;

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    if (sourceProvider === targetProvider) {
      return NextResponse.json(
        { error: 'Source and target providers must be different' },
        { status: 400 }
      );
    }

    // Create migration service
    const migrationService = await createMigrationService(sourceProvider, targetProvider);

    // Sync the document
    const result = await migrationService.syncDocument(documentId, userId);

    return NextResponse.json({
      success: result.success,
      sync: {
        documentId,
        sourceProvider,
        targetProvider,
        chunksIndexed: result.chunksIndexed,
        errorCount: result.errorCount,
        errors: result.errors,
        timeMs: result.timeMs,
      },
    });

  } catch (error) {
    console.error('Document sync API error:', error);
    return NextResponse.json(
      { 
        error: 'Document sync failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}