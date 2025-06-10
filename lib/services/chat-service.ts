/**
 * Chat Service
 *
 * Business logic layer for chat operations, decoupled from direct database access.
 * Uses repository pattern for data access and provides high-level chat operations.
 */

import {
  chatRepository,
  messageRepository,
  userRepository,
} from '@/lib/db/repository';
import type { Chat, Message } from '@/lib/db/schema';
import { pruneConversationHistory } from '@/lib/ai/conversation-pruning';
import type { CoreMessageWithId } from '@/lib/ai/conversation-pruning';

/**
 * Chat creation parameters
 */
export interface CreateChatParams {
  userId: string;
  title?: string;
  visibility?: 'private' | 'public';
  initialMessage?: string;
}

/**
 * Message creation parameters
 */
export interface CreateMessageParams {
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
}

/**
 * Chat query options
 */
export interface ChatQueryOptions {
  limit?: number;
  offset?: number;
  includeMessages?: boolean;
  userId?: string;
}

/**
 * Chat with messages
 */
export interface ChatWithMessages extends Chat {
  messages: Message[];
  messageCount: number;
}

/**
 * Chat service class
 */
export class ChatService {
  /**
   * Create a new chat
   */
  async createChat(params: CreateChatParams): Promise<Chat> {
    // Validate user exists
    const user = await userRepository.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create chat
    const chat = await chatRepository.create({
      userId: params.userId,
      title: params.title || 'New Chat',
      visibility: params.visibility || 'private',
    });

    // Create initial message if provided
    if (params.initialMessage) {
      await this.addMessage({
        chatId: chat.id,
        role: 'user',
        content: params.initialMessage,
      });
    }

    return chat;
  }

  /**
   * Get chat by ID with optional message inclusion
   */
  async getChatById(
    chatId: string,
    options?: { includeMessages?: boolean; userId?: string },
  ): Promise<ChatWithMessages | null> {
    const chat = await chatRepository.findById(chatId);
    if (!chat) return null;

    // Check authorization if userId provided
    if (options?.userId && chat.userId !== options.userId) {
      throw new Error('Unauthorized access to chat');
    }

    let messages: Message[] = [];
    if (options?.includeMessages) {
      messages = await messageRepository.findByChatId(chatId);
    }

    return {
      ...chat,
      messages,
      messageCount: messages.length,
    };
  }

  /**
   * Get chats for a user
   */
  async getChatsByUserId(
    userId: string,
    options?: ChatQueryOptions,
  ): Promise<ChatWithMessages[]> {
    const chats = await chatRepository.findByUserId(userId, {
      limit: options?.limit,
    });

    if (!options?.includeMessages) {
      return chats.map((chat) => ({
        ...chat,
        messages: [],
        messageCount: 0,
      }));
    }

    // Load messages for each chat
    const chatsWithMessages = await Promise.all(
      chats.map(async (chat) => {
        const messages = await messageRepository.findByChatId(chat.id);
        return {
          ...chat,
          messages,
          messageCount: messages.length,
        };
      }),
    );

    return chatsWithMessages;
  }

  /**
   * Add a message to a chat
   */
  async addMessage(params: CreateMessageParams): Promise<Message> {
    // Validate chat exists
    const chat = await chatRepository.findById(params.chatId);
    if (!chat) {
      throw new Error('Chat not found');
    }

    // Create message
    const message = await messageRepository.create({
      chatId: params.chatId,
      role: params.role,
      content: params.content,
      metadata: params.metadata,
    });

    // Update chat's updated timestamp
    await chatRepository.update(params.chatId, {
      updatedAt: new Date(),
    });

    return message;
  }

  /**
   * Get messages for a chat with conversation pruning
   */
  async getMessagesForChat(
    chatId: string,
    options?: {
      maxTurns?: number;
      preserveFirstTurn?: boolean;
      includeMetadata?: boolean;
    },
  ): Promise<{ messages: Message[]; pruned: boolean; originalCount: number }> {
    const allMessages = await messageRepository.findByChatId(chatId);

    if (!allMessages.length) {
      return { messages: [], pruned: false, originalCount: 0 };
    }

    // Convert to conversation pruning format
    const coreMessages: CoreMessageWithId[] = allMessages.map((msg) => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    // Apply conversation pruning
    const pruningResult = pruneConversationHistory(
      coreMessages,
      options?.maxTurns,
      options?.preserveFirstTurn,
    );

    // Map back to full message objects
    const prunedMessageIds = new Set(pruningResult.messages.map((m) => m.id));
    const resultMessages = allMessages.filter((msg) =>
      prunedMessageIds.has(msg.id),
    );

    return {
      messages: resultMessages,
      pruned: pruningResult.pruned,
      originalCount: allMessages.length,
    };
  }

  /**
   * Update chat title
   */
  async updateChatTitle(
    chatId: string,
    title: string,
    userId?: string,
  ): Promise<Chat> {
    // Check authorization if userId provided
    if (userId) {
      const chat = await chatRepository.findById(chatId);
      if (!chat || chat.userId !== userId) {
        throw new Error('Unauthorized or chat not found');
      }
    }

    return await chatRepository.update(chatId, { title });
  }

  /**
   * Update chat visibility
   */
  async updateChatVisibility(
    chatId: string,
    visibility: 'private' | 'public',
    userId?: string,
  ): Promise<Chat> {
    // Check authorization if userId provided
    if (userId) {
      const chat = await chatRepository.findById(chatId);
      if (!chat || chat.userId !== userId) {
        throw new Error('Unauthorized or chat not found');
      }
    }

    return await chatRepository.update(chatId, { visibility });
  }

  /**
   * Delete a chat and all its messages
   */
  async deleteChat(chatId: string, userId?: string): Promise<void> {
    // Check authorization if userId provided
    if (userId) {
      const chat = await chatRepository.findById(chatId);
      if (!chat || chat.userId !== userId) {
        throw new Error('Unauthorized or chat not found');
      }
    }

    // Delete messages first (foreign key constraint)
    await messageRepository.deleteByChatId(chatId);

    // Delete chat
    await chatRepository.delete(chatId);
  }

  /**
   * Delete a specific message
   */
  async deleteMessage(messageId: string, userId?: string): Promise<void> {
    const message = await messageRepository.findById(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    // Check authorization if userId provided
    if (userId) {
      const chat = await chatRepository.findById(message.chatId);
      if (!chat || chat.userId !== userId) {
        throw new Error('Unauthorized access to message');
      }
    }

    await messageRepository.delete(messageId);
  }

  /**
   * Get chat statistics
   */
  async getChatStats(chatId: string): Promise<{
    messageCount: number;
    userMessageCount: number;
    assistantMessageCount: number;
    totalCharacters: number;
    averageMessageLength: number;
  }> {
    const messages = await messageRepository.findByChatId(chatId);

    const messageCount = messages.length;
    const userMessageCount = messages.filter((m) => m.role === 'user').length;
    const assistantMessageCount = messages.filter(
      (m) => m.role === 'assistant',
    ).length;
    const totalCharacters = messages.reduce(
      (sum, m) => sum + m.content.length,
      0,
    );
    const averageMessageLength =
      messageCount > 0 ? totalCharacters / messageCount : 0;

    return {
      messageCount,
      userMessageCount,
      assistantMessageCount,
      totalCharacters,
      averageMessageLength: Math.round(averageMessageLength),
    };
  }

  /**
   * Search messages within a chat
   */
  async searchMessages(
    chatId: string,
    query: string,
    options?: { limit?: number; userId?: string },
  ): Promise<Message[]> {
    // Check authorization if userId provided
    if (options?.userId) {
      const chat = await chatRepository.findById(chatId);
      if (!chat || chat.userId !== options.userId) {
        throw new Error('Unauthorized access to chat');
      }
    }

    const messages = await messageRepository.findByChatId(chatId);

    // Simple text search (could be enhanced with full-text search)
    const matchingMessages = messages.filter((message) =>
      message.content.toLowerCase().includes(query.toLowerCase()),
    );

    return options?.limit
      ? matchingMessages.slice(0, options.limit)
      : matchingMessages;
  }

  /**
   * Get recent chats across all users (admin function)
   */
  async getRecentChats(limit = 10): Promise<ChatWithMessages[]> {
    const chats = await chatRepository.findMany({ limit });

    const chatsWithMessages = await Promise.all(
      chats.map(async (chat) => {
        const messages = await messageRepository.findByChatId(chat.id, {
          limit: 5,
        });
        return {
          ...chat,
          messages,
          messageCount: messages.length,
        };
      }),
    );

    return chatsWithMessages;
  }
}

// Export singleton instance
export const chatService = new ChatService();
