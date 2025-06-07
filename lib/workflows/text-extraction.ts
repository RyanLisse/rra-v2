/**
 * Text Extraction Workflow
 *
 * This file defines the Inngest workflow for extracting text from uploaded documents.
 * Implements the document processing pipeline: uploaded → text_extracted
 */

import { inngest, sendEvent } from '@/lib/inngest/client';
import { extractTextFromPDF } from '@/lib/document-processing/pdf-extractor';
import { db } from '@/lib/db';
import { ragDocument, documentContent } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DocumentStatusManager } from '@/lib/document-processing/status-manager';
import type { EventSchemas } from '@/lib/inngest/events';

interface WorkflowContext {
  event: { data: EventSchemas['document.uploaded']['data'] };
  step: any; // Inngest step runner
}

interface WorkflowResult {
  success: boolean;
  documentId: string;
  textLength?: number;
  pageCount?: number;
  error?: string;
}

/**
 * Text extraction workflow function
 * Processes uploaded documents and extracts text content
 */
export const textExtractionWorkflow = async (
  context: WorkflowContext,
): Promise<WorkflowResult> => {
  const { event, step } = context;
  const { documentId, userId, filePath, metadata } = event.data;

  // Initialize status manager
  const statusManager = await DocumentStatusManager.create(documentId);

  try {
    // Step 1: Validate document exists and get details
    const documentDetails = await step.run('get-document', async () => {
      const docs = await db
        .select({
          id: ragDocument.id,
          status: ragDocument.status,
          filePath: ragDocument.filePath,
          mimeType: ragDocument.mimeType,
        })
        .from(ragDocument)
        .where(eq(ragDocument.id, documentId));

      if (docs.length === 0) {
        throw new Error('Document not found');
      }

      return docs[0];
    });

    // Step 2: Validate file type support
    if (!documentDetails.mimeType.includes('pdf')) {
      const error = `Unsupported file type: ${documentDetails.mimeType}`;

      await sendEvent('document.extraction-failed', {
        documentId,
        userId,
        error,
        failedAt: new Date(),
        attemptCount: 1,
      });

      return {
        success: false,
        documentId,
        error,
      };
    }

    // Step 3: Extract text from PDF
    const extractionResult = await step.run('extract-text', async () => {
      // Start text extraction step
      await statusManager.startStep('text_extraction', {
        filePath,
        mimeType: documentDetails.mimeType,
      });

      await statusManager.updateStepProgress(
        'text_extraction',
        25,
        'Reading PDF file...',
      );

      const startTime = Date.now();

      try {
        const result = await extractTextFromPDF(filePath);

        await statusManager.updateStepProgress(
          'text_extraction',
          75,
          'Processing extracted text...',
        );

        const endTime = Date.now();

        // Complete the text extraction step
        await statusManager.completeStep('text_extraction', {
          textLength: result.text.length,
          pageCount: result.pageCount,
          duration: endTime - startTime,
        });

        return {
          ...result,
          extractionDuration: endTime - startTime,
        };
      } catch (error) {
        await statusManager.failStep(
          'text_extraction',
          error instanceof Error ? error.message : 'Unknown error',
        );
        throw new Error(
          `PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    });

    // Step 4: Update document status and create content record
    await step.run('save-extracted-content', async () => {
      // Update document status
      await db
        .update(ragDocument)
        .set({
          status: 'text_extracted',
          updatedAt: new Date(),
        })
        .where(eq(ragDocument.id, documentId));

      // Create document content record
      await db.insert(documentContent).values({
        documentId,
        extractedText: extractionResult.text,
        pageCount: extractionResult.pageCount.toString(),
        charCount: extractionResult.text.length.toString(),
        metadata: {
          extractionDuration: extractionResult.extractionDuration,
          ...extractionResult.metadata,
        },
      });
    });

    // Step 5: Emit success event
    await step.sendEvent('document-extracted', {
      name: 'document.text-extracted',
      data: {
        documentId,
        userId,
        textLength: extractionResult.text.length,
        extractedAt: new Date(),
        metadata: {
          extractionDuration: extractionResult.extractionDuration,
          language: extractionResult.metadata?.language,
          confidence: extractionResult.metadata?.confidence,
        },
      },
    });

    return {
      success: true,
      documentId,
      textLength: extractionResult.text.length,
      pageCount: extractionResult.pageCount,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // Update document status to error using status manager
    await step.run('handle-error', async () => {
      // If we haven't started any steps yet, fail the general workflow
      await statusManager.updateStatus({
        status: 'error',
        error: errorMessage,
        message: 'Workflow failed',
      });
    });

    // Emit failure event
    await sendEvent('document.extraction-failed', {
      documentId,
      userId,
      error: errorMessage,
      failedAt: new Date(),
      attemptCount: 1,
    });

    return {
      success: false,
      documentId,
      error: errorMessage,
    };
  }
};

/**
 * Helper function to create the actual Inngest workflow definition
 * This will be used to register the workflow with Inngest
 */
export const createTextExtractionWorkflow = () => {
  return inngest.createFunction(
    { id: 'text-extraction-workflow' },
    { event: 'document.uploaded' },
    textExtractionWorkflow,
  );
};
