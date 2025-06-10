import { getUser } from '@/lib/auth/kinde';
import { getChatsByUserId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = Number.parseInt(searchParams.get('limit') || '10');
  const startingAfter = searchParams.get('starting_after');
  const endingBefore = searchParams.get('ending_before');

  if (startingAfter && endingBefore) {
    return new ChatSDKError(
      'bad_request:api',
      'Only one of starting_after or ending_before can be provided.',
    ).toResponse();
  }

  const user = await getUser();

  if (!user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chats = await getChatsByUserId({
    id: user.id,
    limit,
    startingAfter,
    endingBefore,
  });

  return Response.json(chats);
}
