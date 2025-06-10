/**
 * PDF to Image Conversion Workflow
 *
 * This file defines the Inngest workflow for converting PDF pages to images for multimodal processing.
 * Implements the document processing pipeline: text_extracted → images_extracted
 */

import { sendEvent } from '@/lib/inngest/client';
import { convertPdfToImages } from '@/lib/document-processing/pdf-to-image-converter';
import { db } from '@/lib/db';
import { ragDocument, documentImage } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DocumentStatusManager } from '@/lib/document-processing/status-manager';
import type { EventSchemas } from '@/lib/inngest/events';
import { createInngestLogger } from '@/lib/monitoring/enhanced-logger';

interface ImageConversionWorkflowContext {
  event: {
    data: EventSchemas['document.text-extracted']['data'];
    id?: string;
  };
  step: any & { runId?: string }; // Inngest step runner
}

interface ImageConversionWorkflowResult {
  success: boolean;
  documentId: string;
  imagesCreated: number;
  totalPages: number;
  error?: string;
}

/**
 * PDF to image conversion workflow function
 * Processes documents after text extraction and creates page images
 */
export const pdfToImageConversionWorkflow = async (
  context: ImageConversionWorkflowContext,
): Promise<ImageConversionWorkflowResult> => {
  const { event, step } = context;
  const { documentId, userId, metadata } = event.data;
  const workflowStartTime = Date.now();

  // Initialize enhanced logger for this Inngest function
  const logger = createInngestLogger({
    functionName: 'pdfToImageConversionWorkflow',
    documentId,
    userId,
    eventId: event.id || 'unknown',
    runId: step.runId || 'unknown',
  });

  logger.functionStart(event.data);

  // Initialize status manager
  const statusManager = await DocumentStatusManager.create(documentId);

  try {
    // Step 1: Validate document exists and get details
    const documentDetails = await step.run('get-document', async () => {
      const stepLogger = logger.stepStart('get-document', {
        step: 'document_validation',
      });

      try {
        const docs = await db
          .select({
            id: ragDocument.id,
            status: ragDocument.status,
            filePath: ragDocument.filePath,
            mimeType: ragDocument.mimeType,
            originalName: ragDocument.originalName,
          })
          .from(ragDocument)
          .where(eq(ragDocument.id, documentId))
          .limit(1);

        if (docs.length === 0) {
          throw new Error(`Document ${documentId} not found`);
        }

        const doc = docs[0];

        // Verify document is ready for image conversion
        if (doc.status !== 'text_extracted') {
          throw new Error(
            `Document ${documentId} status is ${doc.status}, expected 'text_extracted'`,
          );
        }

        // Only process PDF files
        if (doc.mimeType !== 'application/pdf') {
          throw new Error(
            `Document ${documentId} is not a PDF (${doc.mimeType})`,
          );
        }

        stepLogger.complete(doc);
        return doc;
      } catch (error) {
        stepLogger.fail(error);
        throw error;
      }
    });

    // Step 2: Update status to processing images
    await step.run('update-status-processing', async () => {
      await statusManager.updateStatus({
        status: 'images_extracted',
        metadata: {
          step: 'pdf_to_image_conversion',
          startedAt: new Date(),
          originalName: documentDetails.originalName,
          filePath: documentDetails.filePath,
        },
      });
    });

    // Step 3: Convert PDF to images
    const conversionResult = await step.run(
      'convert-pdf-to-images',
      async () => {
        const stepLogger = logger.stepStart('convert-pdf-to-images', {
          step: 'pdf_conversion',
          filePath: documentDetails.filePath,
        });

        try {
          const result = await convertPdfToImages(
            documentId,
            documentDetails.filePath,
            {
              outputFormat: 'png',
              quality: 2.0, // High quality for better ADE processing
              maxPages: 50, // Reasonable limit for processing time
            },
          );

          logger.documentProcessingMetric(
            'pdf_to_images_conversion',
            result.timeTaken || 0,
            result.success ? 'success' : 'failed',
            {
              imagesCreated: result.images?.length || 0,
              totalPages: result.totalPages || 0,
              outputFormat: 'png',
            },
          );

          stepLogger.complete(result);
          return result;
        } catch (error) {
          logger.documentProcessingMetric(
            'pdf_to_images_conversion',
            0,
            'failed',
            { errorType: error instanceof Error ? error.name : 'UnknownError' },
          );
          stepLogger.fail(error);
          throw error;
        }
      },
    );

    if (!conversionResult.success) {
      throw new Error(`PDF conversion failed: ${conversionResult.error}`);
    }

    // Step 4: Store image records in database
    const storedImages = await step.run('store-image-records', async () => {
      const imageRecords = [];

      for (const image of conversionResult.images) {
        try {
          const [imageRecord] = await db
            .insert(documentImage)
            .values({
              documentId: documentId,
              pageNumber: image.pageNumber,
              imagePath: image.imagePath,
              width: image.width,
              height: image.height,
              fileSize: image.fileSize,
              mimeType: image.mimeType,
              extractedBy: 'pdf_conversion',
              extractionMetadata: {
                conversionTime: conversionResult.timeTaken,
                quality: 2.0,
                outputFormat: 'png',
                fileName: image.fileName,
              },
            })
            .returning();

          imageRecords.push(imageRecord);
        } catch (error) {
          console.error(
            `Failed to store image record for page ${image.pageNumber}:`,
            error,
          );
          // Continue with other images - don't fail the entire workflow
        }
      }

      return imageRecords;
    });

    // Step 5: Update document status to images extracted
    await step.run('update-status-complete', async () => {
      await statusManager.updateStatus({
        status: 'images_extracted',
        metadata: {
          step: 'pdf_to_image_conversion',
          completedAt: new Date(),
          imagesCreated: storedImages.length,
          totalPages: conversionResult.totalPages,
          outputDirectory: conversionResult.outputDirectory,
          conversionTime: conversionResult.timeTaken,
        },
      });
    });

    // Step 6: Emit event for next workflow step (ADE processing)
    await step.run('emit-images-extracted-event', async () => {
      await sendEvent('document.images-extracted', {
        documentId,
        userId,
        imagesCreated: storedImages.length,
        totalPages: conversionResult.totalPages,
        outputDirectory: conversionResult.outputDirectory,
        images: storedImages.map((img: any) => ({
          id: img.id,
          pageNumber: img.pageNumber,
          imagePath: img.imagePath,
          width: img.width,
          height: img.height,
        })),
        metadata: {
          ...metadata,
          conversionTime: conversionResult.timeTaken,
          imageFormat: 'png',
        },
      });
    });

    const result = {
      success: true,
      documentId,
      imagesCreated: storedImages.length,
      totalPages: conversionResult.totalPages,
    };

    logger.functionComplete(Date.now() - workflowStartTime, result);

    return result;
  } catch (error) {
    const workflowDuration = Date.now() - workflowStartTime;
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error during PDF to image conversion';

    logger.functionFail(error, workflowDuration);

    // Update document status to error
    await step.run('update-status-error', async () => {
      await statusManager.updateStatus({
        status: 'error_image_extraction',
        error: errorMessage,
        metadata: {
          step: 'pdf_to_image_conversion',
          failedAt: new Date(),
        },
      });
    });

    // Emit error event
    await step.run('emit-error-event', async () => {
      await sendEvent('document.processing-failed', {
        documentId,
        userId,
        step: 'pdf_to_image_conversion',
        error: errorMessage,
        metadata,
      });
    });

    return {
      success: false,
      documentId,
      imagesCreated: 0,
      totalPages: 0,
      error: errorMessage,
    };
  }
};

/**
 * Test PDF to image conversion with a specific document
 */
export async function testPdfToImageConversion(
  documentId: string,
): Promise<ImageConversionWorkflowResult> {
  const mockContext: ImageConversionWorkflowContext = {
    event: {
      data: {
        documentId,
        userId: 'test-user',
        textLength: 5000,
        extractedAt: new Date(),
        metadata: {
          extractionDuration: 5000,
          language: 'en',
          confidence: 0.95,
        },
      },
    },
    step: {
      run: async (stepName: string, fn: () => Promise<any>) => {
        console.log(`Executing step: ${stepName}`);
        return await fn();
      },
    },
  };

  return await pdfToImageConversionWorkflow(mockContext);
}
