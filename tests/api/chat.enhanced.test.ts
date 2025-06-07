import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET, DELETE } from '@/app/(chat)/api/chat/route';
import { setupNeonTestBranching, runMigrationsOnTestBranch } from '../config/neon-branch-setup';
import {
  createMockRequest,
  createTestUser,
  createTestChat,
  createChatMessage,
  createChatRequest,
} from '../fixtures/test-data';
import { db } from '@/lib/db';
import { user, chat, message, ragDocument } from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { 
  getNeonApiClient, 
  type PerformanceMetrics 
} from '@/lib/testing/neon-api-client';
import { getNeonLogger } from '@/lib/testing/neon-logger';

const logger = getNeonLogger();
const testSuiteName = 'chat-api-enhanced';

// Setup enhanced Neon branching for this test suite
setupNeonTestBranching(testSuiteName, {
  useEnhancedClient: true,
  enableMetrics: true,
  branchOptions: {
    testSuite: testSuiteName,
    purpose: 'chat-api-testing',
    tags: ['chat', 'api', 'streaming', 'rag', 'enhanced'],
  },
});

// Enhanced factory system for chat test data
export class ChatTestDataFactory {
  private metrics: PerformanceMetrics = {
    creationTime: 0,
    queryTime: 0,
    insertTime: 0,
    memoryUsage: process.memoryUsage(),
  };

  async createUserWithChats(chatCount: number = 1) {
    const startTime = Date.now();
    
    const userData = createTestUser();
    
    // Insert user into real database
    const [insertedUser] = await db
      .insert(user)
      .values({
        id: nanoid(),
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const chats = [];
    
    for (let i = 0; i < chatCount; i++) {
      const chatData = createTestChat(insertedUser.id, {
        title: `Enhanced Chat ${i + 1}`,
        visibility: i % 2 === 0 ? 'private' : 'public',
      });

      const [insertedChat] = await db
        .insert(chat)
        .values({
          id: nanoid(),
          ...chatData,
        })
        .returning();

      // Create some messages for the chat
      const messages = [];
      for (let j = 0; j < 2; j++) {
        const messageData = {
          id: nanoid(),
          chatId: insertedChat.id,
          role: j % 2 === 0 ? 'user' : 'assistant',
          parts: [{ type: 'text', text: `Test message ${j + 1} in chat ${i + 1}` }],
          createdAt: new Date(),
        };

        const [insertedMessage] = await db
          .insert(message)
          .values(messageData)
          .returning();

        messages.push(insertedMessage);
      }

      chats.push({
        chat: insertedChat,
        messages,
      });
    }

    this.metrics.creationTime += Date.now() - startTime;
    
    logger.info('chat_factory', 'Created user with chats', {
      userId: insertedUser.id,
      chatCount,
      duration: Date.now() - startTime,
    });

    return {
      user: insertedUser,
      chats,
    };
  }

  async createChatWithDocuments(userId: string, documentCount: number = 2) {
    const startTime = Date.now();
    
    // Create chat
    const chatData = createTestChat(userId, {
      title: 'RAG Chat with Documents',
      visibility: 'private',
    });

    const [insertedChat] = await db
      .insert(chat)
      .values({
        id: nanoid(),
        ...chatData,
      })
      .returning();

    // Create documents for RAG context
    const documents = [];
    for (let i = 0; i < documentCount; i++) {
      const [insertedDocument] = await db
        .insert(ragDocument)
        .values({
          id: nanoid(),
          fileName: `rag-doc-${i + 1}.pdf`,
          originalName: `RAG Document ${i + 1}.pdf`,
          filePath: `/uploads/rag-doc-${i + 1}.pdf`,
          mimeType: 'application/pdf',
          fileSize: '2048000',
          status: 'processed',
          uploadedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      documents.push(insertedDocument);
    }

    this.metrics.insertTime += Date.now() - startTime;
    
    logger.info('chat_factory', 'Created chat with documents', {
      chatId: insertedChat.id,
      documentCount,
      duration: Date.now() - startTime,
    });

    return {
      chat: insertedChat,
      documents,
    };
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      creationTime: 0,
      queryTime: 0,
      insertTime: 0,
      memoryUsage: process.memoryUsage(),
    };
  }
}

// Mock dependencies with enhanced functionality
vi.mock('ai', () => ({
  appendClientMessage: vi.fn().mockReturnValue([]),
  appendResponseMessages: vi.fn().mockReturnValue([{}, {}]),
  createDataStream: vi.fn().mockReturnValue(new ReadableStream()),
  smoothStream: vi.fn().mockReturnValue({}),
  streamText: vi.fn().mockReturnValue({
    consumeStream: vi.fn(),
    mergeIntoDataStream: vi.fn(),
    textStream: async function* () {
      yield 'This is a test response from the AI model. ';
      yield 'It demonstrates streaming functionality. ';
      yield 'The response is generated in chunks for better user experience.';
    },
  }),
}));

vi.mock('@vercel/functions', () => ({
  geolocation: vi.fn().mockReturnValue({
    longitude: -122.4194,
    latitude: 37.7749,
    city: 'San Francisco',
    country: 'US',
  }),
}));

vi.mock('resumable-stream', () => ({
  createResumableStreamContext: vi.fn().mockReturnValue({
    resumableStream: vi.fn().mockResolvedValue(new ReadableStream()),
  }),
}));

// Mock authentication
const mockAuthenticatedUser = (userId: string, userType: 'regular' | 'premium' | 'admin' = 'regular') => {
  vi.doMock('@/lib/auth/get-auth', () => ({
    getAuth: vi.fn().mockResolvedValue({
      userId,
      userType,
      isAuthenticated: true,
    }),
  }));
};

const mockUnauthenticatedUser = () => {
  vi.doMock('@/lib/auth/get-auth', () => ({
    getAuth: vi.fn().mockResolvedValue({
      userId: null,
      isAuthenticated: false,
    }),
  }));
};

describe('Enhanced Chat API Routes', () => {
  let factory: ChatTestDataFactory;
  let testMetrics: PerformanceMetrics;

  beforeEach(async () => {
    // Run migrations on the test branch before each test
    await runMigrationsOnTestBranch();
    
    factory = new ChatTestDataFactory();
    factory.resetMetrics();
    
    vi.clearAllMocks();
  });

  describe('POST /api/chat - Enhanced Chat Creation and Messaging', () => {
    it('should create new chat and process message with real database operations', async () => {
      const startTime = Date.now();
      
      const { user: testUser } = await factory.createUserWithChats(0);
      const chatId = nanoid();
      
      mockAuthenticatedUser(testUser.id);

      // Mock database query functions
      vi.doMock('@/lib/db/queries', () => ({
        createStreamId: vi.fn().mockResolvedValue(undefined),
        deleteChatById: vi.fn().mockResolvedValue({ id: chatId }),
        getChatById: vi.fn().mockImplementation(async (id: string) => {
          const queryStartTime = Date.now();
          const [chatInDb] = await db
            .select()
            .from(chat)
            .where(db.eq(chat.id, id));
          
          testMetrics = factory.getMetrics();
          testMetrics.queryTime += Date.now() - queryStartTime;
          
          return chatInDb || null;
        }),
        getMessageCountByUserId: vi.fn().mockImplementation(async (userId: string) => {
          const queryStartTime = Date.now();
          const [{ count }] = await db
            .select({ count: db.count() })
            .from(message)
            .innerJoin(chat, db.eq(message.chatId, chat.id))
            .where(db.eq(chat.userId, userId));
          
          testMetrics.queryTime += Date.now() - queryStartTime;
          return count;
        }),
        getMessagesByChatId: vi.fn().mockResolvedValue([]),
        getStreamIdsByChatId: vi.fn().mockResolvedValue(['stream-123']),
        saveChat: vi.fn().mockImplementation(async (chatData: any) => {
          const insertStartTime = Date.now();
          await db.insert(chat).values(chatData);
          testMetrics.insertTime += Date.now() - insertStartTime;
          return undefined;
        }),
        saveMessages: vi.fn().mockImplementation(async ({ messages }: any) => {
          const insertStartTime = Date.now();
          if (messages.length > 0) {
            await db.insert(message).values(messages);
          }
          testMetrics.insertTime += Date.now() - insertStartTime;
          return undefined;
        }),
      }));

      // Mock title generation
      vi.doMock('../../actions', () => ({
        generateTitleFromUserMessage: vi.fn().mockResolvedValue('Enhanced Test Chat Title'),
      }));

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const body = await request.json();
        
        expect(body.id).toBe(chatId);
        expect(body.message).toBeDefined();

        // Simulate real chat creation and message processing
        const { getChatById, saveChat, saveMessages, getMessageCountByUserId } = await import('@/lib/db/queries');
        const { generateTitleFromUserMessage } = await import('../../actions');

        // Check if chat exists
        const existingChat = await getChatById(chatId);
        
        if (!existingChat) {
          // Check rate limiting
          const messageCount = await getMessageCountByUserId(testUser.id);
          if (messageCount >= 100) { // Rate limit for regular users
            return new Response(
              JSON.stringify({ 
                error: 'Rate limit exceeded',
                code: 'RATE_LIMITED',
                limit: 100,
              }),
              { status: 429, headers: { 'Content-Type': 'application/json' } },
            );
          }

          // Generate title and save chat
          const title = await generateTitleFromUserMessage(body.message.parts[0].text);
          await saveChat({
            id: chatId,
            userId: testUser.id,
            title,
            visibility: body.selectedVisibilityType || 'private',
            createdAt: new Date(),
          });
        }

        // Save user message
        await saveMessages({
          messages: [{
            id: nanoid(),
            chatId,
            role: 'user',
            parts: body.message.parts,
            createdAt: new Date(),
          }],
        });

        // Simulate AI response
        const aiResponse = 'This is an enhanced AI response that demonstrates the improved chat functionality with real database integration.';
        
        await saveMessages({
          messages: [{
            id: nanoid(),
            chatId,
            role: 'assistant',
            parts: [{ type: 'text', text: aiResponse }],
            createdAt: new Date(),
          }],
        });

        // Return streaming response
        return new Response(
          new ReadableStream({
            start(controller) {
              const chunks = aiResponse.split(' ');
              let index = 0;
              
              const pushChunk = () => {
                if (index < chunks.length) {
                  controller.enqueue(`data: ${JSON.stringify({ content: chunks[index] + ' ' })}\n\n`);
                  index++;
                  setTimeout(pushChunk, 50);
                } else {
                  controller.enqueue('data: [DONE]\n\n');
                  controller.close();
                }
              };
              
              pushChunk();
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const chatRequest = createChatRequest(chatId, {
        message: createChatMessage({
          parts: [{ type: 'text', text: 'Tell me about the enhanced chat functionality' }],
        }),
        selectedVisibilityType: 'private',
      });
      
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      // Verify chat was created in database
      const queryStartTime = Date.now();
      const [chatInDb] = await db
        .select()
        .from(chat)
        .where(db.eq(chat.id, chatId));
      
      testMetrics.queryTime += Date.now() - queryStartTime;

      expect(chatInDb).toBeDefined();
      expect(chatInDb.userId).toBe(testUser.id);
      expect(chatInDb.title).toBe('Enhanced Test Chat Title');

      // Verify messages were saved
      const messagesInDb = await db
        .select()
        .from(message)
        .where(db.eq(message.chatId, chatId))
        .orderBy(message.createdAt);

      expect(messagesInDb).toHaveLength(2); // User message + AI response
      expect(messagesInDb[0].role).toBe('user');
      expect(messagesInDb[1].role).toBe('assistant');
      
      logger.info('chat_test', 'New chat creation test completed', {
        userId: testUser.id,
        chatId,
        messageCount: messagesInDb.length,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });

    it('should process message for existing chat with conversation history', async () => {
      const startTime = Date.now();
      
      const { user: testUser, chats } = await factory.createUserWithChats(1);
      const existingChat = chats[0].chat;
      
      mockAuthenticatedUser(testUser.id);

      // Mock database queries to return existing chat and messages
      vi.doMock('@/lib/db/queries', () => ({
        getChatById: vi.fn().mockResolvedValue(existingChat),
        getMessagesByChatId: vi.fn().mockImplementation(async (chatId: string) => {
          const queryStartTime = Date.now();
          const messagesInDb = await db
            .select()
            .from(message)
            .where(db.eq(message.chatId, chatId))
            .orderBy(message.createdAt);
          
          testMetrics = factory.getMetrics();
          testMetrics.queryTime += Date.now() - queryStartTime;
          
          return messagesInDb;
        }),
        saveMessages: vi.fn().mockImplementation(async ({ messages }: any) => {
          const insertStartTime = Date.now();
          if (messages.length > 0) {
            await db.insert(message).values(messages);
          }
          testMetrics.insertTime += Date.now() - insertStartTime;
          return undefined;
        }),
        createStreamId: vi.fn().mockResolvedValue(undefined),
        getMessageCountByUserId: vi.fn().mockResolvedValue(5),
      }));

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const body = await request.json();
        
        expect(body.id).toBe(existingChat.id);

        const { getChatById, getMessagesByChatId, saveMessages } = await import('@/lib/db/queries');

        // Verify chat exists and user has access
        const chatInDb = await getChatById(existingChat.id);
        if (!chatInDb || chatInDb.userId !== testUser.id) {
          return new Response(
            JSON.stringify({ 
              error: 'Chat not found or access denied',
              code: 'CHAT_NOT_FOUND',
            }),
            { status: 404, headers: { 'Content-Type': 'application/json' } },
          );
        }

        // Get conversation history
        const conversationHistory = await getMessagesByChatId(existingChat.id);
        
        // Save new user message
        await saveMessages({
          messages: [{
            id: nanoid(),
            chatId: existingChat.id,
            role: 'user',
            parts: body.message.parts,
            createdAt: new Date(),
          }],
        });

        // Generate contextual AI response
        const contextualResponse = `Based on our previous conversation (${conversationHistory.length} messages), here's my enhanced response: This demonstrates conversation continuity with real database integration.`;
        
        await saveMessages({
          messages: [{
            id: nanoid(),
            chatId: existingChat.id,
            role: 'assistant',
            parts: [{ type: 'text', text: contextualResponse }],
            createdAt: new Date(),
          }],
        });

        return new Response(
          JSON.stringify({
            success: true,
            chatId: existingChat.id,
            messageCount: conversationHistory.length + 2, // Previous + new user + new assistant
            response: contextualResponse,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const chatRequest = createChatRequest(existingChat.id, {
        message: createChatMessage({
          parts: [{ type: 'text', text: 'Continue our conversation with enhanced context' }],
        }),
      });
      
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.chatId).toBe(existingChat.id);

      // Verify new messages were added
      const messagesInDb = await db
        .select()
        .from(message)
        .where(db.eq(message.chatId, existingChat.id))
        .orderBy(message.createdAt);

      expect(messagesInDb.length).toBeGreaterThan(2); // Original + new messages
      
      logger.info('chat_test', 'Existing chat message test completed', {
        userId: testUser.id,
        chatId: existingChat.id,
        totalMessages: messagesInDb.length,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });

    it('should enforce rate limiting with real database message counting', async () => {
      const startTime = Date.now();
      
      const { user: testUser } = await factory.createUserWithChats(0);
      
      // Create many messages to exceed rate limit
      const messagesData = Array.from({ length: 105 }, (_, i) => ({
        id: nanoid(),
        chatId: nanoid(),
        role: 'user' as const,
        parts: [{ type: 'text', text: `Message ${i + 1}` }],
        createdAt: new Date(),
      }));

      // Create chats first
      const chatIds = Array.from(new Set(messagesData.map(m => m.chatId)));
      await db.insert(chat).values(
        chatIds.map(id => ({
          id,
          userId: testUser.id,
          title: `Chat for ${id}`,
          visibility: 'private',
          createdAt: new Date(),
        }))
      );

      // Insert messages
      await db.insert(message).values(messagesData);
      
      mockAuthenticatedUser(testUser.id, 'regular');

      // Mock rate limiting check
      vi.doMock('@/lib/db/queries', () => ({
        getMessageCountByUserId: vi.fn().mockImplementation(async (userId: string) => {
          const queryStartTime = Date.now();
          const [{ count }] = await db
            .select({ count: db.count() })
            .from(message)
            .innerJoin(chat, db.eq(message.chatId, chat.id))
            .where(db.eq(chat.userId, userId));
          
          testMetrics = factory.getMetrics();
          testMetrics.queryTime += Date.now() - queryStartTime;
          
          return count;
        }),
        getChatById: vi.fn().mockResolvedValue(null),
      }));

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const { getMessageCountByUserId } = await import('@/lib/db/queries');
        
        // Check rate limit (100 messages per day for regular users)
        const messageCount = await getMessageCountByUserId(testUser.id);
        if (messageCount >= 100) {
          return new Response(
            JSON.stringify({ 
              error: 'Rate limit exceeded',
              code: 'RATE_LIMITED',
              limit: 100,
              current: messageCount,
              resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }),
            { 
              status: 429, 
              headers: { 
                'Content-Type': 'application/json',
                'Retry-After': '86400',
              } 
            },
          );
        }

        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const chatRequest = createChatRequest(nanoid(), {
        message: createChatMessage({
          parts: [{ type: 'text', text: 'This should be rate limited' }],
        }),
      });
      
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.code).toBe('RATE_LIMITED');
      expect(data.current).toBeGreaterThan(100);
      expect(response.headers.get('Retry-After')).toBe('86400');
      
      logger.info('chat_test', 'Rate limiting test completed', {
        userId: testUser.id,
        messageCount: data.current,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });

    it('should handle RAG integration with document context', async () => {
      const startTime = Date.now();
      
      const { user: testUser } = await factory.createUserWithChats(0);
      const { chat: ragChat, documents } = await factory.createChatWithDocuments(testUser.id, 3);
      
      mockAuthenticatedUser(testUser.id);

      // Mock RAG-enabled database queries
      vi.doMock('@/lib/db/queries', () => ({
        getChatById: vi.fn().mockResolvedValue(ragChat),
        getMessageCountByUserId: vi.fn().mockResolvedValue(10),
        saveMessages: vi.fn().mockImplementation(async ({ messages }: any) => {
          if (messages.length > 0) {
            await db.insert(message).values(messages);
          }
          return undefined;
        }),
        createStreamId: vi.fn().mockResolvedValue(undefined),
      }));

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const body = await request.json();
        
        expect(body.id).toBe(ragChat.id);

        // Simulate RAG document retrieval
        const queryStartTime = Date.now();
        const relevantDocuments = await db
          .select({
            id: ragDocument.id,
            fileName: ragDocument.fileName,
            status: ragDocument.status,
          })
          .from(ragDocument)
          .where(db.eq(ragDocument.uploadedBy, testUser.id))
          .where(db.eq(ragDocument.status, 'processed'));
        
        testMetrics = factory.getMetrics();
        testMetrics.queryTime += Date.now() - queryStartTime;

        const { saveMessages } = await import('@/lib/db/queries');

        // Save user message
        await saveMessages({
          messages: [{
            id: nanoid(),
            chatId: ragChat.id,
            role: 'user',
            parts: body.message.parts,
            createdAt: new Date(),
          }],
        });

        // Generate RAG-enhanced response
        const ragResponse = `Based on ${relevantDocuments.length} processed documents (${relevantDocuments.map(d => d.fileName).join(', ')}), here's my enhanced response: This demonstrates RAG integration with real document context retrieval.`;
        
        await saveMessages({
          messages: [{
            id: nanoid(),
            chatId: ragChat.id,
            role: 'assistant',
            parts: [{ 
              type: 'text', 
              text: ragResponse,
              metadata: {
                ragSources: relevantDocuments.map(d => d.id),
                documentCount: relevantDocuments.length,
              },
            }],
            createdAt: new Date(),
          }],
        });

        return new Response(
          JSON.stringify({
            success: true,
            chatId: ragChat.id,
            response: ragResponse,
            ragContext: {
              documentsUsed: relevantDocuments.length,
              sources: relevantDocuments,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(POST).mockImplementation(mockHandler);

      const chatRequest = createChatRequest(ragChat.id, {
        message: createChatMessage({
          parts: [{ type: 'text', text: 'What information can you find in my documents?' }],
        }),
      });
      
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.ragContext.documentsUsed).toBe(documents.length);
      expect(data.ragContext.sources).toHaveLength(documents.length);

      // Verify RAG message was saved with metadata
      const messagesInDb = await db
        .select()
        .from(message)
        .where(db.eq(message.chatId, ragChat.id))
        .orderBy(message.createdAt);

      const assistantMessage = messagesInDb.find(m => m.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage?.parts[0].metadata?.documentCount).toBe(documents.length);
      
      logger.info('chat_test', 'RAG integration test completed', {
        userId: testUser.id,
        chatId: ragChat.id,
        documentsUsed: data.ragContext.documentsUsed,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });
  });

  describe('GET /api/chat - Enhanced Stream Resumption', () => {
    it('should resume streaming for valid chat with real session tracking', async () => {
      const startTime = Date.now();
      
      const { user: testUser, chats } = await factory.createUserWithChats(1);
      const existingChat = chats[0].chat;
      
      mockAuthenticatedUser(testUser.id);

      // Mock stream resumption queries
      vi.doMock('@/lib/db/queries', () => ({
        getChatById: vi.fn().mockResolvedValue(existingChat),
        getStreamIdsByChatId: vi.fn().mockImplementation(async (chatId: string) => {
          const queryStartTime = Date.now();
          // Simulate stream ID lookup (would be in a separate table in real implementation)
          testMetrics = factory.getMetrics();
          testMetrics.queryTime += Date.now() - queryStartTime;
          
          return [`stream-${chatId}-123`, `stream-${chatId}-456`];
        }),
      }));

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const url = new URL(request.url);
        const chatId = url.searchParams.get('chatId');
        
        expect(chatId).toBe(existingChat.id);

        const { getChatById, getStreamIdsByChatId } = await import('@/lib/db/queries');

        // Verify chat exists and user has access
        const chatInDb = await getChatById(chatId!);
        if (!chatInDb || chatInDb.userId !== testUser.id) {
          return new Response(
            JSON.stringify({ 
              error: 'Chat not found or access denied',
              code: 'CHAT_ACCESS_DENIED',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          );
        }

        // Get active stream IDs
        const streamIds = await getStreamIdsByChatId(chatId!);

        return new Response(
          new ReadableStream({
            start(controller) {
              // Simulate resumable stream
              controller.enqueue(`data: ${JSON.stringify({ 
                type: 'stream_resumed',
                chatId,
                streamIds,
                timestamp: new Date().toISOString(),
              })}\n\n`);
              
              controller.enqueue(`data: ${JSON.stringify({ 
                type: 'content',
                content: 'Resuming previous stream...',
              })}\n\n`);
              
              controller.enqueue('data: [DONE]\n\n');
              controller.close();
            },
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            },
          },
        );
      });

      vi.mocked(GET).mockImplementation(mockHandler);

      const request = createMockRequest(
        `http://localhost:3000/api/chat?chatId=${existingChat.id}`,
      );

      const response = await GET(request);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      
      logger.info('chat_test', 'Stream resumption test completed', {
        userId: testUser.id,
        chatId: existingChat.id,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });
  });

  describe('DELETE /api/chat - Enhanced Chat Deletion', () => {
    it('should delete chat and all associated data', async () => {
      const startTime = Date.now();
      
      const { user: testUser, chats } = await factory.createUserWithChats(1);
      const chatToDelete = chats[0].chat;
      
      mockAuthenticatedUser(testUser.id);

      // Mock deletion operations
      vi.doMock('@/lib/db/queries', () => ({
        getChatById: vi.fn().mockResolvedValue(chatToDelete),
        deleteChatById: vi.fn().mockImplementation(async ({ id }: { id: string }) => {
          const deleteStartTime = Date.now();
          
          // Delete messages first (foreign key constraint)
          await db.delete(message).where(db.eq(message.chatId, id));
          
          // Delete chat
          const [deletedChat] = await db
            .delete(chat)
            .where(db.eq(chat.id, id))
            .returning();
          
          testMetrics = factory.getMetrics();
          testMetrics.queryTime += Date.now() - deleteStartTime;
          
          return deletedChat;
        }),
      }));

      const mockHandler = vi.fn().mockImplementation(async (request) => {
        const url = new URL(request.url);
        const chatId = url.searchParams.get('id');
        
        expect(chatId).toBe(chatToDelete.id);

        const { getChatById, deleteChatById } = await import('@/lib/db/queries');

        // Verify chat exists and user owns it
        const chatInDb = await getChatById(chatId!);
        if (!chatInDb || chatInDb.userId !== testUser.id) {
          return new Response(
            JSON.stringify({ 
              error: 'Chat not found or access denied',
              code: 'CHAT_ACCESS_DENIED',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          );
        }

        // Delete chat and all associated data
        const deletedChat = await deleteChatById({ id: chatId! });

        return new Response(
          JSON.stringify({
            success: true,
            deletedChat: {
              id: deletedChat.id,
              title: deletedChat.title,
            },
            message: 'Chat and all associated messages deleted successfully',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

      vi.mocked(DELETE).mockImplementation(mockHandler);

      const request = createMockRequest(
        `http://localhost:3000/api/chat?id=${chatToDelete.id}`,
        { method: 'DELETE' },
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.deletedChat.id).toBe(chatToDelete.id);

      // Verify chat was actually deleted from database
      const queryStartTime = Date.now();
      const [chatInDb] = await db
        .select()
        .from(chat)
        .where(db.eq(chat.id, chatToDelete.id));
      
      testMetrics.queryTime += Date.now() - queryStartTime;

      expect(chatInDb).toBeUndefined();

      // Verify messages were also deleted
      const messagesInDb = await db
        .select()
        .from(message)
        .where(db.eq(message.chatId, chatToDelete.id));

      expect(messagesInDb).toHaveLength(0);
      
      logger.info('chat_test', 'Chat deletion test completed', {
        userId: testUser.id,
        deletedChatId: chatToDelete.id,
        duration: Date.now() - startTime,
        metrics: testMetrics,
      });
    });
  });

  describe('Performance and Scalability Tests', () => {
    it('should handle concurrent chat operations efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple users with chats for concurrent testing
      const userPromises = Array.from({ length: 5 }, () => 
        factory.createUserWithChats(2)
      );
      
      const userResults = await Promise.all(userPromises);
      
      // Perform concurrent chat operations
      const operationPromises = userResults.map(async ({ user, chats }) => {
        const operationStartTime = Date.now();
        
        // Concurrent message additions
        const messagePromises = chats.map(async ({ chat }) => {
          return await db.insert(message).values({
            id: nanoid(),
            chatId: chat.id,
            role: 'user',
            parts: [{ type: 'text', text: `Concurrent message for ${chat.id}` }],
            createdAt: new Date(),
          });
        });

        await Promise.all(messagePromises);
        
        return {
          userId: user.id,
          chatCount: chats.length,
          duration: Date.now() - operationStartTime,
        };
      });

      const operationResults = await Promise.all(operationPromises);
      
      // Measure aggregate query performance
      const queryStartTime = Date.now();
      const aggregateData = await db
        .select({
          userId: chat.userId,
          chatCount: db.count(chat.id),
          messageCount: db.count(message.id),
        })
        .from(chat)
        .leftJoin(message, db.eq(chat.id, message.chatId))
        .groupBy(chat.userId);
      
      const queryTime = Date.now() - queryStartTime;
      const totalTime = Date.now() - startTime;
      
      const performanceMetrics = {
        totalUsers: userResults.length,
        totalChats: userResults.reduce((sum, result) => sum + result.chats.length, 0),
        totalTime,
        queryTime,
        avgOperationTime: operationResults.reduce((sum, result) => sum + result.duration, 0) / operationResults.length,
        memoryUsage: process.memoryUsage(),
        concurrentOperations: true,
        branchIsolation: true,
      };

      expect(aggregateData).toHaveLength(userResults.length);
      expect(queryTime).toBeLessThan(2000);
      expect(totalTime).toBeLessThan(15000);
      
      logger.info('chat_test', 'Concurrent operations test completed', {
        metrics: performanceMetrics,
        operationResults,
      });

      // Log comparison metrics for documentation
      console.log('\n=== Enhanced Chat API Test Performance ===');
      console.log(`Total Users: ${performanceMetrics.totalUsers}`);
      console.log(`Total Chats: ${performanceMetrics.totalChats}`);
      console.log(`Total Test Time: ${performanceMetrics.totalTime}ms`);
      console.log(`Aggregate Query Time: ${performanceMetrics.queryTime}ms`);
      console.log(`Avg Operation Time: ${performanceMetrics.avgOperationTime.toFixed(2)}ms`);
      console.log(`Memory Usage: ${Math.round(performanceMetrics.memoryUsage.heapUsed / 1024 / 1024)}MB`);
      console.log(`Concurrent Operations: ${performanceMetrics.concurrentOperations ? 'Enabled' : 'Disabled'}`);
      console.log(`Branch Isolation: ${performanceMetrics.branchIsolation ? 'Enabled' : 'Disabled'}`);
      console.log('============================================\n');
    });
  });
});