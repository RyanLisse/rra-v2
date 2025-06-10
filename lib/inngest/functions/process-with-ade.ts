/**
 * Landing AI ADE Processing Inngest Function
 *
 * This file defines the Inngest function for processing documents with Landing AI's
 * Agentic Document Extraction (ADE) to extract structured information.
 * Triggered after PDF-to-image conversion completes successfully.
 */

import { inngest } from '@/lib/inngest/client';
import { adeProcessingWorkflow } from '@/lib/workflows/ade-processing';
import { getFunctionConfig } from '@/lib/inngest/config';

// Get environment-aware configuration
const config = getFunctionConfig('ade-processing');

/**
 * Process with ADE Function
 *
 * Triggered by: 'document.images-extracted' event
 * Purpose: Process document images and text with Landing AI ADE to extract structured elements
 * Next Step: Continues to multimodal embedding generation
 */
export const processWithAdeFn = inngest.createFunction(
  {
    id: 'process-with-ade',
    name: 'Process Document with Landing AI ADE',
    retries: config.retries,
    concurrency: config.concurrency,
    rateLimit: config.rateLimit,
    timeouts: config.timeouts,
  },
  // Trigger on image extraction completion
  { event: 'document.images-extracted' },
  // Use the ADE processing workflow logic
  adeProcessingWorkflow,
);

export default processWithAdeFn;
