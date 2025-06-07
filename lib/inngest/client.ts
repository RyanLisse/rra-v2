/**
 * Inngest Client Configuration
 * 
 * This file sets up the Inngest client for handling background jobs and workflows.
 * It provides type-safe event emission and workflow orchestration.
 */

import { Inngest } from 'inngest';
import type { EventSchemas } from './events';

/**
 * Inngest client instance with typed event schemas
 */
export const inngest = new Inngest({ 
  id: 'rra-v2-app',
  name: 'RRA V2 RAG Application',
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
});

/**
 * Type-safe event sender
 */
export const sendEvent = async <T extends keyof EventSchemas>(
  name: T,
  data: EventSchemas[T]['data'],
  options?: {
    id?: string;
    user?: { id: string; email?: string };
  }
) => {
  return inngest.send({
    name,
    data,
    id: options?.id,
    user: options?.user,
  });
};

/**
 * Batch event sender for multiple events
 */
export const sendEvents = async (
  events: Array<{
    name: keyof EventSchemas;
    data: any;
    id?: string;
    user?: { id: string; email?: string };
  }>
) => {
  return inngest.send(events);
};

/**
 * Event names for easy reference
 */
export const Events = {
  DOCUMENT_UPLOADED: 'document.uploaded' as const,
  DOCUMENT_TEXT_EXTRACTED: 'document.text-extracted' as const,
  DOCUMENT_EXTRACTION_FAILED: 'document.extraction-failed' as const,
  DOCUMENT_CHUNKED: 'document.chunked' as const,
  DOCUMENT_CHUNKING_FAILED: 'document.chunking-failed' as const,
  DOCUMENT_EMBEDDED: 'document.embedded' as const,
  DOCUMENT_EMBEDDING_FAILED: 'document.embedding-failed' as const,
  DOCUMENT_PROCESSED: 'document.processed' as const,
  USER_DOCUMENT_VIEWED: 'user.document-viewed' as const,
  USER_SEARCH_PERFORMED: 'user.search-performed' as const,
  SYSTEM_HEALTH_CHECK: 'system.health-check' as const,
  SYSTEM_CLEANUP_REQUESTED: 'system.cleanup-requested' as const,
} as const;

export default inngest;