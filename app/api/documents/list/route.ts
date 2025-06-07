import { type NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getRagDocumentsByUserId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Number.parseInt(searchParams.get('limit') || '50');

    const documents = await getRagDocumentsByUserId({
      userId: session.user.id,
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
}
