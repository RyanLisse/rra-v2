/**
 * Multimodal Embeddings Generation Inngest Function
 *
 * This file defines the Inngest function for generating comprehensive embeddings
 * for text chunks, images, and multimodal combinations after ADE processing.
 * Triggered after ADE processing completes successfully.
 */

import { inngest } from '@/lib/inngest/client';
import { multimodalEmbeddingGenerationWorkflow } from '@/lib/workflows/multimodal-embedding-generation';
import { getFunctionConfig } from '@/lib/inngest/config';

// Get environment-aware configuration
const config = getFunctionConfig('embeddings');

/**
 * Generate Multimodal Embeddings Function
 *
 * Triggered by: 'document.ade-processed' event
 * Purpose: Generate text, image, and multimodal embeddings for comprehensive search
 * Next Step: Document is ready for RAG chat operations
 */
export const generateMultimodalEmbeddingsFn = inngest.createFunction(
  {
    id: 'generate-multimodal-embeddings',
    name: 'Generate Multimodal Embeddings',
    retries: config.retries,
    concurrency: config.concurrency,
    rateLimit: config.rateLimit,
    timeouts: config.timeouts,
  },
  // Trigger on ADE processing completion
  { event: 'document.ade-processed' },
  // Use the multimodal embedding generation workflow
  multimodalEmbeddingGenerationWorkflow,
);

export default generateMultimodalEmbeddingsFn;
