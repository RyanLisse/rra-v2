import { type NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getDocumentProcessingStats } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const stats = await getDocumentProcessingStats({
      userId: user.id,
    });

    return NextResponse.json({
      stats,
    });
  } catch (error) {
    console.error('Document stats error:', error);

    if (error instanceof ChatSDKError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch document statistics' },
      { status: 500 },
    );
  }
});
