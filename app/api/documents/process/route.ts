import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/kinde';
import { DocumentProcessingPipeline } from '@/lib/document-processing/pipeline';

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { documentIds, options = {} } = body;

    if (
      !documentIds ||
      !Array.isArray(documentIds) ||
      documentIds.length === 0
    ) {
      return NextResponse.json(
        { error: 'Document IDs array is required' },
        { status: 400 },
      );
    }

    // Validate document IDs
    if (documentIds.some((id) => typeof id !== 'string' || !id.trim())) {
      return NextResponse.json(
        { error: 'All document IDs must be valid strings' },
        { status: 400 },
      );
    }

    // Create pipeline with options
    const pipeline = new DocumentProcessingPipeline(options);

    // Process documents
    if (documentIds.length === 1) {
      // Single document processing
      const result = await pipeline.processDocument(
        documentIds[0],
        user.id,
      );

      return NextResponse.json({
        success: result.success,
        result,
      });
    } else {
      // Batch processing
      const results = await pipeline.processBatch(documentIds, user.id);
      const successCount = results.filter((r) => r.success).length;

      return NextResponse.json({
        success: successCount === results.length,
        batchResults: {
          total: results.length,
          successful: successCount,
          failed: results.length - successCount,
          results,
        },
      });
    }
  } catch (error) {
    console.error('Document processing pipeline error:', error);
    return NextResponse.json(
      {
        error: 'Pipeline processing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
