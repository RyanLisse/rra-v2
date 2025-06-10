/**
 * Artifact Document Handlers
 *
 * Utility functions for creating artifact document handlers.
 * Extracted to prevent circular dependencies between server files.
 */

import type { ArtifactKind } from '@/lib/types/artifacts';
import type { DataStreamWriter } from 'ai';
import type { Document } from '@/lib/db/schema';
import { saveDocument } from '@/lib/db/queries';

// Compatible session type for auth systems
interface CompatibleSession {
  user?: {
    id?: string;
    email?: string;
  };
}

export interface SaveDocumentProps {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}

export interface CreateDocumentCallbackProps {
  id: string;
  title: string;
  dataStream: DataStreamWriter;
  session: CompatibleSession;
}

export interface UpdateDocumentCallbackProps {
  id: string;
  content: string;
  dataStream: DataStreamWriter;
  document: Document;
  session: CompatibleSession;
}

export interface DocumentHandler<T extends ArtifactKind> {
  kind: T;
  onCreateDocument: (props: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument?: (props: UpdateDocumentCallbackProps) => Promise<void>;
}

export interface DocumentHandlerConfig<T extends ArtifactKind> {
  kind: T;
  onCreateDocument: (props: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument?: (props: UpdateDocumentCallbackProps) => Promise<void>;
}

/**
 * Create a document handler for a specific artifact kind
 */
export function createDocumentHandler<T extends ArtifactKind>(
  config: DocumentHandlerConfig<T>,
): DocumentHandler<T> {
  return {
    kind: config.kind,
    onCreateDocument: config.onCreateDocument,
    onUpdateDocument: config.onUpdateDocument,
  };
}

/**
 * Save document utility function
 */
export async function saveArtifactDocument(
  props: SaveDocumentProps,
): Promise<Document> {
  const result = await saveDocument(props);
  return result[0];
}

/**
 * Get user ID from session
 */
export function getUserIdFromSession(session: CompatibleSession): string {
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('Unauthorized: User ID not found in session');
  }
  return userId;
}

/**
 * Validate document handler configuration
 */
export function validateHandlerConfig<T extends ArtifactKind>(
  config: DocumentHandlerConfig<T>,
): void {
  if (!config.kind) {
    throw new Error('Document handler must specify an artifact kind');
  }

  if (typeof config.onCreateDocument !== 'function') {
    throw new Error('Document handler must provide onCreateDocument function');
  }
}

/**
 * Registry for document handlers
 */
export class DocumentHandlerRegistry {
  private static instance: DocumentHandlerRegistry;
  private handlers: Map<ArtifactKind, DocumentHandler<any>> = new Map();

  private constructor() {}

  public static getInstance(): DocumentHandlerRegistry {
    if (!DocumentHandlerRegistry.instance) {
      DocumentHandlerRegistry.instance = new DocumentHandlerRegistry();
    }
    return DocumentHandlerRegistry.instance;
  }

  public register<T extends ArtifactKind>(handler: DocumentHandler<T>): void {
    validateHandlerConfig(handler);
    this.handlers.set(handler.kind, handler);
  }

  public get<T extends ArtifactKind>(kind: T): DocumentHandler<T> | undefined {
    return this.handlers.get(kind);
  }

  public getAll(): DocumentHandler<any>[] {
    return Array.from(this.handlers.values());
  }

  public has(kind: ArtifactKind): boolean {
    return this.handlers.has(kind);
  }

  public clear(): void {
    this.handlers.clear();
  }
}

// Export singleton instance
export const documentHandlerRegistry = DocumentHandlerRegistry.getInstance();
