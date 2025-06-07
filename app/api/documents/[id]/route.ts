import { type NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getRagDocumentById, deleteRagDocumentById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const document = await getRagDocumentById({
      id: id,
      userId: session.user.id,
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ document });

  } catch (error) {
    console.error('Document fetch error:', error);
    
    if (error instanceof ChatSDKError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // First get the document to access file path
    const document = await getRagDocumentById({
      id: id,
      userId: session.user.id,
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Delete the database record (this will cascade delete related records)
    const deletedDocument = await deleteRagDocumentById({
      id: id,
      userId: session.user.id,
    });

    if (!deletedDocument) {
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 400 }
      );
    }

    // Try to delete the file from disk (non-blocking)
    try {
      if (document.filePath?.startsWith('/uploads/')) {
        const fullPath = path.join(process.cwd(), 'uploads', path.basename(document.filePath));
        await fs.unlink(fullPath);
        console.log(`Deleted file: ${fullPath}`);
      }
    } catch (fileError) {
      // Log but don't fail the request if file deletion fails
      console.warn(`Failed to delete file ${document.filePath}:`, fileError);
    }

    return NextResponse.json({ 
      success: true,
      message: 'Document deleted successfully',
      document: deletedDocument 
    });

  } catch (error) {
    console.error('Document deletion error:', error);
    
    if (error instanceof ChatSDKError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete document' },
      { status: 500 }
    );
  }
}