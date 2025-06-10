import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  sum,
  sql,
  type SQL,
} from 'drizzle-orm';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  type Chat,
  stream,
  ragDocument,
  documentContent,
  documentChunk,
  type RAGDocument,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '../utils';
import { generateHashedPassword } from '../auth/password-utils';
import type { VisibilityType } from '@/components/visibility-selector';
import { ChatSDKError } from '../errors';
import { db } from './index';

// Simple in-memory cache for frequently accessed data
const queryCache = new Map<
  string,
  { data: any; timestamp: number; ttl: number }
>();

function getCachedResult<T>(key: string): T | null {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data as T;
  }
  queryCache.delete(key);
  return null;
}

function setCachedResult<T>(key: string, data: T, ttlMs = 60000): void {
  queryCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

function invalidateCache(pattern: string): void {
  for (const key of queryCache.keys()) {
    if (key.includes(pattern)) {
      queryCache.delete(key);
    }
  }
}

export async function getUser(email: string): Promise<Array<User>> {
  const cacheKey = `user:email:${email}`;
  const cached = getCachedResult<Array<User>>(cacheKey);
  if (cached) return cached;

  try {
    const result = await db.select().from(user).where(eq(user.email, email));
    setCachedResult(cacheKey, result, 300000); // Cache for 5 minutes
    return result;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get user by email',
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    const result = await db
      .insert(user)
      .values({ email, password: hashedPassword });
    invalidateCache(`user:email:${email}`);
    return result;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create user');
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create guest user',
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chats by user id',
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  const cacheKey = `chat:id:${id}`;
  const cached = getCachedResult<Chat>(cacheKey);
  if (cached) return cached;

  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (selectedChat) {
      setCachedResult(cacheKey, selectedChat, 180000); // Cache for 3 minutes
    }
    return selectedChat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    const result = await db.insert(message).values(messages);
    // Invalidate message cache for affected chats
    for (const msg of messages) {
      invalidateCache(`messages:chat:${msg.chatId}`);
    }
    return result;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  const cacheKey = `messages:chat:${id}`;
  const cached = getCachedResult<Array<DBMessage>>(cacheKey);
  if (cached) return cached;

  try {
    const result = await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));

    setCachedResult(cacheKey, result, 120000); // Cache for 2 minutes
    return result;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to vote message');
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get votes by chat id',
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save document');
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get documents by id',
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document by id',
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete documents by id after timestamp',
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to save suggestions',
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get suggestions by document id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message count by user id',
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create stream id',
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get stream ids by chat id',
    );
  }
}

// RAG Document Management Queries

export async function getRagDocumentsByUserId({
  userId,
  limit = 50,
}: {
  userId: string;
  limit?: number;
}): Promise<
  Array<RAGDocument & { chunkCount?: number; hasContent?: boolean }>
> {
  const cacheKey = `rag_documents:user:${userId}:limit:${limit}`;
  const cached =
    getCachedResult<
      Array<RAGDocument & { chunkCount?: number; hasContent?: boolean }>
    >(cacheKey);
  if (cached) return cached;

  try {
    const documents = await db
      .select({
        id: ragDocument.id,
        fileName: ragDocument.fileName,
        originalName: ragDocument.originalName,
        filePath: ragDocument.filePath,
        mimeType: ragDocument.mimeType,
        fileSize: ragDocument.fileSize,
        status: ragDocument.status,
        uploadedBy: ragDocument.uploadedBy,
        createdAt: ragDocument.createdAt,
        updatedAt: ragDocument.updatedAt,
        chunkCount: count(documentChunk.id),
        hasContent: count(documentContent.id),
      })
      .from(ragDocument)
      .leftJoin(documentChunk, eq(ragDocument.id, documentChunk.documentId))
      .leftJoin(documentContent, eq(ragDocument.id, documentContent.documentId))
      .where(eq(ragDocument.uploadedBy, userId))
      .groupBy(ragDocument.id)
      .orderBy(desc(ragDocument.createdAt))
      .limit(limit);

    const result = documents.map((doc) => ({
      ...doc,
      chunkCount: Number(doc.chunkCount),
      hasContent: Number(doc.hasContent) > 0,
    }));

    setCachedResult(cacheKey, result, 60000); // Cache for 1 minute
    return result;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get RAG documents by user id',
    );
  }
}

export async function getRagDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<RAGDocument | null> {
  const cacheKey = `rag_document:${id}:${userId}`;
  const cached = getCachedResult<RAGDocument>(cacheKey);
  if (cached) return cached;

  try {
    const [selectedDocument] = await db
      .select()
      .from(ragDocument)
      .where(and(eq(ragDocument.id, id), eq(ragDocument.uploadedBy, userId)));

    if (selectedDocument) {
      setCachedResult(cacheKey, selectedDocument, 300000); // Cache for 5 minutes
    }
    return selectedDocument || null;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get RAG document by id',
    );
  }
}

export async function updateRagDocumentStatus({
  id,
  status,
  userId,
}: {
  id: string;
  status: RAGDocument['status'];
  userId: string;
}) {
  try {
    const result = await db
      .update(ragDocument)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(and(eq(ragDocument.id, id), eq(ragDocument.uploadedBy, userId)))
      .returning();

    // Invalidate cache for this document and user's document list
    invalidateCache(`rag_document:${id}:${userId}`);
    invalidateCache(`rag_documents:user:${userId}`);

    return result[0] || null;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update RAG document status',
    );
  }
}

export async function deleteRagDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // Delete in correct order due to foreign key constraints
    // Embeddings will cascade delete with chunks
    // Chunks will cascade delete with document
    // Content will cascade delete with document

    const [deletedDocument] = await db
      .delete(ragDocument)
      .where(and(eq(ragDocument.id, id), eq(ragDocument.uploadedBy, userId)))
      .returning();

    // Invalidate cache
    invalidateCache(`rag_document:${id}:${userId}`);
    invalidateCache(`rag_documents:user:${userId}`);

    return deletedDocument;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete RAG document by id',
    );
  }
}

export async function getDocumentProcessingStats({
  userId,
}: {
  userId: string;
}) {
  const cacheKey = `document_stats:user:${userId}`;
  const cached = getCachedResult<any>(cacheKey);
  if (cached) return cached;

  try {
    const [stats] = await db
      .select({
        total: count(),
        uploaded: sum(
          sql`CASE WHEN ${ragDocument.status} = 'uploaded' THEN 1 ELSE 0 END`,
        ),
        processing: sum(
          sql`CASE WHEN ${ragDocument.status} = 'processing' THEN 1 ELSE 0 END`,
        ),
        textExtracted: sum(
          sql`CASE WHEN ${ragDocument.status} = 'text_extracted' THEN 1 ELSE 0 END`,
        ),
        chunked: sum(
          sql`CASE WHEN ${ragDocument.status} = 'chunked' THEN 1 ELSE 0 END`,
        ),
        embedded: sum(
          sql`CASE WHEN ${ragDocument.status} = 'embedded' THEN 1 ELSE 0 END`,
        ),
        processed: sum(
          sql`CASE WHEN ${ragDocument.status} = 'processed' THEN 1 ELSE 0 END`,
        ),
        error: sum(
          sql`CASE WHEN ${ragDocument.status} = 'error' THEN 1 ELSE 0 END`,
        ),
      })
      .from(ragDocument)
      .where(eq(ragDocument.uploadedBy, userId));

    setCachedResult(cacheKey, stats, 30000); // Cache for 30 seconds
    return stats;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document processing stats',
    );
  }
}
