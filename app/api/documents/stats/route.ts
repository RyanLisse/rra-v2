import { type NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getDocumentProcessingStats } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const stats = await getDocumentProcessingStats({
      userId: session.user.id,
    });

    return NextResponse.json({ 
      stats 
    });

  } catch (error) {
    console.error('Document stats error:', error);
    
    if (error instanceof ChatSDKError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch document statistics' },
      { status: 500 }
    );
  }
}