import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ragDocument, documentChunk, documentEmbedding } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { withAuth } from '@/lib/auth';
import { cohereService } from '@/lib/ai/cohere-client';
import { z } from 'zod';

const embedRequestSchema = z.object({
  documentId: z.string().uuid('Invalid document ID'),
  options: z.object({
    model: z.enum(['v3.0', 'v4.0']).optional(),
    batchSize: z.number().min(1).max(200).optional(),
    useCache: z.boolean().optional(),
    maxConcurrency: z.number().min(1).max(5).optional(),
    overwrite: z.boolean().optional(),
  }).optional(),
});

export const POST = withAuth(async (request: NextRequest, session: any) => {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = embedRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request parameters',
          details: validation.error.errors,
        },
        { status: 400 },
      );
    }
    
    const { documentId, options = {} } = validation.data;
    const {
      model = 'v4.0',
      batchSize = 64,
      useCache = true,
      maxConcurrency = 3,
      overwrite = false,
    } = options;

    // Check if embeddings already exist and not overwriting
    if (!overwrite) {
      const existingEmbeddings = await db.query.documentEmbedding.findFirst({
        where: (embeddings, { eq, and }) => {
          return and(
            eq(embeddings.chunkId, sql`(
              SELECT id FROM ${documentChunk} 
              WHERE document_id = ${documentId} 
              LIMIT 1
            )`),
          );
        },
      });
      
      if (existingEmbeddings) {
        return NextResponse.json(
          {
            error: 'Embeddings already exist for this document',
            message: 'Use overwrite=true to regenerate embeddings',
          },
          { status: 409 },
        );
      }
    }

    // Fetch document and its chunks
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

    // Check if document is chunked
    if (document.status !== 'chunked') {
      return NextResponse.json(
        {
          error: `Document status is '${document.status}', expected 'chunked'`,
        },
        { status: 400 },
      );
    }

    // Get document chunks
    const chunks = await db.query.documentChunk.findMany({
      where: eq(documentChunk.documentId, documentId),
      orderBy: (chunks, { asc }) => [asc(chunks.chunkIndex)],
    });

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'No chunks found for document' },
        { status: 400 },
      );
    }

    // Update status to processing
    await db
      .update(ragDocument)
      .set({
        status: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, documentId));

    try {
      // Extract chunk texts for embedding
      const chunkTexts = chunks.map((chunk) => chunk.content);
      
      // Log processing start
      console.log(`Starting embedding generation for ${chunks.length} chunks using model ${model}`);
      const embeddingStartTime = Date.now();

      // Generate embeddings in optimized batches
      const embeddingBatch = await cohereService.generateEmbeddingBatch(
        chunkTexts,
        {
          batchSize,
          model,
          useCache,
          maxConcurrency,
          inputType: 'search_document',
        },
      );
      
      const embeddingTime = Date.now() - embeddingStartTime;
      console.log(`Embedding generation completed in ${embeddingTime}ms`);

      if (embeddingBatch.embeddings.length !== chunks.length) {
        throw new Error(
          `Embedding count mismatch: expected ${chunks.length}, got ${embeddingBatch.embeddings.length}`,
        );
      }

      // Prepare embedding records for database with enhanced metadata
      const embeddingInserts = chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        embedding: JSON.stringify(embeddingBatch.embeddings[index].embedding),
        model: embeddingBatch.model,
        createdAt: new Date(),
      }));

      await db.transaction(async (tx) => {
        // Remove existing embeddings if overwriting
        if (overwrite) {
          const existingChunkIds = chunks.map((chunk) => chunk.id);
          if (existingChunkIds.length > 0) {
            await tx
              .delete(documentEmbedding)
              .where(sql`${documentEmbedding.chunkId} = ANY(${existingChunkIds})`);
          }
        }

        // Insert new embeddings in batches for better performance
        const insertBatchSize = 100;
        for (let i = 0; i < embeddingInserts.length; i += insertBatchSize) {
          const batch = embeddingInserts.slice(i, i + insertBatchSize);
          await tx.insert(documentEmbedding).values(batch);
        }

        // Update document status and metadata
        await tx
          .update(ragDocument)
          .set({
            status: 'embedded',
            updatedAt: new Date(),
          })
          .where(eq(ragDocument.id, documentId));
      });

      return NextResponse.json({
        message: 'Document embeddings generated successfully',
        documentId: documentId,
        stats: {
          totalChunks: chunks.length,
          totalEmbeddings: embeddingBatch.embeddings.length,
          totalTokens: embeddingBatch.totalTokens,
          embeddingDimensions:
            embeddingBatch.embeddings[0]?.embedding.length || 0,
          model: embeddingBatch.model,
          processingTimeMs: embeddingBatch.processingTimeMs,
          avgTokensPerChunk: Math.round(embeddingBatch.totalTokens / chunks.length),
          batchConfig: {
            batchSize,
            maxConcurrency,
            cacheUsed: useCache,
          },
        },
        performance: {
          embeddingTimeMs: embeddingTime,
          throughputChunksPerSecond: chunks.length / (embeddingTime / 1000),
          throughputTokensPerSecond: embeddingBatch.totalTokens / (embeddingTime / 1000),
        },
      });
    } catch (embeddingError) {
      console.error('Embedding generation error:', embeddingError);

      // Update status to error
      await db
        .update(ragDocument)
        .set({
          status: 'error',
          updatedAt: new Date(),
        })
        .where(eq(ragDocument.id, documentId));

      return NextResponse.json(
        {
          error: 'Failed to generate embeddings',
          details:
            embeddingError instanceof Error
              ? embeddingError.message
              : 'Unknown error',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Embedding endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
});
