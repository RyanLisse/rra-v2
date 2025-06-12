import { type NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getRagDocumentById, deleteRagDocumentById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { del } from '@vercel/blob';

export const GET = withAuth(async (
  request: NextRequest,
  user,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  try {

    const document = await getRagDocumentById({
      id: id,
      userId: user.id,
    });

    if (!document) {
      return new ChatSDKError('not_found:document', 'Document not found').toResponse();
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error('Document fetch error:', error);

    if (error instanceof ChatSDKError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return new ChatSDKError('internal:fetch', 'Failed to fetch document').toResponse();
  }
});

export const DELETE = withAuth(async (
  request: NextRequest,
  user,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  try {

    // First get the document to access file path
    const document = await getRagDocumentById({
      id: id,
      userId: user.id,
    });

    if (!document) {
      return new ChatSDKError('not_found:document', 'Document not found').toResponse();
    }

    // Delete the database record (this will cascade delete related records)
    const deletedDocument = await deleteRagDocumentById({
      id: id,
      userId: user.id,
    });

    if (!deletedDocument) {
      return new ChatSDKError('bad_request:delete', 'Failed to delete document').toResponse();
    }

    // Try to delete the file from blob storage (non-blocking)
    try {
      if (document.filePath?.startsWith('https://')) {
        await del(document.filePath);
        console.log(`Deleted blob: ${document.filePath}`);
      }
    } catch (blobError) {
      // Log but don't fail the request if blob deletion fails
      console.warn(`Failed to delete blob ${document.filePath}:`, blobError);
    }

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully',
      document: deletedDocument,
    });
  } catch (error) {
    console.error('Document deletion error:', error);

    if (error instanceof ChatSDKError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return new ChatSDKError('internal:delete', 'Failed to delete document').toResponse();
  }
});
