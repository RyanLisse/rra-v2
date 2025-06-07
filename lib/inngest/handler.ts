import { serve } from "inngest/next";
import { inngest } from "./client";

// Import functions as they are created
// import { processDocumentUpload } from "./functions/process-document-upload";
// import { extractDocumentText } from "./functions/extract-document-text";
// import { chunkDocument } from "./functions/chunk-document";
// import { embedDocument } from "./functions/embed-document";
// import { handleProcessingFailure } from "./functions/handle-processing-failure";

/**
 * List of Inngest functions to register
 * Add new functions here as they are implemented
 */
const functions = [
  // processDocumentUpload,
  // extractDocumentText,
  // chunkDocument,
  // embedDocument,
  // handleProcessingFailure,
];

/**
 * Inngest HTTP handler for Next.js API routes
 * Handles function registration, introspection, and execution
 */
export const inngestHandler = serve({
  client: inngest,
  functions,
  signingKey: process.env.INNGEST_SIGNING_KEY,
  env: process.env.NODE_ENV,
  logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
  
  // Configure streaming and real-time features
  streaming: process.env.INNGEST_STREAMING_ENABLED === "true",
  
  // Set up development-specific options
  ...(process.env.NODE_ENV === "development" && {
    landingPage: true,
    introspection: true,
  }),
  
  // Production-specific security settings
  ...(process.env.NODE_ENV === "production" && {
    landingPage: false,
    introspection: false,
  }),
});

/**
 * Export configured handlers for different HTTP methods
 */
export const { GET, POST, PUT } = inngestHandler;

/**
 * Export client and functions for testing
 */
export { inngest, functions };