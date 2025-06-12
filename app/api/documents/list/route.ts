import { type NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getRagDocumentsByUserId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export const GET = withAuth(async (request: NextRequest, user) => {
  try {

    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '50');

    const documents = await getRagDocumentsByUserId({
      userId: user.id,
      limit: Math.min(limit, 100), // Cap at 100 documents
    });

    return NextResponse.json({
      documents,
      count: documents.length,
    });
  } catch (error) {
    console.error('Document list error:', error);

    if (error instanceof ChatSDKError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 },
    );
  }
});
