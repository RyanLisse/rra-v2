import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/kinde';
import { z } from 'zod';
import { PipelineTracker } from '@/lib/document-processing/pipeline-tracker';
import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const StatusRequestSchema = z.object({
  documentId: z.string().uuid(),
});

/**
 * GET /api/documents/pipeline-status?documentId=xxx
 *
 * Get comprehensive pipeline status for a document
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 },
      );
    }

    // Validate document ID format
    try {
      StatusRequestSchema.parse({ documentId });
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid document ID format' },
        { status: 400 },
      );
    }

    // Check if document exists and user has access
    const [document] = await db
      .select({
        id: ragDocument.id,
        status: ragDocument.status,
        uploadedBy: ragDocument.uploadedBy,
        createdAt: ragDocument.createdAt,
        updatedAt: ragDocument.updatedAt,
      })
      .from(ragDocument)
      .where(eq(ragDocument.id, documentId));

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      );
    }

    // Check if user has access to this document
    if (
      document.uploadedBy !== user.id &&
      user.type !== 'admin'
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Create a tracker instance to get current status
    const tracker = new PipelineTracker(documentId);
    const pipelineStatus = tracker.getStatus();

    // Enhance with document metadata
    const enhancedStatus = {
      ...pipelineStatus,
      document: {
        id: document.id,
        status: document.status,
        createdAt: document.createdAt,
        lastProcessedAt: document.updatedAt,
      },
      estimatedTimeRemaining: calculateEstimatedTime(pipelineStatus),
      nextStage: getNextStage(pipelineStatus.stages),
    };

    return NextResponse.json(enhancedStatus);
  } catch (error) {
    console.error('Pipeline status error:', error);
    return NextResponse.json(
      { error: 'Failed to get pipeline status' },
      { status: 500 },
    );
  }
}

/**
 * Calculate estimated time remaining based on average stage durations
 */
function calculateEstimatedTime(status: any): number | null {
  const averageStageDurations: Record<string, number> = {
    text_extraction: 5000,
    chunking: 2000,
    pdf_conversion: 15000,
    ade_processing: 10000,
    embedding_generation: 8000,
    multimodal_embedding: 5000,
    indexing: 1000,
    completion: 500,
  };

  const remainingStages = status.stages.filter(
    (s: any) => s.status === 'pending' && s.status !== 'skipped',
  );

  if (remainingStages.length === 0) {
    return 0;
  }

  const estimatedMs = remainingStages.reduce(
    (total: number, stage: any) =>
      total + (averageStageDurations[stage.name] || 5000),
    0,
  );

  return estimatedMs;
}

/**
 * Get the next stage in the pipeline
 */
function getNextStage(stages: any[]): string | null {
  const pendingStage = stages.find(
    (s) => s.status === 'pending' && s.status !== 'skipped',
  );
  return pendingStage?.name || null;
}

/**
 * POST /api/documents/pipeline-status/metrics
 *
 * Get pipeline metrics across all documents
 */
export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // Only admins can view system-wide metrics
    if (user.type !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const timeRange = body.timeRange
      ? {
          start: new Date(body.timeRange.start),
          end: new Date(body.timeRange.end),
        }
      : undefined;

    const metrics = await PipelineTracker.getMetrics(timeRange);

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Pipeline metrics error:', error);
    return NextResponse.json(
      { error: 'Failed to get pipeline metrics' },
      { status: 500 },
    );
  }
}
