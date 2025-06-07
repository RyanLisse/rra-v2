import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { DocumentStatusManager } from '@/lib/document-processing/status-manager';

export const GET = withAuth(async (request: NextRequest, session: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 },
      );
    }

    // Fetch document from database
    const document = await db.query.ragDocument.findFirst({
      where: eq(ragDocument.id, documentId),
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      );
    }

    // Verify document belongs to user
    if (document.uploadedBy !== session.user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get processing status details
    const statusManager = await DocumentStatusManager.create(documentId);
    const processingSummary = statusManager.getProcessingSummary();

    return NextResponse.json({
      documentId,
      status: document.status,
      fileName: document.fileName,
      originalName: document.originalName,
      uploadedAt: document.createdAt,
      lastUpdated: document.updatedAt,
      processing: processingSummary,
    });
  } catch (error) {
    console.error('Status endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
});

// Get processing statistics for all documents
export const POST = withAuth(async (request: NextRequest, session: any) => {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'stats') {
      const stats = await DocumentStatusManager.getProcessingStats();
      return NextResponse.json({ stats });
    }

    if (action === 'retry') {
      const { documentId, fromStep } = body;
      
      if (!documentId) {
        return NextResponse.json(
          { error: 'Document ID is required for retry' },
          { status: 400 },
        );
      }

      // Verify document belongs to user
      const document = await db.query.ragDocument.findFirst({
        where: eq(ragDocument.id, documentId),
      });

      if (!document) {
        return NextResponse.json(
          { error: 'Document not found' },
          { status: 404 },
        );
      }

      if (document.uploadedBy !== session.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Retry processing from specified step
      const statusManager = await DocumentStatusManager.create(documentId);
      await statusManager.retryFromStep(fromStep || 'text_extraction');

      return NextResponse.json({
        message: `Retry initiated from step: ${fromStep || 'text_extraction'}`,
        documentId,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 },
    );
  } catch (error) {
    console.error('Status action error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
});