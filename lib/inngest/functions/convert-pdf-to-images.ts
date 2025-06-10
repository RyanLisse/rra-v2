/**
 * PDF to Images Inngest Function
 *
 * This file defines the Inngest function for converting PDF documents to images.
 * Triggered after text extraction completes successfully.
 */

import { inngest } from '@/lib/inngest/client';
import { pdfToImageConversionWorkflow } from '@/lib/workflows/pdf-to-image-conversion';
import { getFunctionConfig } from '@/lib/inngest/config';

// Get environment-aware configuration
const config = getFunctionConfig('pdf-conversion');

/**
 * Convert PDF to Images Function
 *
 * Triggered by: 'document.text-extracted' event
 * Purpose: Convert each page of a PDF document into individual images
 * Next Step: Continues to document chunking with image metadata
 */
export const convertPdfToImagesFn = inngest.createFunction(
  {
    id: 'convert-pdf-to-images',
    name: 'Convert PDF to Images',
    retries: config.retries,
    concurrency: config.concurrency,
    rateLimit: config.rateLimit,
    timeouts: config.timeouts,
  },
  // Trigger on text extraction completion
  { event: 'document.text-extracted' },
  // Use the workflow logic
  pdfToImageConversionWorkflow,
);

export default convertPdfToImagesFn;
