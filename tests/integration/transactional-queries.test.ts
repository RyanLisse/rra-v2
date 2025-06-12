import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  deleteChatById, 
  createRagDocumentWithContent,
  createDocumentChunksWithEmbeddings,
  deleteUserAndAllData,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { db } from '@/lib/db';
import { 
  user, 
  chat, 
  message, 
  vote, 
  stream,
  ragDocument,
  documentContent,
  documentChunk,
  documentEmbedding,
} from '@/lib/db/schema';
import { eq, } from 'drizzle-orm';
import { generateUUID } from '@/lib/utils';

describe('Transactional Database Queries', () => {
  let testUserId: string;
  let testChatId: string;
  let testDocumentId: string;

  beforeEach(async () => {
    // Create test user
    const [testUser] = await db
      .insert(user)
      .values({
        email: `test-${Date.now()}@example.com`,
        password: 'hashed_password',
      })
      .returning();
    testUserId = testUser.id;
  });

  afterEach(async () => {
    // Cleanup test data
    if (testUserId) {
      await db.delete(user).where(eq(user.id, testUserId));
    }
  });

  describe('deleteChatById', () => {
    beforeEach(async () => {
      // Create test chat with related data
      testChatId = generateUUID();
      await saveChat({
        id: testChatId,
        userId: testUserId,
        title: 'Test Chat',
        visibility: 'private',
      });

      // Add messages
      await saveMessages({
        messages: [
          {
            id: generateUUID(),
            chatId: testChatId,
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }],
            attachments: [],
            createdAt: new Date(),
          },
          {
            id: generateUUID(),
            chatId: testChatId,
            role: 'assistant',
            parts: [{ type: 'text', text: 'Hi there!' }],
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });

      // Add vote
      const [msg] = await db
        .select()
        .from(message)
        .where(eq(message.chatId, testChatId))
        .limit(1);
      
      if (msg) {
        await db.insert(vote).values({
          chatId: testChatId,
          messageId: msg.id,
          isUpvoted: true,
        });
      }

      // Add stream
      await db.insert(stream).values({
        id: generateUUID(),
        chatId: testChatId,
        createdAt: new Date(),
      });
    });

    it('should delete chat and all related data in transaction', async () => {
      // Verify data exists before deletion
      const [chatBefore] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, testChatId));
      expect(chatBefore).toBeDefined();

      const messagesBefore = await db
        .select()
        .from(message)
        .where(eq(message.chatId, testChatId));
      expect(messagesBefore.length).toBeGreaterThan(0);

      // Delete chat
      const deletedChat = await deleteChatById({ id: testChatId });
      expect(deletedChat).toBeDefined();
      expect(deletedChat.id).toBe(testChatId);

      // Verify all related data is deleted
      const [chatAfter] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, testChatId));
      expect(chatAfter).toBeUndefined();

      const messagesAfter = await db
        .select()
        .from(message)
        .where(eq(message.chatId, testChatId));
      expect(messagesAfter).toHaveLength(0);

      const votesAfter = await db
        .select()
        .from(vote)
        .where(eq(vote.chatId, testChatId));
      expect(votesAfter).toHaveLength(0);

      const streamsAfter = await db
        .select()
        .from(stream)
        .where(eq(stream.chatId, testChatId));
      expect(streamsAfter).toHaveLength(0);
    });

    it('should handle deletion of non-existent chat gracefully', async () => {
      const nonExistentId = generateUUID();
      const result = await deleteChatById({ id: nonExistentId });
      expect(result).toBeUndefined();
    });
  });

  describe('createRagDocumentWithContent', () => {
    it('should create document and content in transaction', async () => {
      const docData = {
        fileName: 'test-doc.pdf',
        originalName: 'Test Document.pdf',
        filePath: '/uploads/test-doc.pdf',
        mimeType: 'application/pdf',
        fileSize: '1024',
        status: 'uploaded' as const,
        uploadedBy: testUserId,
      };

      const contentData = {
        extractedText: 'This is test content',
        pageCount: '5',
        charCount: '1000',
        metadata: { language: 'en' },
      };

      const createdDoc = await createRagDocumentWithContent({
        document: docData,
        content: contentData,
      });

      expect(createdDoc).toBeDefined();
      expect(createdDoc.fileName).toBe(docData.fileName);
      expect(createdDoc.status).toBe('uploaded'); // Initial status

      // Verify content was created
      const [content] = await db
        .select()
        .from(documentContent)
        .where(eq(documentContent.documentId, createdDoc.id));
      
      expect(content).toBeDefined();
      expect(content.extractedText).toBe(contentData.extractedText);

      // Verify status was updated
      const [updatedDoc] = await db
        .select()
        .from(ragDocument)
        .where(eq(ragDocument.id, createdDoc.id));
      
      expect(updatedDoc.status).toBe('text_extracted');

      // Cleanup
      testDocumentId = createdDoc.id;
      await db.delete(ragDocument).where(eq(ragDocument.id, testDocumentId));
    });
  });

  describe('createDocumentChunksWithEmbeddings', () => {
    beforeEach(async () => {
      // Create test document
      const [doc] = await db
        .insert(ragDocument)
        .values({
          fileName: 'test-chunks.pdf',
          originalName: 'Test Chunks.pdf',
          filePath: '/uploads/test-chunks.pdf',
          mimeType: 'application/pdf',
          fileSize: '2048',
          status: 'text_extracted',
          uploadedBy: testUserId,
        })
        .returning();
      testDocumentId = doc.id;
    });

    it('should create chunks and embeddings in transaction', async () => {
      const chunks = [
        {
          content: 'First chunk content',
          embedding: JSON.stringify(Array(1024).fill(0.1)),
          tokenCount: '10',
          elementType: 'paragraph',
          pageNumber: 1,
        },
        {
          content: 'Second chunk content',
          embedding: JSON.stringify(Array(1024).fill(0.2)),
          tokenCount: '12',
          elementType: 'title',
          pageNumber: 1,
        },
      ];

      const createdChunks = await createDocumentChunksWithEmbeddings({
        documentId: testDocumentId,
        chunks,
      });

      expect(createdChunks).toHaveLength(2);

      // Verify chunks were created
      const dbChunks = await db
        .select()
        .from(documentChunk)
        .where(eq(documentChunk.documentId, testDocumentId));
      
      expect(dbChunks).toHaveLength(2);
      expect(dbChunks[0].content).toBe(chunks[0].content);
      expect(dbChunks[1].content).toBe(chunks[1].content);

      // Verify embeddings were created
      const embeddings = await db
        .select()
        .from(documentEmbedding)
        .where(eq(documentEmbedding.documentId, testDocumentId));
      
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0].embeddingType).toBe('text');
      expect(embeddings[0].model).toBe('cohere-embed-v4.0');

      // Verify document status was updated
      const [updatedDoc] = await db
        .select()
        .from(ragDocument)
        .where(eq(ragDocument.id, testDocumentId));
      
      expect(updatedDoc.status).toBe('embedded');
    });

    afterEach(async () => {
      if (testDocumentId) {
        await db.delete(ragDocument).where(eq(ragDocument.id, testDocumentId));
      }
    });
  });

  describe('deleteUserAndAllData', () => {
    it('should delete user and all related data in transaction', async () => {
      // Create comprehensive test data
      const testChatId2 = generateUUID();
      await saveChat({
        id: testChatId2,
        userId: testUserId,
        title: 'User deletion test chat',
        visibility: 'public',
      });

      // Create RAG document
      const [ragDoc] = await db
        .insert(ragDocument)
        .values({
          fileName: 'user-doc.pdf',
          originalName: 'User Document.pdf',
          filePath: '/uploads/user-doc.pdf',
          mimeType: 'application/pdf',
          fileSize: '3072',
          status: 'processed',
          uploadedBy: testUserId,
        })
        .returning();

      // Delete user and all data
      const deletedUser = await deleteUserAndAllData({ userId: testUserId });
      expect(deletedUser).toBeDefined();
      expect(deletedUser.id).toBe(testUserId);

      // Verify user is deleted
      const [userAfter] = await db
        .select()
        .from(user)
        .where(eq(user.id, testUserId));
      expect(userAfter).toBeUndefined();

      // Verify chats are deleted
      const chatsAfter = await db
        .select()
        .from(chat)
        .where(eq(chat.userId, testUserId));
      expect(chatsAfter).toHaveLength(0);

      // Verify RAG documents are deleted
      const ragDocsAfter = await db
        .select()
        .from(ragDocument)
        .where(eq(ragDocument.uploadedBy, testUserId));
      expect(ragDocsAfter).toHaveLength(0);

      // Clear testUserId to prevent afterEach cleanup
      testUserId = '';
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback all changes on error', async () => {
      const invalidChatId = generateUUID();
      
      // Try to save messages for non-existent chat
      // This should fail due to foreign key constraint
      await expect(
        saveMessages({
          messages: [{
            id: generateUUID(),
            chatId: invalidChatId, // Non-existent chat
            role: 'user',
            parts: [{ type: 'text', text: 'This should fail' }],
            attachments: [],
            createdAt: new Date(),
          }],
        }),
      ).rejects.toThrow();

      // Verify no partial data was saved
      const messages = await db
        .select()
        .from(message)
        .where(eq(message.chatId, invalidChatId));
      expect(messages).toHaveLength(0);
    });
  });
});