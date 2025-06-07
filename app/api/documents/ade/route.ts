import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processDocumentWithAde } from '@/lib/ade/processor';
import { saveAdeElements } from '@/lib/ade/database';
import { withAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { AdeProcessRequestSchema, AdeError } from '@/lib/ade/types';

// Request body schema
const RequestSchema = z.object({
  documentId: z.string().min(1),
  options: z
    .object({
      extractTables: z.boolean().default(true),
      extractFigures: z.boolean().default(true),
      preserveFormatting: z.boolean().default(true),
      confidence: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
});

export const POST = withAuth(async (request: NextRequest, session: any) => {
  try {
    const body = await request.json();
    const { documentId, options } = RequestSchema.parse(body);

    // Get document from database
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

    // Check if document is in correct status for ADE processing
    const validStatuses = ['text_extracted', 'chunked', 'uploaded'];
    if (!validStatuses.includes(document.status)) {
      return NextResponse.json(
        {
          error: `Document is in ${document.status} status, expected one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 },
      );
    }

    // Update document status to processing
    await db
      .update(ragDocument)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, documentId));

    try {
      // Process document with ADE
      const adeRequest = AdeProcessRequestSchema.parse({
        documentId,
        filePath: document.filePath,
        documentType: 'pdf', // Assuming PDF for now
        options,
      });

      const adeOutput = await processDocumentWithAde(adeRequest);

      // Save ADE elements to database
      await saveAdeElements(adeOutput);

      return NextResponse.json({
        message: 'ADE processing completed successfully',
        documentId,
        stats: {
          totalElements: adeOutput.totalElements,
          pageCount: adeOutput.pageCount,
          processingTimeMs: adeOutput.processingTimeMs,
          confidence: adeOutput.confidence,
          elementsByType: countElementsByType(adeOutput.elements),
        },
      });
    } catch (adeError) {
      console.error('ADE processing error:', adeError);

      // Update document status to error
      await db
        .update(ragDocument)
        .set({
          status: 'error',
          updatedAt: new Date(),
        })
        .where(eq(ragDocument.id, documentId));

      if (adeError instanceof AdeError) {
        return NextResponse.json(
          {
            error: 'ADE processing failed',
            details: adeError.message,
            code: adeError.code,
          },
          { status: adeError.statusCode || 500 },
        );
      }

      return NextResponse.json(
        {
          error: 'ADE processing failed',
          details:
            adeError instanceof Error ? adeError.message : 'Unknown error',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('ADE API endpoint error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
});

// Helper function to count elements by type
function countElementsByType(elements: any[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const element of elements) {
    counts[element.type] = (counts[element.type] || 0) + 1;
  }

  return counts;
}
