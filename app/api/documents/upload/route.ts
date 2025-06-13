import { type NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { nanoid } from 'nanoid';
import { ragDocument } from '@/lib/db/schema';
import { withTransaction } from '@/lib/db/transactions';
import { sendEvent } from '@/lib/inngest/client';
import { withAuth } from '@/lib/auth/middleware';
import { ChatSDKError } from '@/lib/errors';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/msword', // DOC
];

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return new ChatSDKError(
        'bad_request:upload',
        'No files uploaded',
      ).toResponse();
    }

    const uploadedFiles = [];
    const errors = [];

    for (const file of files) {
      try {
        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
          const allowedExtensions = ['PDF', 'TXT', 'MD', 'DOCX', 'DOC'];
          errors.push(
            `${file.name}: Only ${allowedExtensions.join(', ')} files are allowed`,
          );
          continue;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: File size exceeds 50MB limit`);
          continue;
        }

        // Generate unique filename with proper extension handling
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFilename = `${nanoid()}-${safeName}`;
        const blobPath = `documents/${user.id}/${uniqueFilename}`;

        // Upload to Vercel Blob
        const blob = await put(blobPath, file, {
          access: 'public',
          addRandomSuffix: false,
          contentType: file.type,
        });

        // Save to database and emit event in a transaction
        const newDocument = await withTransaction(async (tx) => {
          const [document] = await tx
            .insert(ragDocument)
            .values({
              fileName: uniqueFilename,
              originalName: file.name,
              filePath: blob.url,
              mimeType: file.type,
              fileSize: file.size.toString(),
              status: 'uploaded',
              uploadedBy: user.id,
            })
            .returning();

          // Emit Inngest event within transaction scope
          await sendEvent('document.uploaded', {
            documentId: document.id,
            userId: user.id,
            filePath: blob.url,
            metadata: {
              originalName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              blobUrl: blob.url,
            },
          });

          return document;
        });

        uploadedFiles.push({
          documentId: newDocument.id,
          originalName: file.name,
          fileName: uniqueFilename,
          size: file.size,
          status: 'uploaded',
          url: blob.url,
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        errors.push(`${file.name}: Failed to process file`);
      }
    }

    if (uploadedFiles.length === 0) {
      return new ChatSDKError(
        'bad_request:upload',
        'No files were successfully uploaded',
        { errors },
      ).toResponse();
    }

    return NextResponse.json({
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Upload error:', error);

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return new ChatSDKError(
      'bad_request:upload',
      'Internal server error during upload',
    ).toResponse();
  }
});
