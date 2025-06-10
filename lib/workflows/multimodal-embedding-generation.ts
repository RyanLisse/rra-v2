/**
 * Multimodal Embedding Generation Workflow
 *
 * This file defines the Inngest workflow for generating embeddings for text chunks
 * and images after ADE processing completes. Supports text, image, and multimodal embeddings.
 * Implements the document processing pipeline: ade_processed → embedded
 */

import { sendEvent } from '@/lib/inngest/client';
import { multimodalEmbeddingService } from '@/lib/ai/multimodal-embeddings';
import { db } from '@/lib/db';
import {
  ragDocument,
  documentChunk,
  documentImage,
  documentEmbedding,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { DocumentStatusManager } from '@/lib/document-processing/status-manager';
import type { EventSchemas } from '@/lib/inngest/events';
import { createInngestLogger } from '@/lib/monitoring/enhanced-logger';

interface EmbeddingGenerationWorkflowContext {
  event: {
    data: EventSchemas['document.ade-processed']['data'];
    id?: string;
  };
  step: any & { runId?: string }; // Inngest step runner
}

interface EmbeddingGenerationWorkflowResult {
  success: boolean;
  documentId: string;
  textEmbeddingsGenerated: number;
  imageEmbeddingsGenerated: number;
  multimodalEmbeddingsGenerated: number;
  totalTokens: number;
  error?: string;
}

/**
 * Multimodal embedding generation workflow function
 * Processes documents after ADE processing and generates comprehensive embeddings
 */
export const multimodalEmbeddingGenerationWorkflow = async (
  context: EmbeddingGenerationWorkflowContext,
): Promise<EmbeddingGenerationWorkflowResult> => {
  const { event, step } = context;
  const { documentId, userId, elementsExtracted, chunksEnhanced } = event.data;
  const workflowStartTime = Date.now();

  // Initialize enhanced logger for this Inngest function
  const logger = createInngestLogger({
    functionName: 'multimodalEmbeddingGenerationWorkflow',
    documentId,
    userId,
    eventId: event.id || 'unknown',
    runId: step.runId || 'unknown',
  });

  logger.functionStart(event.data);

  // Initialize status manager
  const statusManager = await DocumentStatusManager.create(documentId);

  try {
    // Step 1: Validate document exists and is ready for embedding generation
    const documentDetails = await step.run('validate-document', async () => {
      const docs = await db
        .select({
          id: ragDocument.id,
          status: ragDocument.status,
          originalName: ragDocument.originalName,
        })
        .from(ragDocument)
        .where(eq(ragDocument.id, documentId))
        .limit(1);

      if (docs.length === 0) {
        throw new Error(`Document ${documentId} not found`);
      }

      const doc = docs[0];

      if (doc.status !== 'ade_processed') {
        throw new Error(
          `Document ${documentId} status is ${doc.status}, expected 'ade_processed'`,
        );
      }

      return doc;
    });

    // Step 2: Update status to embedding generation
    await step.run('update-status-embedding-processing', async () => {
      await statusManager.updateStatus({
        status: 'processing',
        metadata: {
          step: 'multimodal_embedding_generation',
          startedAt: new Date(),
          originalName: documentDetails.originalName,
          elementsExtracted,
          chunksEnhanced,
        },
      });
    });

    // Step 3: Fetch document chunks for text embeddings
    const documentChunks = await step.run('fetch-document-chunks', async () => {
      return await db
        .select({
          id: documentChunk.id,
          content: documentChunk.content,
          chunkIndex: documentChunk.chunkIndex,
          elementType: documentChunk.elementType,
          pageNumber: documentChunk.pageNumber,
        })
        .from(documentChunk)
        .where(eq(documentChunk.documentId, documentId))
        .limit(100); // Reasonable limit for processing
    });

    // Step 4: Fetch document images for image embeddings
    const documentImages = await step.run('fetch-document-images', async () => {
      return await db
        .select({
          id: documentImage.id,
          imagePath: documentImage.imagePath,
          pageNumber: documentImage.pageNumber,
          width: documentImage.width,
          height: documentImage.height,
        })
        .from(documentImage)
        .where(eq(documentImage.documentId, documentId));
    });

    // Step 5: Generate text embeddings for chunks
    const textEmbeddingResults = await step.run(
      'generate-text-embeddings',
      async () => {
        const stepStartTime = Date.now();
        const stepLogger = logger.stepStart('generate-text-embeddings', {
          step: 'text_embedding_generation',
          chunksCount: documentChunks.length,
        });

        try {
          const results = [];

          // Process text chunks in smaller batches to manage memory and API limits
          const batchSize = 10;
          for (let i = 0; i < documentChunks.length; i += batchSize) {
            const batch = documentChunks.slice(i, i + batchSize);

            const batchItems = batch.map(
              (chunk: { id: string; content: string; chunkIndex: string }) => ({
                type: 'text' as const,
                content: chunk.content,
              }),
            );

            const batchResult =
              await multimodalEmbeddingService.generateEmbeddingBatch(
                batchItems,
                {
                  inputType: 'search_document',
                  useCache: true,
                  maxConcurrency: 3,
                },
              );

            // Store embeddings in database
            for (let j = 0; j < batch.length; j++) {
              const chunk = batch[j];
              const embeddingResult = batchResult.embeddings[j];

              if (embeddingResult && embeddingResult.inputType === 'text') {
                try {
                  await db.insert(documentEmbedding).values({
                    documentId,
                    chunkId: chunk.id,
                    embeddingType: 'text',
                    embedding: JSON.stringify(embeddingResult.embedding),
                    model: embeddingResult.model,
                    dimensions: embeddingResult.embedding.length,
                  });

                  results.push({
                    chunkId: chunk.id,
                    tokens: embeddingResult.tokens,
                    success: true,
                  });
                } catch (error) {
                  logger.error(
                    error,
                    `Failed to store text embedding for chunk ${chunk.id}`,
                  );
                  results.push({
                    chunkId: chunk.id,
                    tokens: 0,
                    success: false,
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  });
                }
              }
            }

            // Add delay between batches
            if (i + batchSize < documentChunks.length) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }

          const stepDuration = Date.now() - stepStartTime;
          const successfulEmbeddings = results.filter((r) => r.success).length;
          logger.documentProcessingMetric(
            'text_embedding_generation',
            stepDuration,
            'success',
            {
              chunksProcessed: documentChunks.length,
              embeddingsGenerated: successfulEmbeddings,
              batchesProcessed: Math.ceil(documentChunks.length / batchSize),
            },
          );

          stepLogger.complete(results);
          return results;
        } catch (error) {
          const stepDuration = Date.now() - stepStartTime;
          logger.documentProcessingMetric(
            'text_embedding_generation',
            stepDuration,
            'failed',
            { errorType: error instanceof Error ? error.name : 'UnknownError' },
          );
          stepLogger.fail(error);
          throw error;
        }
      },
    );

    // Step 6: Generate image embeddings
    const imageEmbeddingResults = await step.run(
      'generate-image-embeddings',
      async () => {
        const results = [];

        for (const image of documentImages) {
          try {
            const embeddingResult =
              await multimodalEmbeddingService.generateImageEmbedding(
                image.imagePath,
                {
                  inputType: 'search_document',
                  useCache: true,
                },
              );

            await db.insert(documentEmbedding).values({
              documentId,
              imageId: image.id,
              embeddingType: 'image',
              embedding: JSON.stringify(embeddingResult.embedding),
              model: embeddingResult.model,
              dimensions: embeddingResult.embedding.length,
            });

            results.push({
              imageId: image.id,
              tokens: embeddingResult.tokens,
              success: true,
            });

            // Add delay between image embeddings to respect rate limits
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error(
              `Failed to generate image embedding for ${image.id}:`,
              error,
            );
            results.push({
              imageId: image.id,
              tokens: 0,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return results;
      },
    );

    // Step 7: Generate multimodal embeddings for figure captions
    const multimodalEmbeddingResults = await step.run(
      'generate-multimodal-embeddings',
      async () => {
        const results = [];

        // Find chunks that are figure captions and have associated images
        const figureCaptions = documentChunks.filter(
          (chunk: {
            id: string;
            content: string;
            chunkIndex: string;
            elementType: string | null;
            pageNumber: number | null;
          }) => chunk.elementType === 'figure_caption' && chunk.pageNumber,
        );

        for (const caption of figureCaptions) {
          try {
            // Find image on the same page
            const associatedImage = documentImages.find(
              (img: {
                id: string;
                imagePath: string;
                pageNumber: number;
                width: number | null;
                height: number | null;
              }) => img.pageNumber === caption.pageNumber,
            );

            if (associatedImage) {
              const embeddingResult =
                await multimodalEmbeddingService.generateMultimodalEmbedding(
                  caption.content,
                  associatedImage.imagePath,
                  {
                    inputType: 'search_document',
                    useCache: true,
                  },
                );

              // Create a new chunk for the multimodal embedding
              const [multimodalChunk] = await db
                .insert(documentChunk)
                .values({
                  documentId,
                  chunkIndex: `multimodal_${caption.chunkIndex}`,
                  content: `${caption.content} [with associated image]`,
                  elementType: 'multimodal',
                  pageNumber: caption.pageNumber,
                  metadata: {
                    originalCaptionChunkId: caption.id,
                    associatedImageId: associatedImage.id,
                    embeddingSource: 'multimodal',
                  },
                })
                .returning({ id: documentChunk.id });

              await db.insert(documentEmbedding).values({
                documentId,
                chunkId: multimodalChunk.id,
                embeddingType: 'multimodal',
                embedding: JSON.stringify(embeddingResult.embedding),
                model: embeddingResult.model,
                dimensions: embeddingResult.embedding.length,
              });

              results.push({
                chunkId: multimodalChunk.id,
                originalCaptionId: caption.id,
                imageId: associatedImage.id,
                tokens: embeddingResult.tokens,
                success: true,
              });

              // Add delay between multimodal embeddings
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(
              `Failed to generate multimodal embedding for caption ${caption.id}:`,
              error,
            );
            results.push({
              chunkId: caption.id,
              tokens: 0,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        return results;
      },
    );

    // Step 8: Calculate summary statistics
    const summaryStats = await step.run('calculate-summary-stats', async () => {
      const textSuccess = textEmbeddingResults.filter(
        (r: any) => r.success,
      ).length;
      const imageSuccess = imageEmbeddingResults.filter(
        (r: any) => r.success,
      ).length;
      const multimodalSuccess = multimodalEmbeddingResults.filter(
        (r: any) => r.success,
      ).length;

      const totalTokens = [
        ...textEmbeddingResults,
        ...imageEmbeddingResults,
        ...multimodalEmbeddingResults,
      ].reduce(
        (sum: number, result: any) =>
          sum + (result.success ? result.tokens : 0),
        0,
      );

      return {
        textEmbeddingsGenerated: textSuccess,
        imageEmbeddingsGenerated: imageSuccess,
        multimodalEmbeddingsGenerated: multimodalSuccess,
        totalTokens,
      };
    });

    // Step 9: Update document status to embedded
    await step.run('update-status-embedded', async () => {
      await statusManager.updateStatus({
        status: 'embedded',
        metadata: {
          step: 'multimodal_embedding_generation',
          completedAt: new Date(),
          textEmbeddings: summaryStats.textEmbeddingsGenerated,
          imageEmbeddings: summaryStats.imageEmbeddingsGenerated,
          multimodalEmbeddings: summaryStats.multimodalEmbeddingsGenerated,
          totalTokens: summaryStats.totalTokens,
        },
      });
    });

    // Step 10: Emit completion event
    await step.run('emit-document-embedded-event', async () => {
      await sendEvent('document.embedded', {
        documentId,
        userId,
        embeddingCount:
          summaryStats.textEmbeddingsGenerated +
          summaryStats.imageEmbeddingsGenerated +
          summaryStats.multimodalEmbeddingsGenerated,
        embeddedAt: new Date(),
        metadata: {
          embeddingModel: 'embed-english-v4.0',
          vectorDimensions: 1024,
        },
      });
    });

    const result = {
      success: true,
      documentId,
      textEmbeddingsGenerated: summaryStats.textEmbeddingsGenerated,
      imageEmbeddingsGenerated: summaryStats.imageEmbeddingsGenerated,
      multimodalEmbeddingsGenerated: summaryStats.multimodalEmbeddingsGenerated,
      totalTokens: summaryStats.totalTokens,
    };

    // Log overall embedding generation metrics
    logger.documentProcessingMetric(
      'multimodal_embedding_workflow',
      Date.now() - workflowStartTime,
      'success',
      {
        textEmbeddings: summaryStats.textEmbeddingsGenerated,
        imageEmbeddings: summaryStats.imageEmbeddingsGenerated,
        multimodalEmbeddings: summaryStats.multimodalEmbeddingsGenerated,
        totalTokens: summaryStats.totalTokens,
      },
    );

    logger.functionComplete(Date.now() - workflowStartTime, result);

    return result;
  } catch (error) {
    const workflowDuration = Date.now() - workflowStartTime;
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error during embedding generation';

    logger.functionFail(error, workflowDuration);

    // Update document status to error
    await step.run('update-status-embedding-error', async () => {
      await statusManager.updateStatus({
        status: 'error',
        error: errorMessage,
        metadata: {
          step: 'multimodal_embedding_generation',
          failedAt: new Date(),
        },
      });
    });

    // Emit error event
    await step.run('emit-embedding-error-event', async () => {
      await sendEvent('document.embedding-failed', {
        documentId,
        userId,
        error: errorMessage,
        failedAt: new Date(),
      });
    });

    return {
      success: false,
      documentId,
      textEmbeddingsGenerated: 0,
      imageEmbeddingsGenerated: 0,
      multimodalEmbeddingsGenerated: 0,
      totalTokens: 0,
      error: errorMessage,
    };
  }
};

/**
 * Test multimodal embedding generation with a specific document
 */
export async function testMultimodalEmbeddingGeneration(
  documentId: string,
): Promise<EmbeddingGenerationWorkflowResult> {
  const mockContext: EmbeddingGenerationWorkflowContext = {
    event: {
      data: {
        documentId,
        userId: 'test-user',
        elementsExtracted: 15,
        chunksEnhanced: 10,
        averageConfidence: 0.92,
        metadata: { processingTime: 5000, totalPages: 4, imagesProcessed: 4 },
      },
    },
    step: {
      run: async (stepName: string, fn: () => Promise<any>) => {
        console.log(`Executing embedding step: ${stepName}`);
        return await fn();
      },
    },
  };

  return await multimodalEmbeddingGenerationWorkflow(mockContext);
}
