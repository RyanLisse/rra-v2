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
  documentEmbedding,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '../utils';
import { generateHashedPassword } from '../auth/password-utils';
import type { VisibilityType } from '@/components/visibility-selector';
import { ChatSDKError } from '../errors';
import { db } from './index';
import {
  withTransaction,
  withDeadlockRetry,
  logTransaction,
  withReadOnlyTransaction,
} from './transactions';
import {
  getCachedResult,
  setCachedResult,
  invalidateCache,
} from '../cache/redis-query-cache';
import { CacheKeys, CacheTTL } from '../cache/redis-client';

export async function getUser(email: string): Promise<Array<User>> {
  const cacheKey = CacheKeys.query.user.byEmail(email);
  const cached = getCachedResult<Array<User>>(cacheKey);
  if (cached) return cached;

  try {
    const result = await db.select().from(user).where(eq(user.email, email));
    setCachedResult(cacheKey, result, CacheTTL.query.user * 1000);
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
    invalidateCache(CacheKeys.query.user.byEmail(email));
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
  return withTransaction(async (tx) => {
    logTransaction('saveChat', { id, userId });

    const result = await tx.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });

    // Invalidate cache for user's chats
    invalidateCache(CacheKeys.query.chat.pattern);

    return result;
  });
}

export async function deleteChatById({ id }: { id: string }) {
  return withDeadlockRetry(async (tx) => {
    logTransaction('deleteChatById', { id });

    // Delete in correct order to avoid foreign key violations
    // Using transaction ensures all-or-nothing deletion

    // 1. Delete votes (references messages)
    await tx.delete(vote).where(eq(vote.chatId, id));

    // 2. Delete messages
    await tx.delete(message).where(eq(message.chatId, id));

    // 3. Delete streams
    await tx.delete(stream).where(eq(stream.chatId, id));

    // 4. Finally delete the chat itself
    const [deletedChat] = await tx
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();

    // Invalidate all related caches
    invalidateCache(CacheKeys.query.chat.byId(id));
    invalidateCache(CacheKeys.query.messages.byChatId(id));
    invalidateCache(CacheKeys.query.chat.pattern);

    return deletedChat;
  });
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
  const cacheKey = CacheKeys.query.chat.byId(id);
  const cached = getCachedResult<Chat>(cacheKey);
  if (cached) return cached;

  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (selectedChat) {
      setCachedResult(cacheKey, selectedChat, CacheTTL.query.chat * 1000);
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
  return withTransaction(async (tx) => {
    logTransaction('saveMessages', { count: messages.length });

    // Insert all messages in a single transaction
    const result = await tx.insert(message).values(messages);

    // Invalidate message cache for affected chats
    const uniqueChatIds = [...new Set(messages.map((msg) => msg.chatId))];
    for (const chatId of uniqueChatIds) {
      invalidateCache(CacheKeys.query.messages.byChatId(chatId));
    }

    return result;
  });
}

export async function getMessagesByChatId({ id }: { id: string }) {
  const cacheKey = CacheKeys.query.messages.byChatId(id);
  const cached = getCachedResult<Array<DBMessage>>(cacheKey);
  if (cached) return cached;

  try {
    const result = await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));

    setCachedResult(cacheKey, result, CacheTTL.query.messages * 1000);
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
  return withTransaction(async (tx) => {
    logTransaction('voteMessage', { chatId, messageId, type });

    // Check for existing vote
    const [existingVote] = await tx
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)))
      .limit(1);

    if (existingVote) {
      // Update existing vote
      return await tx
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }

    // Create new vote
    return await tx.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  });
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
  return withTransaction(async (tx) => {
    logTransaction('deleteDocumentsByIdAfterTimestamp', { id, timestamp });

    // Delete in correct order due to foreign key constraints
    // 1. Delete suggestions that reference the documents
    await tx
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    // 2. Delete the documents themselves
    const deletedDocuments = await tx
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();

    return deletedDocuments;
  });
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  return withTransaction(async (tx) => {
    logTransaction('saveSuggestions', { count: suggestions.length });

    // Verify all referenced documents exist
    const documentIds = [...new Set(suggestions.map((s) => s.documentId))];
    const existingDocs = await tx
      .select({ id: document.id, createdAt: document.createdAt })
      .from(document)
      .where(inArray(document.id, documentIds));

    if (existingDocs.length !== documentIds.length) {
      throw new ChatSDKError(
        'not_found:database',
        'One or more referenced documents not found',
      );
    }

    return await tx.insert(suggestion).values(suggestions);
  });
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
  return withTransaction(async (tx) => {
    logTransaction('deleteMessagesByChatIdAfterTimestamp', {
      chatId,
      timestamp,
    });

    // First, get the messages to delete
    const messagesToDelete = await tx
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((msg) => msg.id);

    if (messageIds.length > 0) {
      // Delete in correct order
      // 1. Delete votes that reference these messages
      await tx
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      // 2. Delete the messages themselves
      const result = await tx
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );

      // Invalidate cache
      invalidateCache(CacheKeys.query.messages.byChatId(chatId));

      return result;
    }

    return null;
  });
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
  return withTransaction(async (tx) => {
    logTransaction('createStreamId', { streamId, chatId });

    // Verify chat exists before creating stream
    const [chatExists] = await tx
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.id, chatId))
      .limit(1);

    if (!chatExists) {
      throw new ChatSDKError(
        'not_found:database',
        `Chat with id ${chatId} not found`,
      );
    }

    await tx
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  });
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
  const cacheKey = CacheKeys.query.ragDocuments.byUserId(userId, limit);
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

    setCachedResult(cacheKey, result, CacheTTL.query.ragDocuments * 1000);
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
  const cacheKey = CacheKeys.query.ragDocuments.byId(id, userId);
  const cached = getCachedResult<RAGDocument>(cacheKey);
  if (cached) return cached;

  try {
    const [selectedDocument] = await db
      .select()
      .from(ragDocument)
      .where(and(eq(ragDocument.id, id), eq(ragDocument.uploadedBy, userId)));

    if (selectedDocument) {
      setCachedResult(cacheKey, selectedDocument, CacheTTL.query.user * 1000); // Use user TTL for document details
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
  return withTransaction(async (tx) => {
    logTransaction('updateRagDocumentStatus', { id, status, userId });

    const [updatedDocument] = await tx
      .update(ragDocument)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(and(eq(ragDocument.id, id), eq(ragDocument.uploadedBy, userId)))
      .returning();

    if (!updatedDocument) {
      throw new ChatSDKError(
        'not_found:database',
        'RAG document not found or access denied',
      );
    }

    // Invalidate cache for this document and user's document list
    invalidateCache(CacheKeys.query.ragDocuments.byId(id, userId));
    invalidateCache(CacheKeys.query.ragDocuments.pattern);

    return updatedDocument;
  });
}

export async function deleteRagDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  return withTransaction(async (tx) => {
    logTransaction('deleteRagDocumentById', { id, userId });

    // Verify ownership before deletion
    const [existingDoc] = await tx
      .select({ id: ragDocument.id })
      .from(ragDocument)
      .where(and(eq(ragDocument.id, id), eq(ragDocument.uploadedBy, userId)))
      .limit(1);

    if (!existingDoc) {
      throw new ChatSDKError(
        'not_found:database',
        'RAG document not found or access denied',
      );
    }

    // Delete the document - cascades will handle related tables
    // Due to ON DELETE CASCADE:
    // - documentContent will be deleted
    // - documentChunk will be deleted
    // - documentEmbedding will be deleted (via chunk and image references)
    // - documentImage will be deleted
    const [deletedDocument] = await tx
      .delete(ragDocument)
      .where(eq(ragDocument.id, id))
      .returning();

    // Invalidate cache
    invalidateCache(CacheKeys.query.ragDocuments.byId(id, userId));
    invalidateCache(CacheKeys.query.ragDocuments.pattern);

    return deletedDocument;
  });
}

export async function getDocumentProcessingStats({
  userId,
}: {
  userId: string;
}) {
  const cacheKey = CacheKeys.query.ragDocuments.stats(userId);
  const cached = getCachedResult<any>(cacheKey);
  if (cached) return cached;

  return withReadOnlyTransaction(async (tx) => {
    const [stats] = await tx
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

    setCachedResult(cacheKey, stats, CacheTTL.query.documentStats * 1000);
    return stats;
  });
}

// Additional transactional operations for complex workflows

/**
 * Create a complete RAG document with content and initial processing
 */
export async function createRagDocumentWithContent({
  document,
  content,
}: {
  document: Omit<RAGDocument, 'id' | 'createdAt' | 'updatedAt'>;
  content: {
    extractedText: string;
    pageCount: string;
    charCount: string;
    metadata?: any;
  };
}) {
  return withTransaction(async (tx) => {
    logTransaction('createRagDocumentWithContent', {
      fileName: document.fileName,
    });

    // 1. Create the document
    const [createdDoc] = await tx
      .insert(ragDocument)
      .values({
        ...document,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // 2. Create the content
    await tx.insert(documentContent).values({
      documentId: createdDoc.id,
      extractedText: content.extractedText,
      pageCount: content.pageCount,
      charCount: content.charCount,
      metadata: content.metadata,
      createdAt: new Date(),
    });

    // 3. Update status to text_extracted
    await tx
      .update(ragDocument)
      .set({
        status: 'text_extracted',
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, createdDoc.id));

    // Invalidate caches
    invalidateCache(CacheKeys.query.ragDocuments.pattern);

    return createdDoc;
  });
}

/**
 * Batch create document chunks with embeddings
 */
export async function createDocumentChunksWithEmbeddings({
  documentId,
  chunks,
}: {
  documentId: string;
  chunks: Array<{
    content: string;
    metadata?: any;
    tokenCount?: string;
    embedding: string;
    elementType?: string;
    pageNumber?: number;
    bbox?: any;
    confidence?: string;
    adeElementId?: string;
  }>;
}) {
  return withTransaction(async (tx) => {
    logTransaction('createDocumentChunksWithEmbeddings', {
      documentId,
      chunkCount: chunks.length,
    });

    // 1. Create all chunks
    const createdChunks = await tx
      .insert(documentChunk)
      .values(
        chunks.map((chunk, index) => ({
          documentId,
          chunkIndex: index.toString(),
          content: chunk.content,
          metadata: chunk.metadata,
          tokenCount: chunk.tokenCount,
          elementType: chunk.elementType,
          pageNumber: chunk.pageNumber,
          bbox: chunk.bbox,
          confidence: chunk.confidence,
          adeElementId: chunk.adeElementId,
          createdAt: new Date(),
        })),
      )
      .returning();

    // 2. Create embeddings for all chunks
    await tx.insert(documentEmbedding).values(
      createdChunks.map((chunk, index) => ({
        chunkId: chunk.id,
        documentId,
        embedding: chunks[index].embedding,
        embeddingType: 'text',
        dimensions: 1024, // Cohere embed-v4.0 dimensions
        model: 'cohere-embed-v4.0',
        createdAt: new Date(),
      })),
    );

    // 3. Update document status
    await tx
      .update(ragDocument)
      .set({
        status: 'embedded',
        updatedAt: new Date(),
      })
      .where(eq(ragDocument.id, documentId));

    return createdChunks;
  });
}

/**
 * Delete user and all related data (GDPR compliance)
 */
export async function deleteUserAndAllData({ userId }: { userId: string }) {
  return withTransaction(async (tx) => {
    logTransaction('deleteUserAndAllData', { userId });

    // Note: Many deletions will cascade due to foreign key constraints
    // But we'll be explicit for clarity and control

    // 1. Delete votes (through chats)
    await tx
      .delete(vote)
      .where(
        inArray(
          vote.chatId,
          tx.select({ id: chat.id }).from(chat).where(eq(chat.userId, userId)),
        ),
      );

    // 2. Delete messages (through chats)
    await tx
      .delete(message)
      .where(
        inArray(
          message.chatId,
          tx.select({ id: chat.id }).from(chat).where(eq(chat.userId, userId)),
        ),
      );

    // 3. Delete streams (through chats)
    await tx
      .delete(stream)
      .where(
        inArray(
          stream.chatId,
          tx.select({ id: chat.id }).from(chat).where(eq(chat.userId, userId)),
        ),
      );

    // 4. Delete chats
    await tx.delete(chat).where(eq(chat.userId, userId));

    // 5. Delete suggestions
    await tx.delete(suggestion).where(eq(suggestion.userId, userId));

    // 6. Delete documents
    await tx.delete(document).where(eq(document.userId, userId));

    // 7. Delete RAG documents (cascades will handle related tables)
    await tx.delete(ragDocument).where(eq(ragDocument.uploadedBy, userId));

    // 8. Finally delete the user
    const [deletedUser] = await tx
      .delete(user)
      .where(eq(user.id, userId))
      .returning();

    // Clear all caches for this user
    invalidateCache(CacheKeys.query.user.pattern);
    invalidateCache(CacheKeys.query.chat.pattern);
    invalidateCache(CacheKeys.query.ragDocuments.pattern);

    return deletedUser;
  });
}
