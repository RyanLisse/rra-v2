import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET, DELETE } from '@/app/(chat)/api/chat/route';
import {
  createMockRequest,
  mockAuthSuccess,
  mockAuthFailure,
  assertSuccessResponse,
  assertErrorResponse,
  setupTestEnvironment,
} from '../utils/test-helpers';
import { createChatRequest } from '../fixtures/test-data';
import { nanoid } from 'nanoid';

// Mock dependencies
vi.mock('ai', () => ({
  appendClientMessage: vi.fn().mockReturnValue([]),
  appendResponseMessages: vi.fn().mockReturnValue([{}, {}]),
  createDataStream: vi.fn().mockReturnValue(new ReadableStream()),
  smoothStream: vi.fn().mockReturnValue({}),
  streamText: vi.fn().mockReturnValue({
    consumeStream: vi.fn(),
    mergeIntoDataStream: vi.fn(),
  }),
}));

vi.mock('@/lib/db/queries', () => ({
  createStreamId: vi.fn().mockResolvedValue(undefined),
  deleteChatById: vi.fn().mockResolvedValue({ id: 'chat-123' }),
  getChatById: vi.fn().mockResolvedValue(null),
  getMessageCountByUserId: vi.fn().mockResolvedValue(0),
  getMessagesByChatId: vi.fn().mockResolvedValue([]),
  getStreamIdsByChatId: vi.fn().mockResolvedValue(['stream-123']),
  saveChat: vi.fn().mockResolvedValue(undefined),
  saveMessages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../actions', () => ({
  generateTitleFromUserMessage: vi.fn().mockResolvedValue('Test Chat Title'),
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

describe('Chat API Routes', () => {
  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
  });

  describe('POST /api/chat', () => {
    it('should create a new chat and process message', async () => {
      const userId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const chatRequest = createChatRequest(chatId);
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify chat creation
      const { saveChat } = await import('@/lib/db/queries');
      expect(saveChat).toHaveBeenCalledWith({
        id: chatId,
        userId,
        title: 'Test Chat Title',
        visibility: 'private',
      });
    });

    it('should process message for existing chat', async () => {
      const userId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      // Mock existing chat
      const { getChatById } = await import('@/lib/db/queries');
      vi.mocked(getChatById).mockResolvedValue({
        id: chatId,
        userId,
        title: 'Existing Chat',
        visibility: 'private',
        createdAt: new Date(),
      });

      const chatRequest = createChatRequest(chatId);
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify no new chat created
      const { saveChat } = await import('@/lib/db/queries');
      expect(saveChat).not.toHaveBeenCalled();
    });

    it('should reject unauthorized requests', async () => {
      const mockWithAuth = mockAuthFailure();
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const chatRequest = createChatRequest(nanoid());
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      await assertErrorResponse(response, 401, 'Unauthorized');
    });

    it('should enforce rate limiting', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId, 'regular');
      vi.mocked(POST).mockImplementation(mockWithAuth);

      // Mock rate limit exceeded
      const { getMessageCountByUserId } = await import('@/lib/db/queries');
      vi.mocked(getMessageCountByUserId).mockResolvedValue(1000); // Exceed limit

      const chatRequest = createChatRequest(nanoid());
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      await assertErrorResponse(response, 429, 'rate_limit');
    });

    it('should reject access to other users chats', async () => {
      const userId = nanoid();
      const otherUserId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      // Mock chat owned by different user
      const { getChatById } = await import('@/lib/db/queries');
      vi.mocked(getChatById).mockResolvedValue({
        id: chatId,
        userId: otherUserId, // Different user
        title: 'Other User Chat',
        visibility: 'private',
        createdAt: new Date(),
      });

      const chatRequest = createChatRequest(chatId);
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      await assertErrorResponse(response, 403, 'forbidden');
    });

    it('should validate request schema', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const invalidRequest = {
        id: nanoid(),
        // Missing required fields
      };

      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: invalidRequest,
      });

      const response = await POST(request);
      await assertErrorResponse(response, 400, 'bad_request');
    });

    it('should include geolocation in request hints', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const chatRequest = createChatRequest(nanoid());
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      await POST(request);

      const { geolocation } = await import('@vercel/functions');
      expect(geolocation).toHaveBeenCalledWith(request);
    });

    it('should save user message to database', async () => {
      const userId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const chatRequest = createChatRequest(chatId);
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      await POST(request);

      const { saveMessages } = await import('@/lib/db/queries');
      expect(saveMessages).toHaveBeenCalledWith({
        messages: expect.arrayContaining([
          expect.objectContaining({
            chatId,
            role: 'user',
            parts: chatRequest.message.parts,
          }),
        ]),
      });
    });

    it('should handle AI tools for non-reasoning models', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const chatRequest = createChatRequest(nanoid(), {
        selectedChatModel: 'grok-beta',
      });
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      await POST(request);

      const { streamText } = await import('ai');
      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          experimental_activeTools: [
            'getWeather',
            'createDocument',
            'updateDocument',
            'requestSuggestions',
          ],
        }),
      );
    });

    it('should disable tools for reasoning models', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      const chatRequest = createChatRequest(nanoid(), {
        selectedChatModel: 'chat-model-reasoning',
      });
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      await POST(request);

      const { streamText } = await import('ai');
      expect(streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          experimental_activeTools: [],
        }),
      );
    });
  });

  describe('GET /api/chat', () => {
    it('should resume streaming for valid chat', async () => {
      const userId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(GET).mockImplementation(mockWithAuth);

      // Mock chat and stream data
      const { getChatById, getStreamIdsByChatId } = await import(
        '@/lib/db/queries'
      );
      vi.mocked(getChatById).mockResolvedValue({
        id: chatId,
        userId,
        title: 'Test Chat',
        visibility: 'private',
        createdAt: new Date(),
      });
      vi.mocked(getStreamIdsByChatId).mockResolvedValue(['stream-123']);

      const request = createMockRequest(
        `http://localhost:3000/api/chat?chatId=${chatId}`,
      );

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should reject unauthorized access to private chats', async () => {
      const userId = nanoid();
      const otherUserId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(GET).mockImplementation(mockWithAuth);

      // Mock private chat owned by different user
      const { getChatById } = await import('@/lib/db/queries');
      vi.mocked(getChatById).mockResolvedValue({
        id: chatId,
        userId: otherUserId,
        title: 'Private Chat',
        visibility: 'private',
        createdAt: new Date(),
      });

      const request = createMockRequest(
        `http://localhost:3000/api/chat?chatId=${chatId}`,
      );

      const response = await GET(request);
      await assertErrorResponse(response, 403, 'forbidden');
    });

    it('should allow access to public chats', async () => {
      const userId = nanoid();
      const otherUserId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(GET).mockImplementation(mockWithAuth);

      // Mock public chat owned by different user
      const { getChatById, getStreamIdsByChatId } = await import(
        '@/lib/db/queries'
      );
      vi.mocked(getChatById).mockResolvedValue({
        id: chatId,
        userId: otherUserId,
        title: 'Public Chat',
        visibility: 'public',
        createdAt: new Date(),
      });
      vi.mocked(getStreamIdsByChatId).mockResolvedValue(['stream-123']);

      const request = createMockRequest(
        `http://localhost:3000/api/chat?chatId=${chatId}`,
      );

      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should handle missing chatId parameter', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(GET).mockImplementation(mockWithAuth);

      const request = createMockRequest('http://localhost:3000/api/chat');

      const response = await GET(request);
      await assertErrorResponse(response, 400, 'bad_request');
    });

    it('should handle non-existent chat', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(GET).mockImplementation(mockWithAuth);

      // Mock non-existent chat
      const { getChatById } = await import('@/lib/db/queries');
      vi.mocked(getChatById).mockResolvedValue(null);

      const request = createMockRequest(
        'http://localhost:3000/api/chat?chatId=non-existent',
      );

      const response = await GET(request);
      await assertErrorResponse(response, 404, 'not_found');
    });
  });

  describe('DELETE /api/chat', () => {
    it('should delete chat owned by user', async () => {
      const userId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(DELETE).mockImplementation(mockWithAuth);

      // Mock chat owned by user
      const { getChatById } = await import('@/lib/db/queries');
      vi.mocked(getChatById).mockResolvedValue({
        id: chatId,
        userId,
        title: 'Test Chat',
        visibility: 'private',
        createdAt: new Date(),
      });

      const request = createMockRequest(
        `http://localhost:3000/api/chat?id=${chatId}`,
        { method: 'DELETE' },
      );

      const response = await DELETE(request);
      const data = await assertSuccessResponse(response);

      expect(data.id).toBe('chat-123');

      const { deleteChatById } = await import('@/lib/db/queries');
      expect(deleteChatById).toHaveBeenCalledWith({ id: chatId });
    });

    it('should reject deletion of other users chats', async () => {
      const userId = nanoid();
      const otherUserId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(DELETE).mockImplementation(mockWithAuth);

      // Mock chat owned by different user
      const { getChatById } = await import('@/lib/db/queries');
      vi.mocked(getChatById).mockResolvedValue({
        id: chatId,
        userId: otherUserId,
        title: 'Other User Chat',
        visibility: 'private',
        createdAt: new Date(),
      });

      const request = createMockRequest(
        `http://localhost:3000/api/chat?id=${chatId}`,
        { method: 'DELETE' },
      );

      const response = await DELETE(request);
      await assertErrorResponse(response, 403, 'forbidden');
    });

    it('should handle missing id parameter', async () => {
      const userId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(DELETE).mockImplementation(mockWithAuth);

      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      await assertErrorResponse(response, 400, 'bad_request');
    });
  });

  describe('Stream Resumption', () => {
    it('should handle resumable streams when available', async () => {
      const userId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      // Mock resumable stream context
      const { createResumableStreamContext } = await import('resumable-stream');
      const mockContext = {
        resumableStream: vi.fn().mockResolvedValue(new ReadableStream()),
      };
      vi.mocked(createResumableStreamContext).mockReturnValue(mockContext);

      const chatRequest = createChatRequest(chatId);
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(mockContext.resumableStream).toHaveBeenCalled();
    });

    it('should fallback to regular streams when resumable streams unavailable', async () => {
      const userId = nanoid();
      const chatId = nanoid();
      const mockWithAuth = mockAuthSuccess(userId);
      vi.mocked(POST).mockImplementation(mockWithAuth);

      // Mock resumable stream context failure
      const { createResumableStreamContext } = await import('resumable-stream');
      vi.mocked(createResumableStreamContext).mockImplementation(() => {
        throw new Error('REDIS_URL not found');
      });

      const chatRequest = createChatRequest(chatId);
      const request = createMockRequest('http://localhost:3000/api/chat', {
        method: 'POST',
        body: chatRequest,
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
    });
  });
});
