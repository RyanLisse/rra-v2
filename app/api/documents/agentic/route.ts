/**
 * Agentic Document Analysis API
 * Provides endpoints for advanced document understanding using AI
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/kinde';
import { z } from 'zod';
import { agenticDocumentService } from '@/lib/document-processing/agentic-integration';

// Request schemas
const processDocumentSchema = z.object({
  documentId: z.string(),
  options: z
    .object({
      generateEmbeddings: z.boolean().default(true),
      chunkSize: z.number().min(100).max(2000).default(1000),
      overlapSize: z.number().min(0).max(500).default(200),
      confidenceThreshold: z.number().min(0).max(1).default(0.7),
      enableStructuralAnalysis: z.boolean().default(true),
    })
    .optional(),
});

const queryDocumentSchema = z.object({
  documentId: z.string(),
  query: z.string().min(1),
  includeVisualContext: z.boolean().default(true),
});

const summaryRequestSchema = z.object({
  documentId: z.string(),
});

/**
 * POST /api/documents/agentic
 * Process a document with agentic analysis
 */
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
    const { documentId, options } = processDocumentSchema.parse(body);

    console.log(`Starting agentic processing for document: ${documentId}`);

    const result = await agenticDocumentService.processDocumentWithAgentic(
      documentId,
      user.id,
      options,
    );

    console.log(`Agentic processing completed:`, {
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      embeddingsGenerated: result.embeddingsGenerated,
      processingTime: result.processingTime,
    });

    return NextResponse.json({
      success: true,
      result: {
        documentId: result.documentId,
        title: result.analysis.title,
        summary: result.analysis.summary,
        keyTopics: result.analysis.keyTopics,
        structure: result.analysis.structure,
        stats: {
          totalElements: result.analysis.elements.length,
          chunksCreated: result.chunksCreated,
          embeddingsGenerated: result.embeddingsGenerated,
          processingTime: result.processingTime,
          averageConfidence: result.analysis.metadata?.averageConfidence,
        },
      },
    });
  } catch (error) {
    console.error('Agentic document processing failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process document with agentic analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/documents/agentic?action=query
 * Query a document using agentic analysis
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'query') {
      const documentId = searchParams.get('documentId');
      const query = searchParams.get('query');
      const includeVisualContext =
        searchParams.get('includeVisualContext') !== 'false';

      const validation = queryDocumentSchema.safeParse({
        documentId,
        query,
        includeVisualContext,
      });

      if (!validation.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid query parameters',
            details: validation.error.issues,
          },
          { status: 400 },
        );
      }

      const result = await agenticDocumentService.queryDocumentAgentic(
        validation.data.documentId,
        validation.data.query,
        validation.data.includeVisualContext,
      );

      return NextResponse.json({
        success: true,
        result: {
          answer: result.answer,
          confidence: result.confidence,
          relevantElements: result.relevantElements.map((el) => ({
            id: el.id,
            type: el.type,
            content: el.content.substring(0, 200), // Truncate for API response
            pageNumber: el.boundingBox.pageNumber,
            confidence: el.confidence,
          })),
          sources: result.sources,
        },
      });
    }

    if (action === 'summary') {
      const documentId = searchParams.get('documentId');

      const validation = summaryRequestSchema.safeParse({ documentId });
      if (!validation.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid document ID',
            details: validation.error.issues,
          },
          { status: 400 },
        );
      }

      const summary = await agenticDocumentService.getDocumentSummary(
        validation.data.documentId,
      );

      return NextResponse.json({
        success: true,
        result: summary,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action parameter',
        validActions: ['query', 'summary'],
      },
      { status: 400 },
    );
  } catch (error) {
    console.error('Agentic document query failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to query document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/documents/agentic
 * Update agentic analysis settings or re-process document
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { documentId, action, options } = body;

    if (action === 'reprocess') {
      const validation = processDocumentSchema.safeParse({
        documentId,
        options,
      });
      if (!validation.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid reprocess parameters',
            details: validation.error.issues,
          },
          { status: 400 },
        );
      }

      const result = await agenticDocumentService.processDocumentWithAgentic(
        documentId,
        user.id,
        options,
      );

      return NextResponse.json({
        success: true,
        message: 'Document reprocessed successfully',
        result: {
          documentId: result.documentId,
          processingTime: result.processingTime,
          chunksCreated: result.chunksCreated,
          embeddingsGenerated: result.embeddingsGenerated,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid action',
        validActions: ['reprocess'],
      },
      { status: 400 },
    );
  } catch (error) {
    console.error('Agentic document update failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to update document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

/**
 * Health check for agentic document service
 */
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'X-Service': 'agentic-document-api',
      'X-Version': '1.0.0',
    },
  });
}
