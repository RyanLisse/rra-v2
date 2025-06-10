/**
 * Secure Image Serving API Route
 *
 * Serves images from the local filesystem with security validation
 * to prevent directory traversal attacks and unauthorized access.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getUser } from '@/lib/auth/kinde';

// Define the base directories for security validation
const UPLOAD_BASE_DIR = path.resolve(process.cwd(), 'uploads');
const PROCESSED_PDFS_BASE_DIR = path.resolve(
  process.cwd(),
  'data/processed-pdfs-images',
);

/**
 * Securely serve images from uploads and processed PDFs directories
 * GET /api/images/[...imagePathParts]
 */
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Extract image path from URL
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const imagePathParts = pathParts.slice(2); // Remove 'api' and 'images'

  try {
    // Validate image path parameters
    if (!imagePathParts || imagePathParts.length === 0) {
      return NextResponse.json(
        { error: 'Image path is required' },
        { status: 400 },
      );
    }

    // Reconstruct the relative path from URL parameters
    // e.g., ['documentId', 'images', 'page_1.png'] -> 'documentId/images/page_1.png'
    const relativeImagePath = path.join(...imagePathParts);

    // **CRITICAL SECURITY**: Prevent directory traversal attacks
    if (relativeImagePath.includes('..')) {
      console.warn(
        `Attempted directory traversal with '..': ${relativeImagePath}`,
        {
          userId: user.id,
          userAgent: request.headers.get('user-agent'),
          ip:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip'),
        },
      );
      return NextResponse.json(
        { error: 'Invalid image path (contains ..)' },
        { status: 403 },
      );
    }

    // Try to serve from uploads directory first, then processed PDFs
    let absoluteImagePath: string;
    let isProcessedPdf = false;

    // Check if path starts with 'processed-pdfs/' to determine directory
    if (
      relativeImagePath.startsWith('processed-pdfs/') ||
      relativeImagePath.includes('/images/page-')
    ) {
      // Remove 'processed-pdfs/' prefix if present
      const cleanPath = relativeImagePath.startsWith('processed-pdfs/')
        ? relativeImagePath.substring('processed-pdfs/'.length)
        : relativeImagePath;
      absoluteImagePath = path.normalize(
        path.join(PROCESSED_PDFS_BASE_DIR, cleanPath),
      );
      isProcessedPdf = true;
    } else {
      absoluteImagePath = path.normalize(
        path.join(UPLOAD_BASE_DIR, relativeImagePath),
      );
    }

    // **DOUBLE SECURITY CHECK**: Ensure resolved path is within appropriate directory
    const allowedBaseDir = isProcessedPdf
      ? PROCESSED_PDFS_BASE_DIR
      : UPLOAD_BASE_DIR;
    if (!absoluteImagePath.startsWith(allowedBaseDir)) {
      console.warn(
        `Attempted directory traversal: ${relativeImagePath} -> ${absoluteImagePath}`,
        {
          userId: user.id,
          userAgent: request.headers.get('user-agent'),
          ip:
            request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip'),
        },
      );
      return NextResponse.json(
        { error: 'Invalid image path (traversal attempt)' },
        { status: 403 },
      );
    }

    // Additional validation: only allow specific image file extensions
    const allowedExtensions = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.svg',
    ];
    const fileExtension = path.extname(absoluteImagePath).toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { error: 'Unsupported file type' },
        { status: 400 },
      );
    }

    // Check if file exists and read it
    const imageBuffer = await fs.readFile(absoluteImagePath);

    // Determine the content type based on file extension
    const contentTypeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };

    const contentType =
      contentTypeMap[fileExtension] || 'application/octet-stream';

    // Set appropriate headers for image serving
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      'Content-Length': imageBuffer.length.toString(),
      // Security headers
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });

    // Return the image with appropriate headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('Image serving error:', {
      error: error.message,
      path: imagePathParts?.join('/'),
      userId: user?.id,
      code: error.code,
    });

    // Handle specific error types
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    if (error.code === 'EACCES') {
      return NextResponse.json(
        { error: 'Access denied to image file' },
        { status: 403 },
      );
    }

    if (error.code === 'EISDIR') {
      return NextResponse.json(
        { error: 'Path is a directory, not a file' },
        { status: 400 },
      );
    }

    // Generic error for any other issues
    return NextResponse.json(
      { error: 'Failed to serve image' },
      { status: 500 },
    );
  }
}

// Disable other HTTP methods
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
