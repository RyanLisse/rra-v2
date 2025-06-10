/**
 * Document Image Manager
 *
 * This file provides utilities for managing document images in the database
 * and file system, including retrieval, cleanup, and metadata operations.
 */

import { db } from '@/lib/db';
import { documentImage } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { unlink, stat } from 'node:fs/promises';
import type { DocumentImage } from '@/lib/db/schema';

/**
 * Image metadata for API responses
 */
export interface ImageMetadata {
  id: string;
  documentId: string;
  pageNumber: number;
  imagePath: string;
  format: string;
  width?: number;
  height?: number;
  fileSize: number;
  quality?: number;
  createdAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Image statistics for a document
 */
export interface DocumentImageStats {
  documentId: string;
  totalImages: number;
  totalFileSize: number;
  averageFileSize: number;
  formats: Record<string, number>;
  pageRange: {
    min: number;
    max: number;
  };
  createdAt: Date;
  lastUpdated: Date;
}

/**
 * Get all images for a document
 */
export async function getDocumentImages(
  documentId: string,
): Promise<ImageMetadata[]> {
  try {
    const images = await db
      .select()
      .from(documentImage)
      .where(eq(documentImage.documentId, documentId))
      .orderBy(documentImage.pageNumber);

    return images.map(formatImageForResponse);
  } catch (error) {
    console.error(`Failed to get images for document ${documentId}:`, error);
    throw new Error('Failed to retrieve document images');
  }
}

/**
 * Get a specific image by document ID and page number
 */
export async function getDocumentImageByPage(
  documentId: string,
  pageNumber: number,
): Promise<ImageMetadata | null> {
  try {
    const images = await db
      .select()
      .from(documentImage)
      .where(
        and(
          eq(documentImage.documentId, documentId),
          eq(documentImage.pageNumber, pageNumber),
        ),
      )
      .limit(1);

    return images.length > 0 ? formatImageForResponse(images[0]) : null;
  } catch (error) {
    console.error(
      `Failed to get image for document ${documentId}, page ${pageNumber}:`,
      error,
    );
    throw new Error('Failed to retrieve document image');
  }
}

/**
 * Get image statistics for a document
 */
export async function getDocumentImageStats(
  documentId: string,
): Promise<DocumentImageStats | null> {
  try {
    const images = await db
      .select()
      .from(documentImage)
      .where(eq(documentImage.documentId, documentId));

    if (images.length === 0) {
      return null;
    }

    const totalFileSize = images.reduce(
      (sum, img) => sum + (Number.parseInt(String(img.fileSize || '0')) || 0),
      0,
    );

    const formats = images.reduce(
      (acc, img) => {
        const format = img.mimeType.split('/')[1] || 'unknown';
        acc[format] = (acc[format] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const pageNumbers = images.map((img) => img.pageNumber);

    return {
      documentId,
      totalImages: images.length,
      totalFileSize,
      averageFileSize: totalFileSize / images.length,
      formats,
      pageRange: {
        min: Math.min(...pageNumbers),
        max: Math.max(...pageNumbers),
      },
      createdAt: new Date(
        Math.min(...images.map((img) => img.createdAt.getTime())),
      ),
      lastUpdated: new Date(
        Math.max(...images.map((img) => img.createdAt.getTime())),
      ),
    };
  } catch (error) {
    console.error(
      `Failed to get image stats for document ${documentId}:`,
      error,
    );
    throw new Error('Failed to retrieve document image statistics');
  }
}

/**
 * Check if a document has images
 */
export async function documentHasImages(documentId: string): Promise<boolean> {
  try {
    const images = await db
      .select({ id: documentImage.id })
      .from(documentImage)
      .where(eq(documentImage.documentId, documentId))
      .limit(1);

    return images.length > 0;
  } catch (error) {
    console.error(`Failed to check images for document ${documentId}:`, error);
    return false;
  }
}

/**
 * Verify image files exist on disk
 */
export async function verifyDocumentImageFiles(documentId: string): Promise<{
  total: number;
  existing: number;
  missing: string[];
  corrupted: string[];
}> {
  try {
    const images = await db
      .select()
      .from(documentImage)
      .where(eq(documentImage.documentId, documentId));

    const missing: string[] = [];
    const corrupted: string[] = [];
    let existing = 0;

    for (const image of images) {
      try {
        if (!existsSync(image.imagePath)) {
          missing.push(image.imagePath);
          continue;
        }

        // Check if file is readable and has expected size
        const stats = await stat(image.imagePath);
        const expectedSize = Number.parseInt(String(image.fileSize || '0'));

        if (expectedSize > 0 && Math.abs(stats.size - expectedSize) > 100) {
          // Allow small difference for metadata
          corrupted.push(image.imagePath);
          continue;
        }

        existing++;
      } catch (error) {
        corrupted.push(image.imagePath);
      }
    }

    return {
      total: images.length,
      existing,
      missing,
      corrupted,
    };
  } catch (error) {
    console.error(
      `Failed to verify image files for document ${documentId}:`,
      error,
    );
    throw new Error('Failed to verify document image files');
  }
}

/**
 * Clean up image records and files for a document
 */
export async function cleanupDocumentImages(
  documentId: string,
  options: {
    removeFiles?: boolean;
    removeRecords?: boolean;
  } = { removeFiles: true, removeRecords: true },
): Promise<{
  removedRecords: number;
  removedFiles: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let removedRecords = 0;
  let removedFiles = 0;

  try {
    // Get all images for the document
    const images = await db
      .select()
      .from(documentImage)
      .where(eq(documentImage.documentId, documentId));

    // Remove files if requested
    if (options.removeFiles) {
      for (const image of images) {
        try {
          if (existsSync(image.imagePath)) {
            await unlink(image.imagePath);
            removedFiles++;
          }
        } catch (error) {
          errors.push(`Failed to remove file ${image.imagePath}: ${error}`);
        }
      }
    }

    // Remove database records if requested
    if (options.removeRecords) {
      const result = await db
        .delete(documentImage)
        .where(eq(documentImage.documentId, documentId));

      removedRecords = images.length; // Drizzle doesn't return affected rows count
    }

    return {
      removedRecords,
      removedFiles,
      errors,
    };
  } catch (error) {
    console.error(
      `Failed to cleanup images for document ${documentId}:`,
      error,
    );
    throw new Error('Failed to cleanup document images');
  }
}

/**
 * Update image metadata
 */
export async function updateImageMetadata(
  imageId: string,
  metadata: Partial<
    Pick<DocumentImage, 'width' | 'height' | 'fileSize' | 'extractionMetadata'>
  >,
): Promise<void> {
  try {
    await db
      .update(documentImage)
      .set(metadata)
      .where(eq(documentImage.id, imageId));
  } catch (error) {
    console.error(`Failed to update metadata for image ${imageId}:`, error);
    throw new Error('Failed to update image metadata');
  }
}

/**
 * Get images that need verification or reprocessing
 */
export async function getImagesNeedingAttention(): Promise<{
  missingFiles: ImageMetadata[];
  corruptedFiles: ImageMetadata[];
  recentFailures: ImageMetadata[];
}> {
  try {
    // Get all images from the last 30 days
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 30);

    const allImages = await db
      .select()
      .from(documentImage)
      .where(eq(documentImage.createdAt, recentDate))
      .orderBy(desc(documentImage.createdAt));

    const missingFiles: ImageMetadata[] = [];
    const corruptedFiles: ImageMetadata[] = [];

    // Check each image file
    for (const image of allImages) {
      try {
        if (!existsSync(image.imagePath)) {
          missingFiles.push(formatImageForResponse(image));
          continue;
        }

        const stats = await stat(image.imagePath);
        const expectedSize = Number.parseInt(String(image.fileSize || '0'));

        if (expectedSize > 0 && Math.abs(stats.size - expectedSize) > 100) {
          corruptedFiles.push(formatImageForResponse(image));
        }
      } catch (error) {
        corruptedFiles.push(formatImageForResponse(image));
      }
    }

    return {
      missingFiles,
      corruptedFiles,
      recentFailures: [], // Would need to track failures in a separate table
    };
  } catch (error) {
    console.error('Failed to get images needing attention:', error);
    throw new Error('Failed to retrieve images needing attention');
  }
}

/**
 * Format database image record for API response
 */
function formatImageForResponse(image: DocumentImage): ImageMetadata {
  return {
    id: image.id,
    documentId: image.documentId,
    pageNumber: image.pageNumber,
    imagePath: image.imagePath,
    format: image.mimeType.split('/')[1] || 'unknown',
    width: image.width || undefined,
    height: image.height || undefined,
    fileSize: Number.parseInt(String(image.fileSize || '0')),
    createdAt: image.createdAt,
    metadata: image.extractionMetadata as Record<string, any> | undefined,
  };
}

/**
 * Export helper types
 */
export type { DocumentImage } from '@/lib/db/schema';
