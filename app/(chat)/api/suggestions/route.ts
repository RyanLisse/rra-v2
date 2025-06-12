import { withAuthRequest } from '@/lib/auth/middleware';
import { getSuggestionsByDocumentId } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export const GET = withAuthRequest(async (request: Request, user) => {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId');

  if (!documentId) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter documentId is required.',
    ).toResponse();
  }

  const suggestions = await getSuggestionsByDocumentId({
    documentId,
  });

  const [suggestion] = suggestions;

  if (!suggestion) {
    return Response.json([], { status: 200 });
  }

  if (suggestion.userId !== user.id) {
    return new ChatSDKError('forbidden:api').toResponse();
  }

  return Response.json(suggestions, { status: 200 });
});
