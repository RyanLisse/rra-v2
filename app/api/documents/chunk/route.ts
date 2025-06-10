import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ragDocument, documentChunk } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/auth/kinde';
import { SemanticTextSplitter } from '@/lib/chunking/text-splitter';
import { DocumentStatusManager } from '@/lib/document-processing/status-manager';
import { readFile } from 'node:fs/promises';

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { documentId } = body;

    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 },
      );
    }

    // Fetch document and its content
    const document = await db.query.ragDocument.findFirst({
      where: eq(ragDocument.id, documentId),
      with: {
        content: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 },
      );
    }

    // Verify document belongs to user
    if (document.uploadedBy !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if document has extracted text
    if (document.status !== 'text_extracted') {
      return NextResponse.json(
        {
          error: `Document status is '${document.status}', expected 'text_extracted'`,
        },
        { status: 400 },
      );
    }

    if (!document.content) {
      return NextResponse.json(
        { error: 'No content found for document' },
        { status: 400 },
      );
    }

    // Initialize status manager for detailed progress tracking
    const statusManager = await DocumentStatusManager.create(documentId);
    await statusManager.startStep('chunking');

    try {
      // Get text content
      let textContent: string;

      if (document.content.extractedText) {
        textContent = document.content.extractedText;
      } else if (document.content.textFilePath) {
        textContent = await readFile(document.content.textFilePath, 'utf-8');
      } else {
        throw new Error('No text content available');
      }

      await statusManager.updateStepProgress(
        'chunking',
        25,
        'Analyzing document structure...',
      );

      // Determine document type for optimal chunking
      const documentType = determineDocumentType(
        document.originalName,
        textContent,
      );
      const splitter = SemanticTextSplitter.createForDocumentType(documentType);

      await statusManager.updateStepProgress(
        'chunking',
        50,
        'Creating semantic chunks...',
      );

      // Create chunks with enhanced metadata
      const chunks = splitter.splitText(textContent, documentType);

      if (chunks.length === 0) {
        throw new Error('No chunks created from document text');
      }

      await statusManager.updateStepProgress(
        'chunking',
        75,
        'Storing chunks in database...',
      );

      // Store chunks in database with enhanced metadata
      const chunkInserts = chunks.map((chunk) => ({
        documentId: documentId,
        chunkIndex: chunk.metadata.chunkIndex.toString(),
        content: chunk.content,
        tokenCount: chunk.metadata.tokenCount.toString(),
        metadata: {
          startIndex: chunk.metadata.startIndex,
          endIndex: chunk.metadata.endIndex,
          overlap: chunk.metadata.overlap,
          documentType: chunk.metadata.documentType,
          section: chunk.metadata.section,
          quality: chunk.metadata.quality,
        },
      }));

      await db.transaction(async (tx) => {
        // Remove existing chunks if any
        await tx
          .delete(documentChunk)
          .where(eq(documentChunk.documentId, documentId));

        // Insert new chunks
        await tx.insert(documentChunk).values(chunkInserts);

        // Update document status
        await tx
          .update(ragDocument)
          .set({
            status: 'chunked',
            updatedAt: new Date(),
          })
          .where(eq(ragDocument.id, documentId));
      });

      // Calculate quality statistics
      const qualityStats = chunks.reduce(
        (stats, chunk) => {
          const quality = chunk.metadata.quality;
          return {
            avgCoherence: stats.avgCoherence + quality.coherence,
            avgCompleteness: stats.avgCompleteness + quality.completeness,
            semanticBoundaries:
              stats.semanticBoundaries + (quality.semanticBoundary ? 1 : 0),
          };
        },
        { avgCoherence: 0, avgCompleteness: 0, semanticBoundaries: 0 },
      );

      qualityStats.avgCoherence /= chunks.length;
      qualityStats.avgCompleteness /= chunks.length;

      await statusManager.completeStep('chunking', {
        totalChunks: chunks.length,
        averageChunkSize: Math.round(
          chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) /
            chunks.length,
        ),
        documentType,
        qualityStats,
      });

      return NextResponse.json({
        message: 'Document chunked successfully',
        documentId: documentId,
        stats: {
          totalChunks: chunks.length,
          averageChunkSize: Math.round(
            chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) /
              chunks.length,
          ),
          totalTokens: chunks.reduce(
            (sum, chunk) => sum + chunk.metadata.tokenCount,
            0,
          ),
          documentType,
          quality: {
            averageCoherence: Math.round(qualityStats.avgCoherence * 100) / 100,
            averageCompleteness:
              Math.round(qualityStats.avgCompleteness * 100) / 100,
            semanticBoundaryRatio:
              Math.round(
                (qualityStats.semanticBoundaries / chunks.length) * 100,
              ) / 100,
          },
        },
      });
    } catch (chunkingError) {
      console.error('Chunking error:', chunkingError);

      const errorMessage =
        chunkingError instanceof Error
          ? chunkingError.message
          : 'Unknown error';

      await statusManager.failStep('chunking', errorMessage);

      return NextResponse.json(
        {
          error: 'Failed to chunk document',
          details: errorMessage,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Chunking endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}

function determineDocumentType(
  filename: string,
  content: string,
): 'academic' | 'technical' | 'general' | 'manual' | 'code' | 'markdown' {
  const filename_lower = filename.toLowerCase();

  // Check for code files
  if (filename_lower.match(/\.(js|ts|py|java|cpp|c|php|rb|go|rs)$/)) {
    return 'code';
  }

  // Check for markdown files
  if (filename_lower.match(/\.(md|markdown)$/)) {
    return 'markdown';
  }

  // Check for manual/guide indicators
  const manualKeywords = [
    'manual',
    'guide',
    'handbook',
    'documentation',
    'user guide',
    'operating manual',
    'instruction',
    'tutorial',
  ];
  const hasManualStructure =
    /\b(step \d+|chapter \d+|section \d+|procedure|instructions)\b/i.test(
      content,
    );

  if (
    manualKeywords.some((keyword) =>
      filename_lower.includes(keyword.replace(' ', '')),
    ) ||
    hasManualStructure
  ) {
    return 'manual';
  }

  // Check for technical indicators
  const technicalKeywords = [
    'api',
    'code',
    'programming',
    'technical',
    'specification',
    'protocol',
    'implementation',
    'architecture',
  ];
  const hasCodeBlocks =
    /```|```\n|\bfunction\b|\bclass\b|\bdef\b|\bpublic\b|\bprivate\b|\bimport\b|\bfrom\b/.test(
      content,
    );
  const hasTechnicalTerms =
    /\b(API|HTTP|JSON|XML|SQL|database|server|client|endpoint)\b/gi.test(
      content,
    );

  if (
    technicalKeywords.some((keyword) => filename_lower.includes(keyword)) ||
    hasCodeBlocks ||
    hasTechnicalTerms
  ) {
    return 'technical';
  }

  // Check for academic indicators
  const academicKeywords = [
    'research',
    'paper',
    'study',
    'analysis',
    'abstract',
    'methodology',
    'conclusion',
    'journal',
    'publication',
    'thesis',
    'dissertation',
  ];
  const hasAcademicStructure =
    /\b(abstract|methodology|literature review|conclusion|references|bibliography|citation)\b/i.test(
      content,
    );
  const hasAcademicLanguage =
    /\b(hypothesis|experiment|dataset|correlation|significant|p-value)\b/i.test(
      content,
    );

  if (
    academicKeywords.some((keyword) => filename_lower.includes(keyword)) ||
    hasAcademicStructure ||
    hasAcademicLanguage
  ) {
    return 'academic';
  }

  return 'general';
}
