import { type NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import { withAuth } from '@/lib/auth';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/msword', // DOC
];

async function ensureUploadDirExists() {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

export const POST = withAuth(async (request: NextRequest, session: any) => {
  try {
    await ensureUploadDirExists();

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const uploadedFiles = [];
    const errors = [];

    for (const file of files) {
      try {
        // Validate file type
        if (!ALLOWED_TYPES.includes(file.type)) {
          const allowedExtensions = ['PDF', 'TXT', 'MD', 'DOCX', 'DOC'];
          errors.push(`${file.name}: Only ${allowedExtensions.join(', ')} files are allowed`);
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
        const filePath = join(UPLOAD_DIR, uniqueFilename);

        // Save file to disk
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        await writeFile(filePath, fileBuffer);

        // Save to database
        const [newDocument] = await db
          .insert(ragDocument)
          .values({
            fileName: uniqueFilename,
            originalName: file.name,
            filePath: filePath,
            mimeType: file.type,
            fileSize: file.size.toString(),
            status: 'uploaded',
            uploadedBy: session.user.id,
          })
          .returning();

        uploadedFiles.push({
          documentId: newDocument.id,
          originalName: file.name,
          fileName: uniqueFilename,
          size: file.size,
          status: 'uploaded',
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        errors.push(`${file.name}: Failed to process file`);
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        {
          error: 'No files were successfully uploaded',
          errors,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error during upload',
      },
      { status: 500 },
    );
  }
});
