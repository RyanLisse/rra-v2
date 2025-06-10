'use server';

import { db } from '@/lib/db';
import {
  ragDocument as documentsTable,
  documentContent as documentContentsTable,
  documentChunk as documentChunksTable,
} from '@/lib/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getUser } from '@/lib/auth/kinde';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export interface ManagedDocumentView {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  pageCount: number | null;
  chunkCount: number;
  hasContent: boolean;
}

export interface DocumentDetailView extends ManagedDocumentView {
  extractedText: string | null;
  textFilePath: string | null;
  metadata: any;
  chunks?: Array<{
    id: string;
    chunkIndex: string;
    content: string;
    tokenCount: string | null;
  }>;
}

export interface DocumentStats {
  total: number;
  uploaded: number;
  processing: number;
  textExtracted: number;
  chunked: number;
  embedded: number;
  processed: number;
  error: number;
}

export async function getManagedDocuments(): Promise<ManagedDocumentView[]> {
  const user = await getUser();
  if (!user?.id) {
    return [];
  }

  try {
    // Get documents with their content info
    const docsData = await db
      .select({
        document: documentsTable,
        content: documentContentsTable,
      })
      .from(documentsTable)
      .leftJoin(
        documentContentsTable,
        eq(documentsTable.id, documentContentsTable.documentId),
      )
      .where(eq(documentsTable.uploadedBy, user.id))
      .orderBy(desc(documentsTable.updatedAt));

    // Get chunk counts for each document
    const results: ManagedDocumentView[] = [];
    for (const row of docsData) {
      const chunkStats = await db
        .select({ count: sql<number>`count(*)` })
        .from(documentChunksTable)
        .where(eq(documentChunksTable.documentId, row.document.id));

      results.push({
        id: row.document.id,
        originalName: row.document.originalName,
        fileName: row.document.fileName,
        filePath: row.document.filePath,
        mimeType: row.document.mimeType,
        fileSize: row.document.fileSize,
        status: row.document.status,
        createdAt: row.document.createdAt,
        updatedAt: row.document.updatedAt,
        pageCount: row.content?.pageCount
          ? Number.parseInt(row.content.pageCount)
          : null,
        chunkCount: Number(chunkStats[0]?.count || 0),
        hasContent: !!row.content,
      });
    }

    return results;
  } catch (error) {
    console.error('Error fetching managed documents:', error);
    return [];
  }
}

export async function getDocumentDetails(
  documentId: string,
): Promise<DocumentDetailView | null> {
  const user = await getUser();
  if (!user?.id) {
    return null;
  }

  try {
    // Get document with content
    const docData = await db
      .select({
        document: documentsTable,
        content: documentContentsTable,
      })
      .from(documentsTable)
      .leftJoin(
        documentContentsTable,
        eq(documentsTable.id, documentContentsTable.documentId),
      )
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.uploadedBy, user.id),
        ),
      )
      .limit(1);

    if (!docData.length) {
      return null;
    }

    const { document: doc, content } = docData[0];

    // Get chunk count
    const chunkStats = await db
      .select({ count: sql<number>`count(*)` })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId));

    // Get chunks if requested
    const chunks = await db
      .select({
        id: documentChunksTable.id,
        chunkIndex: documentChunksTable.chunkIndex,
        content: documentChunksTable.content,
        tokenCount: documentChunksTable.tokenCount,
      })
      .from(documentChunksTable)
      .where(eq(documentChunksTable.documentId, documentId))
      .orderBy(documentChunksTable.chunkIndex);

    return {
      id: doc.id,
      originalName: doc.originalName,
      fileName: doc.fileName,
      filePath: doc.filePath,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      pageCount: content?.pageCount ? Number.parseInt(content.pageCount) : null,
      chunkCount: Number(chunkStats[0]?.count || 0),
      hasContent: !!content,
      extractedText: content?.extractedText || null,
      textFilePath: content?.textFilePath || null,
      metadata: content?.metadata || null,
      chunks: chunks.map((chunk) => ({
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
      })),
    };
  } catch (error) {
    console.error(`Error fetching details for document ${documentId}:`, error);
    return null;
  }
}

export async function deleteDocument(
  documentId: string,
): Promise<{ success: boolean; message?: string }> {
  const user = await getUser();
  if (!user?.id) {
    return { success: false, message: 'Unauthorized' };
  }

  try {
    // Get document details to find file paths for deletion
    const docData = await db
      .select({
        document: documentsTable,
        content: documentContentsTable,
      })
      .from(documentsTable)
      .leftJoin(
        documentContentsTable,
        eq(documentsTable.id, documentContentsTable.documentId),
      )
      .where(
        and(
          eq(documentsTable.id, documentId),
          eq(documentsTable.uploadedBy, user.id),
        ),
      )
      .limit(1);

    if (!docData.length) {
      return {
        success: false,
        message: 'Document not found or access denied.',
      };
    }

    const { document: doc, content } = docData[0];

    // Delete files from filesystem
    const filesToDelete: string[] = [];

    // Add original file
    if (doc.filePath) {
      const fullPath = path.isAbsolute(doc.filePath)
        ? doc.filePath
        : path.join(UPLOAD_DIR, doc.filePath);

      if (fullPath.startsWith(UPLOAD_DIR)) {
        filesToDelete.push(fullPath);
      }
    }

    // Add text file
    if (content?.textFilePath) {
      const fullPath = path.isAbsolute(content.textFilePath)
        ? content.textFilePath
        : path.join(UPLOAD_DIR, content.textFilePath);

      if (fullPath.startsWith(UPLOAD_DIR)) {
        filesToDelete.push(fullPath);
      }
    }

    // Delete all files
    for (const filePath of filesToDelete) {
      try {
        await fs.unlink(filePath);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.warn(`Failed to delete file ${filePath}: ${err.message}`);
        }
      }
    }

    // Try to clean up document-specific directory
    const docDir = path.join(UPLOAD_DIR, documentId);
    try {
      await fs.rmdir(docDir, { recursive: true } as any);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`Failed to delete directory ${docDir}: ${err.message}`);
      }
    }

    // Delete from database (CASCADE will handle related tables)
    await db.delete(documentsTable).where(eq(documentsTable.id, documentId));

    revalidatePath('/documents');
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting document ${documentId}:`, error);
    return { success: false, message: error.message };
  }
}

export async function getDocumentStats(): Promise<DocumentStats> {
  const user = await getUser();
  if (!user?.id) {
    return {
      total: 0,
      uploaded: 0,
      processing: 0,
      textExtracted: 0,
      chunked: 0,
      embedded: 0,
      processed: 0,
      error: 0,
    };
  }

  try {
    const stats = await db
      .select({
        status: documentsTable.status,
        count: sql<number>`count(*)`,
      })
      .from(documentsTable)
      .where(eq(documentsTable.uploadedBy, user.id))
      .groupBy(documentsTable.status);

    const result: DocumentStats = {
      total: 0,
      uploaded: 0,
      processing: 0,
      textExtracted: 0,
      chunked: 0,
      embedded: 0,
      processed: 0,
      error: 0,
    };

    for (const stat of stats) {
      const count = Number(stat.count);
      result.total += count;

      switch (stat.status) {
        case 'uploaded':
          result.uploaded = count;
          break;
        case 'processing':
          result.processing = count;
          break;
        case 'text_extracted':
          result.textExtracted = count;
          break;
        case 'chunked':
          result.chunked = count;
          break;
        case 'embedded':
          result.embedded = count;
          break;
        case 'processed':
          result.processed = count;
          break;
        case 'error':
          result.error = count;
          break;
      }
    }

    return result;
  } catch (error) {
    console.error('Error fetching document stats:', error);
    return {
      total: 0,
      uploaded: 0,
      processing: 0,
      textExtracted: 0,
      chunked: 0,
      embedded: 0,
      processed: 0,
      error: 0,
    };
  }
}
