/**
 * Unit Tests for Conversation History Pruning
 *
 * Tests the pruning logic for various scenarios including:
 * - Short conversations (no pruning needed)
 * - Long conversations (pruning required)
 * - Edge cases (empty arrays, malformed sequences)
 * - Different message role distributions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  pruneConversationHistory,
  estimateTokenCount,
  pruneByTokenBudget,
  getPruningStats,
  CONVERSATION_PRUNING_CONFIG,
  type CoreMessageWithId,
} from '@/lib/ai/conversation-pruning';

describe('Conversation History Pruning', () => {
  // Helper functions for creating test messages
  const createUserMessage = (
    id: string,
    content: string,
  ): CoreMessageWithId => ({
    id,
    role: 'user',
    content,
  });

  const createAssistantMessage = (
    id: string,
    content: string,
  ): CoreMessageWithId => ({
    id,
    role: 'assistant',
    content,
  });

  const createSystemMessage = (
    id: string,
    content: string,
  ): CoreMessageWithId => ({
    id,
    role: 'system',
    content,
  });

  beforeEach(() => {
    // Reset any test state if needed
  });

  describe('pruneConversationHistory', () => {
    it('should handle empty message array', () => {
      const result = pruneConversationHistory([]);

      expect(result.messages).toEqual([]);
      expect(result.wasApplied).toBe(false);
      expect(result.metrics.originalMessageCount).toBe(0);
      expect(result.metrics.prunedMessageCount).toBe(0);
    });

    it('should handle single user message', () => {
      const messages = [createUserMessage('u1', 'Hello world')];
      const result = pruneConversationHistory(messages);

      expect(result.messages).toEqual([messages[0]]);
      expect(result.wasApplied).toBe(true);
      expect(result.metrics.turnsPreserved).toBe(0);
      expect(result.metrics.prunedMessageCount).toBe(1);
    });

    it('should preserve all messages when under maxTurns limit', () => {
      const messages = [
        createUserMessage('u1', 'First question'),
        createAssistantMessage('a1', 'First answer'),
        createUserMessage('u2', 'Second question'),
        createAssistantMessage('a2', 'Second answer'),
        createUserMessage('u3', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 3);

      expect(result.messages).toHaveLength(5);
      expect(result.messages.map((m) => m.id)).toEqual([
        'u1',
        'a1',
        'u2',
        'a2',
        'u3',
      ]);
      expect(result.metrics.turnsPreserved).toBe(2);
    });

    it('should prune older turns when exceeding maxTurns', () => {
      const messages = [
        createUserMessage('u1', 'Oldest question'), // Should be pruned
        createAssistantMessage('a1', 'Oldest answer'), // Should be pruned
        createUserMessage('u2', 'Middle question'),
        createAssistantMessage('a2', 'Middle answer'),
        createUserMessage('u3', 'Recent question'),
        createAssistantMessage('a3', 'Recent answer'),
        createUserMessage('u4', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 2);

      expect(result.messages).toHaveLength(5);
      expect(result.messages.map((m) => m.id)).toEqual([
        'u2',
        'a2',
        'u3',
        'a3',
        'u4',
      ]);
      expect(result.metrics.turnsPreserved).toBe(2);
      expect(result.metrics.originalMessageCount).toBe(7);
      expect(result.metrics.prunedMessageCount).toBe(5);
    });

    it('should handle maxTurns = 1, keeping only last turn + current message', () => {
      const messages = [
        createUserMessage('u1', 'Old question'),
        createAssistantMessage('a1', 'Old answer'),
        createUserMessage('u2', 'Previous question'),
        createAssistantMessage('a2', 'Previous answer'),
        createUserMessage('u3', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 1);

      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.id)).toEqual(['u2', 'a2', 'u3']);
      expect(result.metrics.turnsPreserved).toBe(1);
    });

    it('should handle maxTurns = 0, keeping only current user message', () => {
      const messages = [
        createUserMessage('u1', 'Old question'),
        createAssistantMessage('a1', 'Old answer'),
        createUserMessage('u2', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 0);

      expect(result.messages).toHaveLength(1);
      expect(result.messages.map((m) => m.id)).toEqual(['u2']);
      expect(result.metrics.turnsPreserved).toBe(0);
    });

    it('should filter out system messages from client', () => {
      const messages = [
        createSystemMessage('s1', 'Client system prompt'),
        createUserMessage('u1', 'User question'),
        createAssistantMessage('a1', 'Assistant answer'),
        createUserMessage('u2', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 2);

      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
      expect(result.messages.find((m) => m.role === 'system')).toBeUndefined();
      expect(result.metrics.systemMessagesFiltered).toBe(1);
    });

    it('should handle conversations with incomplete turns', () => {
      const messages = [
        createUserMessage('u1', 'Complete turn user'),
        createAssistantMessage('a1', 'Complete turn assistant'),
        createUserMessage('u2', 'Incomplete turn - no assistant'),
        createUserMessage('u3', 'Another user message'),
        createUserMessage('u4', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 1);

      // Should include the complete turn + current message
      expect(result.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u4']);
      expect(result.metrics.turnsPreserved).toBe(1);
    });

    it('should preserve first turn when preserveFirstTurn is enabled', () => {
      const messages = [
        createUserMessage('u1', 'First question'),
        createAssistantMessage('a1', 'First answer'),
        createUserMessage('u2', 'Middle question'),
        createAssistantMessage('a2', 'Middle answer'),
        createUserMessage('u3', 'Recent question'),
        createAssistantMessage('a3', 'Recent answer'),
        createUserMessage('u4', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 1, true);

      // Should include first turn, last turn, and current message
      expect(result.messages.map((m) => m.id)).toEqual([
        'u1',
        'a1',
        'u3',
        'a3',
        'u4',
      ]);
      expect(result.metrics.turnsPreserved).toBe(2); // First turn + last turn
    });

    it('should not duplicate first turn if it is already included in last N turns', () => {
      const messages = [
        createUserMessage('u1', 'First and only complete turn'),
        createAssistantMessage('a1', 'First answer'),
        createUserMessage('u2', 'Current question'),
      ];

      const result = pruneConversationHistory(messages, 2, true);

      expect(result.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
      expect(result.metrics.turnsPreserved).toBe(1);
    });

    it('should handle conversation with only user messages', () => {
      const messages = [
        createUserMessage('u1', 'User 1'),
        createUserMessage('u2', 'User 2'),
        createUserMessage('u3', 'User 3 current'),
      ];

      const result = pruneConversationHistory(messages, 1);

      // No complete turns found, only current message
      expect(result.messages.map((m) => m.id)).toEqual(['u3']);
      expect(result.metrics.turnsPreserved).toBe(0);
    });

    it('should handle conversation ending with assistant message before current user', () => {
      const messages = [
        createUserMessage('u1', 'User 1'),
        createAssistantMessage('a1', 'Assistant 1'),
        createUserMessage('u2', 'User 2'),
        createAssistantMessage('a2', 'Assistant 2'),
        createUserMessage('u3', 'Current query'),
      ];

      const result = pruneConversationHistory(messages, 1);

      expect(result.messages.map((m) => m.id)).toEqual(['u2', 'a2', 'u3']);
      expect(result.metrics.turnsPreserved).toBe(1);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate token count for messages', () => {
      const messages = [
        createUserMessage('u1', 'Short'), // ~1-2 tokens
        createAssistantMessage(
          'a1',
          'This is a longer message with more content',
        ), // ~12 tokens
      ];

      const tokenCount = estimateTokenCount(messages);

      expect(tokenCount).toBeGreaterThan(10);
      expect(tokenCount).toBeLessThan(20);
    });

    it('should handle empty messages', () => {
      expect(estimateTokenCount([])).toBe(0);
    });

    it('should handle complex message content', () => {
      const messages = [
        {
          id: 'complex',
          role: 'user' as const,
          content: [
            { type: 'text', text: 'Hello world' },
            { type: 'image', image: 'base64data...' },
          ],
        },
      ];

      const tokenCount = estimateTokenCount(messages);
      expect(tokenCount).toBeGreaterThan(0);
    });
  });

  describe('pruneByTokenBudget', () => {
    it('should return messages as-is when under token budget', () => {
      const messages = [
        createUserMessage('u1', 'Hi'),
        createAssistantMessage('a1', 'Hello'),
      ];

      const result = pruneByTokenBudget(messages, 1000);

      expect(result.wasApplied).toBe(false);
      expect(result.messages).toHaveLength(2);
    });

    it('should apply pruning when over token budget', () => {
      const messages = [
        createUserMessage('u1', 'Very long message '.repeat(100)), // Large message
        createAssistantMessage('a1', 'Very long response '.repeat(100)), // Large message
        createUserMessage('u2', 'Another long message '.repeat(50)),
        createAssistantMessage('a2', 'Another long response '.repeat(50)),
        createUserMessage('u3', 'Current question'),
      ];

      const result = pruneByTokenBudget(messages, 50); // Very small budget

      expect(result.wasApplied).toBe(true);
      expect(result.messages.length).toBeLessThan(messages.length);
    });
  });

  describe('getPruningStats', () => {
    it('should calculate correct statistics', () => {
      const result = {
        messages: [createUserMessage('u1', 'test')],
        metrics: {
          originalMessageCount: 5,
          prunedMessageCount: 3,
          turnsPreserved: 1,
          systemMessagesFiltered: 1,
        },
        wasApplied: true,
      };

      const stats = getPruningStats(result);

      expect(stats.originalMessages).toBe(5);
      expect(stats.prunedMessages).toBe(3);
      expect(stats.reductionPercentage).toBe(40); // (5-3)/5 * 100
      expect(stats.turnsPreserved).toBe(1);
      expect(stats.systemMessagesFiltered).toBe(1);
    });

    it('should handle zero original messages', () => {
      const result = {
        messages: [],
        metrics: {
          originalMessageCount: 0,
          prunedMessageCount: 0,
          turnsPreserved: 0,
          systemMessagesFiltered: 0,
        },
        wasApplied: false,
      };

      const stats = getPruningStats(result);

      expect(stats.reductionPercentage).toBe(0);
    });
  });

  describe('Configuration-based behavior', () => {
    it('should respect CONVERSATION_PRUNING_CONFIG.MAX_HISTORY_TURNS', () => {
      const messages = [
        createUserMessage('u1', 'Turn 1 user'),
        createAssistantMessage('a1', 'Turn 1 assistant'),
        createUserMessage('u2', 'Turn 2 user'),
        createAssistantMessage('a2', 'Turn 2 assistant'),
        createUserMessage('u3', 'Turn 3 user'),
        createAssistantMessage('a3', 'Turn 3 assistant'),
        createUserMessage('u4', 'Current'),
      ];

      // Test with default config
      const result = pruneConversationHistory(messages);

      // Should respect the configured max turns (default 3)
      expect(result.metrics.turnsPreserved).toBeLessThanOrEqual(
        CONVERSATION_PRUNING_CONFIG.MAX_HISTORY_TURNS,
      );
    });
  });
});
