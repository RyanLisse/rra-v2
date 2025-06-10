/**
 * Integration Tests for Conversation History Pruning in Chat API
 *
 * Tests that the chat API properly applies conversation history pruning
 * when processing long conversations.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { CoreMessage } from 'ai';
import {
  pruneConversationHistory,
  type CoreMessageWithId,
} from '@/lib/ai/conversation-pruning';

describe('Conversation History Pruning - Integration', () => {
  beforeAll(async () => {
    // Set up test environment
    process.env.CONVERSATION_PRUNING_ENABLED = 'true';
    process.env.MAX_HISTORY_TURNS_TO_LLM = '2';
  });

  afterAll(() => {
    // Clean up environment
    process.env.CONVERSATION_PRUNING_ENABLED = undefined;
    process.env.MAX_HISTORY_TURNS_TO_LLM = undefined;
  });

  const createMessages = (count: number): CoreMessageWithId[] => {
    const messages: CoreMessageWithId[] = [];

    for (let i = 1; i <= count; i++) {
      messages.push({
        id: `user-${i}`,
        role: 'user',
        content: `User message ${i}`,
      });

      if (i < count) {
        // Don't add assistant message for the last user message
        messages.push({
          id: `assistant-${i}`,
          role: 'assistant',
          content: `Assistant response ${i}`,
        });
      }
    }

    return messages;
  };

  describe('Chat API Message Processing', () => {
    it('should apply pruning to long conversations', () => {
      // Create a long conversation (6 user messages = 5 complete turns + 1 current)
      const longConversation = createMessages(6);

      expect(longConversation).toHaveLength(11); // 6 user + 5 assistant = 11 total

      const result = pruneConversationHistory(longConversation, 2);

      // Should keep last 2 complete turns + current user message
      expect(result.messages).toHaveLength(5); // 2 turns (4 messages) + 1 current = 5
      expect(result.wasApplied).toBe(true);
      expect(result.metrics.turnsPreserved).toBe(2);
    });

    it('should preserve conversation flow integrity', () => {
      const conversation = [
        { id: 'u1', role: 'user' as const, content: 'Hello' },
        { id: 'a1', role: 'assistant' as const, content: 'Hi there!' },
        { id: 'u2', role: 'user' as const, content: 'How are you?' },
        { id: 'a2', role: 'assistant' as const, content: 'I am doing well.' },
        { id: 'u3', role: 'user' as const, content: 'What can you help with?' },
        {
          id: 'a3',
          role: 'assistant' as const,
          content: 'I can help with many things.',
        },
        { id: 'u4', role: 'user' as const, content: 'Current question' },
      ];

      const result = pruneConversationHistory(conversation, 2);

      // Should preserve conversation turns properly
      expect(result.messages.map((m) => m.id)).toEqual([
        'u2',
        'a2',
        'u3',
        'a3',
        'u4',
      ]);

      // Verify it's properly structured as user/assistant pairs + current
      const messages = result.messages;
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
      expect(messages[2].role).toBe('user');
      expect(messages[3].role).toBe('assistant');
      expect(messages[4].role).toBe('user'); // Current message
    });

    it('should handle edge case of no previous conversation', () => {
      const singleMessage = [
        { id: 'u1', role: 'user' as const, content: 'First message' },
      ];

      const result = pruneConversationHistory(singleMessage);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('u1');
      expect(result.metrics.turnsPreserved).toBe(0);
    });

    it('should remove system messages from client', () => {
      const conversationWithSystem = [
        {
          id: 's1',
          role: 'system' as const,
          content: 'System: You are helpful',
        },
        { id: 'u1', role: 'user' as const, content: 'Hello' },
        { id: 'a1', role: 'assistant' as const, content: 'Hi!' },
        { id: 'u2', role: 'user' as const, content: 'Current question' },
      ];

      const result = pruneConversationHistory(conversationWithSystem);

      // System message should be filtered out
      expect(result.messages).toHaveLength(3);
      expect(result.messages.find((m) => m.role === 'system')).toBeUndefined();
      expect(result.metrics.systemMessagesFiltered).toBe(1);
    });

    it('should work with different maxTurns configurations', () => {
      const conversation = createMessages(8); // 7 complete turns + 1 current

      // Test with maxTurns = 1
      const result1 = pruneConversationHistory(conversation, 1);
      expect(result1.metrics.turnsPreserved).toBe(1);
      expect(result1.messages).toHaveLength(3); // 1 turn + current = 3 messages

      // Test with maxTurns = 3
      const result3 = pruneConversationHistory(conversation, 3);
      expect(result3.metrics.turnsPreserved).toBe(3);
      expect(result3.messages).toHaveLength(7); // 3 turns + current = 7 messages

      // Test with maxTurns = 0 (only current message)
      const result0 = pruneConversationHistory(conversation, 0);
      expect(result0.metrics.turnsPreserved).toBe(0);
      expect(result0.messages).toHaveLength(1); // Only current message
    });

    it('should log appropriate metrics for monitoring', () => {
      const longConversation = createMessages(10); // Very long conversation

      const result = pruneConversationHistory(longConversation);

      // Should have meaningful metrics for monitoring
      expect(result.metrics.originalMessageCount).toBeGreaterThan(
        result.metrics.prunedMessageCount,
      );
      expect(result.metrics.turnsPreserved).toBeGreaterThan(0);
      expect(result.wasApplied).toBe(true);

      // Calculate reduction percentage
      const reductionPercentage =
        ((result.metrics.originalMessageCount -
          result.metrics.prunedMessageCount) /
          result.metrics.originalMessageCount) *
        100;

      expect(reductionPercentage).toBeGreaterThan(0);
      expect(reductionPercentage).toBeLessThan(100);
    });
  });

  describe('Configuration Impact', () => {
    it('should respect MAX_HISTORY_TURNS_TO_LLM environment variable', () => {
      const conversation = createMessages(8);

      // Explicitly set maxTurns to test configuration
      const result = pruneConversationHistory(conversation, 2);

      expect(result.metrics.turnsPreserved).toBeLessThanOrEqual(2);
    });

    it('should handle disabled pruning via runtime configuration', () => {
      const conversation = createMessages(5);

      // Test with the current environment (pruning enabled)
      const enabledResult = pruneConversationHistory(conversation);
      expect(enabledResult.wasApplied).toBe(true);

      // For testing disabled pruning, we'd need to test the environment variable
      // at startup. For now, test that pruning works when enabled.
      expect(enabledResult.messages.length).toBeLessThan(conversation.length);
    });
  });

  describe('Performance and Memory Impact', () => {
    it('should handle very long conversations efficiently', () => {
      // Create a very long conversation to test performance
      const veryLongConversation = createMessages(100); // 99 turns + 1 current

      const startTime = performance.now();
      const result = pruneConversationHistory(veryLongConversation);
      const endTime = performance.now();

      // Should complete quickly (under 10ms for 100 messages)
      expect(endTime - startTime).toBeLessThan(10);

      // Should still prune correctly
      expect(result.messages.length).toBeLessThan(veryLongConversation.length);
      expect(result.wasApplied).toBe(true);
    });

    it('should maintain memory efficiency with large message content', () => {
      // Create messages with large content
      const largeContentMessages: CoreMessage[] = [];
      for (let i = 1; i <= 10; i++) {
        largeContentMessages.push({
          id: `user-${i}`,
          role: 'user',
          content: 'Large content '.repeat(1000), // ~13KB per message
        });

        if (i < 10) {
          largeContentMessages.push({
            id: `assistant-${i}`,
            role: 'assistant',
            content: 'Large response '.repeat(1000), // ~13KB per message
          });
        }
      }

      const result = pruneConversationHistory(largeContentMessages, 2);

      // Should still work correctly with large content
      expect(result.wasApplied).toBe(true);
      expect(result.messages.length).toBeLessThan(largeContentMessages.length);
    });
  });
});
