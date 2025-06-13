import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { getUser } from '@/lib/auth/kinde';

export default async function Page() {
  const user = await getUser();
  const id = generateUUID();

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');

  // Allow both authenticated and unauthenticated users to access the chat
  const modelId = modelIdFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        initialChatModel={modelId}
        isReadonly={false}
        session={user ? { user } : undefined}
        autoResume={false}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
