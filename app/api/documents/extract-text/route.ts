import { type NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { db } from '@/lib/db';
import { ragDocument, documentContent } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { DocumentProcessor } from '@/lib/document-processing/document-processor';
import { DocumentStatusManager } from '@/lib/document-processing/status-manager';

export const POST = withAuth(async (request: NextRequest, session: any) => {
  try {
    const body = await request.json();
    const { documentId } = body;

    if (!documentId || typeof documentId !== 'string') {
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

    // Check if document is in correct status
    if (document.status !== 'uploaded') {
      return NextResponse.json(
        {
          error: `Document is in ${document.status} status, expected 'uploaded'`,
        },
        { status: 400 },
      );
    }

    // Initialize status manager for detailed progress tracking
    const statusManager = await DocumentStatusManager.create(documentId);
    await statusManager.startStep('text_extraction');

    try {
      // Use enhanced document processor
      const processor = new DocumentProcessor({
        maxRetries: 3,
        preserveFormatting: true,
        extractTables: true,
      });

      await statusManager.updateStepProgress(
        'text_extraction',
        25,
        'Processing document...',
      );

      const result = await processor.processDocument(
        document.filePath,
        document.mimeType,
      );

      if (!result.success || !result.text) {
        throw new Error(result.error || 'Failed to extract text from document');
      }

      await statusManager.updateStepProgress(
        'text_extraction',
        75,
        'Saving extracted text...',
      );

      // Save extracted text to file
      const textFilename = `${document.fileName.replace(/\.[^.]+$/, '')}.txt`;
      const textFilePath = join(process.cwd(), 'uploads', textFilename);
      await writeFile(textFilePath, result.text);

      // Save content to database with enhanced metadata
      await db.transaction(async (tx) => {
        // Insert document content
        await tx.insert(documentContent).values({
          documentId: documentId,
          textFilePath: textFilePath,
          extractedText:
            result.text && result.text.length > 10000 ? undefined : result.text, // Store short texts directly
          pageCount: result.metadata?.pageCount?.toString(),
          charCount: result.metadata?.charCount?.toString(),
          metadata: {
            ...result.metadata,
            processingTime: result.metadata?.processingTime,
            confidence: result.metadata?.confidence,
            warnings: result.metadata?.warnings,
            language: result.metadata?.language,
          },
        });

        // Update document status
        await tx
          .update(ragDocument)
          .set({
            status: 'text_extracted',
            updatedAt: new Date(),
          })
          .where(eq(ragDocument.id, documentId));
      });

      await statusManager.completeStep('text_extraction', {
        textLength: result.text.length,
        confidence: result.metadata?.confidence,
        processingTime: result.metadata?.processingTime,
      });

      return NextResponse.json({
        message: 'Text extracted successfully',
        documentId: documentId,
        stats: {
          pages: result.metadata?.pageCount,
          characters: result.metadata?.charCount,
          words: result.metadata?.wordCount,
          confidence: result.metadata?.confidence,
          processingTime: result.metadata?.processingTime,
          warnings: result.metadata?.warnings,
        },
      });
    } catch (extractionError) {
      console.error('Text extraction error:', extractionError);

      const errorMessage =
        extractionError instanceof Error
          ? extractionError.message
          : 'Unknown error';

      await statusManager.failStep('text_extraction', errorMessage);

      return NextResponse.json(
        {
          error: 'Failed to extract text from document',
          details: errorMessage,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Text extraction endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
});
