Alright, we've significantly enhanced the chat interface with interactive citations and follow-up questions. Now, let's tackle a core piece of "Conversation Management" from the PRD: **Saving, Resuming, and Managing Chat Conversations**.

The Vercel AI Chatbot template already has some foundational pieces for this (like `app/actions.ts` with `getChats`, `saveChat`, `removeChat` and usage of `localStorage`). We will build upon this, ensuring it integrates with our database backend for more persistent storage and aligns with the user-scoped conversation requirements.

---

### Slice 12: Persistent Conversation Management

**What You're Building:**
*   Database schemas for `conversations` and `conversation_messages`.
*   Modifying the existing Vercel AI Chatbot `saveChat` action (or creating a new one) to save conversation details and messages to the NeonDB database.
*   Modifying `getChats` to fetch the list of conversations for a user from the database.
*   Modifying `getChat` (if it exists, or creating it) to fetch a specific conversation's messages from the database.
*   Ensuring the frontend chat UI correctly loads and displays selected past conversations.
*   Implementing "auto-save drafts" (this might be a lighter version, e.g., saving on message send/receive rather than aggressive real-time drafts).

**Tasks:**

1.  **Define Database Schemas for Conversations & Messages** - Complexity: 2
    *   [ ] In `lib/db/schema.ts`:
        *   `conversations`: `id` (uuid, pk, this will likely be the `chatId` from `useChat`), `userId` (text/uuid, fk to a future `users` table if auth is in place; for now, can be a placeholder or nullable), `title` (text, can be auto-generated from first few messages), `createdAt`, `updatedAt`, `metadata` (jsonb, optional for other info).
        *   `conversation_messages`: `id` (uuid, pk), `conversationId` (uuid, fk to `conversations.id`), `role` (text, e.g., "user", "assistant", "system", "data"), `content` (text), `name` (text, optional, for tool calls/results), `toolInvocations` (jsonb, optional, if using Vercel AI SDK tool calls), `dataPayload` (jsonb, for our `experimental_streamData` like sources/follow-ups), `createdAt`.
    *   [ ] Add relations between `conversations` and `conversation_messages`.
    *   [ ] Generate and run migrations: `bun run db:generate`, `bun run db:migrate`.
2.  **Refactor/Implement Server Actions for Conversation CRUD** - Complexity: 4
    *   [ ] Review `app/lib/chat/actions.tsx` (or similar path in the Vercel AI Chatbot template). It likely contains functions like `getChats`, `getChat`, `saveChat`, `removeChat`, `clearChats`.
    *   **`saveChat(chat)`:**
        *   Modify this function (or create a DB-specific version).
        *   Input: The `chat` object (which includes `id`, `messages`, potentially `title`).
        *   Logic:
            *   Upsert the conversation metadata (ID, title, userId, timestamps) into the `conversations` table.
            *   For each message in `chat.messages`:
                *   Upsert it into the `conversation_messages` table, linking to `conversationId`.
                *   Store `role`, `content`.
                *   **Crucially, store our `experimental_streamData` (sources, follow-ups) in the `dataPayload` JSONB column.**
        *   This function will be called by the frontend, likely on each new message or when a chat "ends."
    *   **`getChats(userId)`:**
        *   Modify to fetch a list of conversations (e.g., `id`, `title`, `updatedAt`) for the given `userId` (placeholder for now) from the `conversations` table, ordered by `updatedAt` descending.
    *   **`getChat(id, userId)`:**
        *   Modify to fetch a specific conversation by its `id` (and `userId`).
        *   Retrieve its metadata from `conversations` and all associated messages (ordered by `createdAt`) from `conversation_messages`.
        *   Reconstruct the `Message[]` array, ensuring `experimental_streamData` is correctly populated from the `dataPayload` column.
    *   **`removeChat({ id, path })`:**
        *   Modify to delete the conversation and its messages from the database.
    *   **`clearChats(userId)`:**
        *   Modify to delete all conversations for a user from the database.
    *   **Subtask 2.1:** Implement DB logic for `saveChat`. - Complexity: 2
    *   **Subtask 2.2:** Implement DB logic for `getChats` and `getChat`. - Complexity: 2
    *   **Subtask 2.3:** Implement DB logic for `removeChat` and `clearChats`. - Complexity: 1
3.  **Frontend Integration with Server Actions** - Complexity: 3
    *   [ ] The Vercel AI Chatbot template's frontend (`app/page.tsx`, `components/chat.tsx`, `components/sidebar.tsx`) already calls these server actions.
    *   [ ] **Saving:** Ensure `saveChat` is called appropriately. The template might do this when messages change. For "auto-save drafts," this existing mechanism might be sufficient if `saveChat` is efficient.
        *   When `useChat`'s `messages` array updates, trigger `saveChat`.
    *   **Loading:** When a user clicks a conversation in the sidebar:
        *   The URL likely changes to `/chat/[chatId]`.
        *   The main chat page component (`app/page.tsx` or `app/chat/[id]/page.tsx`) should use the `chatId` from the URL to call `getChat(chatId, userId)` and initialize `useChat` with these `initialMessages`.
    *   **Listing:** The sidebar should use `getChats(userId)` to populate the list.
    *   **User Scope:** For now, `userId` can be a hardcoded placeholder or ignored if not implementing multi-user auth yet. The PRD mentions "User-scoped conversations," so this is a placeholder for that.
4.  **Handling `experimental_streamData` Persistence** - Complexity: 2
    *   [ ] When saving messages in `saveChat`, ensure the `experimental_streamData` (which holds our sources and follow-ups) is stringified and stored in the `dataPayload` JSONB column.
    *   [ ] When fetching messages in `getChat`, parse the `dataPayload` back into the `experimental_streamData` field of the `Message` object.
5.  **Auto-generating Conversation Titles (Optional Enhancement)** - Complexity: 2
    *   [ ] If a conversation is saved and doesn't have a title, you could add logic (either in `saveChat` or a separate utility) to generate a title from the first few user/assistant messages.
    *   Alternatively, the LLM could be prompted to create a concise title.
6.  **Write Tests** - Complexity: 2
    *   [ ] **Server Actions:** Unit test the database interaction logic for each action (mocking `db`).
    *   [ ] **Frontend:** Test that selecting a past conversation loads its messages. Test that new messages are saved. (These might be more e2e or integration-style tests).

**Code Example (`lib/db/schema.ts` additions):**
```typescript
// lib/db/schema.ts
// ... (existing imports and tables)
import { jsonb } from 'drizzle-orm/pg-core'; // For JSONB columns

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey(), // This will be the chatId
  userId: text('user_id'), // Placeholder for actual user ID from auth
  title: text('title'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdate(() => new Date()),
  // metadata: jsonb('metadata'), // For any other custom info
});

export const conversationMessages = pgTable('conversation_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user', 'assistant', 'system', 'data', 'tool'
  content: text('content').notNull(),
  name: text('name'), // For tool role
  // toolInvocations: jsonb('tool_invocations'), // If using Vercel AI SDK tool_calls
  dataPayload: jsonb('data_payload'), // To store our experimental_streamData (sources, followUps)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMessages.conversationId],
    references: [conversations.id],
  }),
}));

// Add to default export
export default {
  // ... other tables and relations
  conversations,
  conversationMessages,
  conversationsRelations,
  conversationMessagesRelations,
};
```
**Remember to run `bun run db:generate` and `bun run db:migrate` after schema changes.**

**Code Example (Refactoring `app/lib/chat/actions.tsx` - Conceptual):**
```typescript
// app/lib/chat/actions.tsx (or similar)
'use server' // If using Server Actions

import { db } from '@/lib/db';
import {
  conversations as conversationsTable,
  conversationMessages as messagesTable
} from '@/lib/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { type Chat, type Message } from 'ai/react'; // Assuming these types
import { revalidatePath } from 'next/cache';

const MOCK_USER_ID = 'mock-user-123'; // Placeholder

export async function getChats(userId?: string) {
  const targetUserId = userId || MOCK_USER_ID;
  try {
    const chats = await db
      .select({ id: conversationsTable.id, title: conversationsTable.title, updatedAt: conversationsTable.updatedAt })
      .from(conversationsTable)
      .where(eq(conversationsTable.userId, targetUserId))
      .orderBy(desc(conversationsTable.updatedAt));
    return chats;
  } catch (error) {
    console.error("Error fetching chats:", error);
    return [];
  }
}

export async function getChat(id: string, userId?: string) {
  const targetUserId = userId || MOCK_USER_ID;
  try {
    const chatData = await db.query.conversations.findFirst({
      where: (table, { and }) => and(eq(table.id, id), eq(table.userId, targetUserId)),
      with: {
        messages: {
          orderBy: [asc(messagesTable.createdAt)],
        },
      },
    });

    if (!chatData) return null;

    // Reconstruct messages, parsing dataPayload for experimental_streamData
    const messages: Message[] = chatData.messages.map(msg => ({
      id: msg.id,
      role: msg.role as Message['role'],
      content: msg.content,
      name: msg.name ?? undefined,
      // toolInvocations: msg.toolInvocations ? JSON.parse(msg.toolInvocations as string) : undefined, // If stored as string
      experimental_streamData: msg.dataPayload ?? undefined, // dataPayload is already JSONB
      createdAt: msg.createdAt,
    }));

    return {
      id: chatData.id,
      title: chatData.title,
      userId: chatData.userId,
      createdAt: chatData.createdAt,
      updatedAt: chatData.updatedAt,
      messages,
      path: `/chat/${chatData.id}` // For consistency with Vercel template
    } as Chat & { path: string }; // Cast to include path if needed by UI

  } catch (error) {
    console.error(`Error fetching chat ${id}:`, error);
    return null;
  }
}

export async function saveChat(chat: Chat) { // Chat type from ai/react
  const userId = chat.userId || MOCK_USER_ID;
  const chatTitle = chat.title || chat.messages.length > 0 ? chat.messages[0].content.substring(0, 50) : 'New Chat';

  try {
    await db.transaction(async (tx) => {
      await tx.insert(conversationsTable)
        .values({
          id: chat.id,
          userId: userId,
          title: chatTitle,
          createdAt: chat.createdAt || new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: conversationsTable.id,
          set: { title: chatTitle, updatedAt: new Date() },
        });

      // Delete existing messages for this chat to avoid duplicates if upserting all
      // Or, more efficiently, only insert new messages.
      // For simplicity in this example, we'll delete and re-insert if messages are provided.
      // A more robust solution would track message IDs and only upsert changes/new ones.
      if (chat.messages && chat.messages.length > 0) {
          await tx.delete(messagesTable).where(eq(messagesTable.conversationId, chat.id));

          const messageValues = chat.messages.map(msg => ({
            id: msg.id, // useChat generates message IDs
            conversationId: chat.id,
            role: msg.role,
            content: msg.content,
            name: msg.name,
            // toolInvocations: msg.toolInvocations ? JSON.stringify(msg.toolInvocations) : null,
            dataPayload: msg.experimental_streamData ?? null, // Store as JSONB
            createdAt: msg.createdAt || new Date(), // Ensure createdAt is set
          }));
          if (messageValues.length > 0) {
            await tx.insert(messagesTable).values(messageValues);
          }
      }
    });
    revalidatePath('/'); // Revalidate home to update chat list
    revalidatePath(`/chat/${chat.id}`); // Revalidate specific chat page
  } catch (error) {
    console.error("Error saving chat:", error);
    // Potentially return an error object
  }
}

// ... removeChat, clearChats would similarly use db operations ...
// Example removeChat
export async function removeChat({ id, path }: { id: string; path: string }) {
    const userId = MOCK_USER_ID; // Get actual user ID
    try {
        await db.delete(conversationsTable)
          .where(eq(conversationsTable.id, id) && eq(conversationsTable.userId, userId));
        // Messages will be deleted by 'onDelete: cascade'
        revalidatePath('/');
        revalidatePath(path); // Or just '/'
    } catch (error) {
        console.error("Error removing chat:", error);
        return { error: "Unable to remove chat" };
    }
}
```

**Frontend `app/page.tsx` or `app/chat/[id]/page.tsx` (Loading initial messages):**
```typescript
// Example of how initialMessages might be set for useChat
// This logic is typically in the page component that wraps your <Chat /> component.
// const { id } = params; // From Next.js dynamic route if on /chat/[id]
// const cookieStore = cookies();
// const aiState = getAIState(); // From Vercel AI SDK RSC utilities
//
// if (id) {
//   const chat = await getChat(id, MOCK_USER_ID); // Your DB fetch action
//   if (chat) {
//     // Pass chat.messages as initialMessages to <Chat /> component or directly to useChat
//     // aiState.initialMessages = chat.messages; // If using RSC state
//   }
// }
// The Vercel AI Chatbot template handles this using RSC and `getAIState`/`getMutableAIState`.
// You need to ensure `getChat` is called and its messages populate the initial state.
```

**Frontend `components/chat.tsx` (Triggering save):**
The `useChat` hook from `ai/react` takes an `onFinish` or `onResponse` callback. You can also use `useEffect` to watch for message changes.
```typescript
// components/chat.tsx
// const { messages, id, setMessages } = useChat({
//   initialMessages: props.initialMessages, // Loaded from DB
//   id: props.id, // Loaded from DB or new
//   // ... other options
//   onFinish: async (message) => { // Or on every new message
//     // Construct the Chat object to save
//     const currentChat: Chat = {
//       id: id, // from useChat
//       messages: [...messages, message], // current messages + the new one
//       userId: MOCK_USER_ID, // Get actual user ID
//       // title, createdAt, etc., can be managed by saveChat or set here
//     };
//     await saveChat(currentChat);
//   }
// });

// OR using useEffect to save whenever messages change:
// useEffect(() => {
//   if (id && messages.length > 0) { // Check if chat is active and has messages
//     const currentChat: Chat = {
//       id,
//       messages,
//       userId: MOCK_USER_ID,
//       // title, createdAt, etc.
//     };
//     saveChat(currentChat);
//   }
// }, [messages, id]);
```

**Ready to Merge Checklist:**
*   [ ] Database schemas for `conversations` and `conversation_messages` created and migrated.
*   [ ] Server actions (`saveChat`, `getChats`, `getChat`, `removeChat`) are refactored to use the database.
*   [ ] `saveChat` correctly stores conversation messages, including `experimental_streamData` in a JSONB column.
*   [ ] `getChat` correctly retrieves messages and reconstructs `experimental_streamData`.
*   [ ] Frontend chat UI loads past conversations when selected from the sidebar.
*   [ ] New messages/conversations are saved to the database ("auto-save draft" via `onFinish` or `useEffect`).
*   [ ] Basic user scoping (even with a mock user ID) is considered in DB queries.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: Conversations are saved persistently, can be listed, and selected to resume.

**Quick Research (5-10 minutes):**
*   **Vercel AI Chatbot `app/actions.ts`:** Study how it currently handles chat persistence with `localStorage` or server actions.
*   **Drizzle ORM `upsert` (onConflictDoUpdate):** For `saveChat` to handle both new and existing conversations/messages efficiently.
*   **Drizzle ORM `jsonb` type:** How to query and store JSON data.
*   **Next.js Server Actions:** [https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
*   **Next.js `revalidatePath`:** For updating cached data after mutations.

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm building a chat application with Next.js and Drizzle ORM, using the `ai/react` package's `useChat` hook. Explain how to implement persistent chat storage. Show how to structure server actions for `saveChat` (including messages with custom JSON data like sources), `getChat` (retrieving a specific conversation with its messages), and `getChats` (listing a user's conversations). How should the frontend trigger these actions, especially for auto-saving?"*

**Questions for Senior Dev:**
*   [ ] The current "auto-save" (saving on message changes) might lead to many DB writes. Is this acceptable for now, or should we implement a more debounced/batched saving strategy? (For now, it's likely fine, can optimize later).
*   [ ] How should conversation titles be managed? Auto-generate, let user edit, or both? (PRD doesn't specify, auto-generation from first message is a good start).
*   [ ] The `userId` is currently mocked. What's the plan for integrating actual user authentication (e.g., NextAuth.js) and linking it to conversations? (This will be a separate, significant slice).

---

This slice adds a very important layer of usability and persistence to the application. Users can now have multiple conversations and pick up where they left off. The next steps could involve full user authentication, more advanced RAG features like reranking, or deeper integration of Landing AI ADE.