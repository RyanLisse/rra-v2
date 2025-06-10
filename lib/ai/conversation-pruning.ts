// Custom message interface for conversation pruning
export interface CoreMessageWithId {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image?: string;
        [key: string]: any;
      }>;
}

// Conditional logger import to avoid server-only issues in tests
let logger: any;
try {
  logger = require('@/lib/monitoring/logger').logger;
} catch {
  // Fallback for tests or environments without logger
  logger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };
}

// Configuration for conversation history pruning
export function getConversationPruningConfig() {
  return {
    // Maximum number of conversation turns to keep (user + assistant pairs)
    MAX_HISTORY_TURNS: Number.parseInt(
      process.env.MAX_HISTORY_TURNS_TO_LLM || '3',
    ),

    // Whether to always preserve the first conversation turn
    PRESERVE_FIRST_TURN: process.env.PRESERVE_FIRST_TURN === 'true',

    // Whether pruning is enabled globally
    ENABLED: process.env.CONVERSATION_PRUNING_ENABLED !== 'false',
  };
}

// Export static config for backward compatibility
export const CONVERSATION_PRUNING_CONFIG = getConversationPruningConfig();

interface PruningMetrics {
  originalMessageCount: number;
  prunedMessageCount: number;
  turnsPreserved: number;
  systemMessagesFiltered: number;
}

export interface PruningResult {
  messages: CoreMessageWithId[];
  metrics: PruningMetrics;
  wasApplied: boolean;
}

/**
 * Prune conversation history to manage token limits and improve performance
 *
 * @param messages - Array of conversation messages
 * @param maxTurns - Maximum number of conversation turns to preserve
 * @param preserveFirstTurn - Whether to always keep the first user/assistant turn
 * @returns Pruned messages with metrics
 */
export function pruneConversationHistory(
  messages: CoreMessageWithId[],
  maxTurns?: number,
  preserveFirstTurn?: boolean,
): PruningResult {
  const config = getConversationPruningConfig();
  const finalMaxTurns = maxTurns ?? config.MAX_HISTORY_TURNS;
  const finalPreserveFirstTurn =
    preserveFirstTurn ?? config.PRESERVE_FIRST_TURN;
  const originalCount = messages.length;

  // If pruning is disabled or messages are already short, return as-is
  if (!config.ENABLED || messages.length === 0) {
    return {
      messages: messages.filter((m) => m.role !== 'system'), // Still filter system messages
      metrics: {
        originalMessageCount: originalCount,
        prunedMessageCount: messages.filter((m) => m.role !== 'system').length,
        turnsPreserved: 0,
        systemMessagesFiltered: messages.filter((m) => m.role === 'system')
          .length,
      },
      wasApplied: false,
    };
  }

  const prunedMessages: CoreMessageWithId[] = [];
  let turnsPreserved = 0;
  let systemMessagesFiltered = 0;

  // Filter out system messages from client (we manage our own system prompt)
  const nonSystemMessages = messages.filter((message) => {
    if (message.role === 'system') {
      systemMessagesFiltered++;
      return false;
    }
    return true;
  });

  if (nonSystemMessages.length === 0) {
    return {
      messages: [],
      metrics: {
        originalMessageCount: originalCount,
        prunedMessageCount: 0,
        turnsPreserved: 0,
        systemMessagesFiltered,
      },
      wasApplied: true,
    };
  }

  // Get the current user message (should be the last message)
  const currentUserMessage = nonSystemMessages[nonSystemMessages.length - 1];

  // If there's only one message, return it
  if (nonSystemMessages.length === 1) {
    return {
      messages:
        currentUserMessage?.role === 'user'
          ? [currentUserMessage]
          : nonSystemMessages,
      metrics: {
        originalMessageCount: originalCount,
        prunedMessageCount: 1,
        turnsPreserved: 0,
        systemMessagesFiltered,
      },
      wasApplied: true,
    };
  }

  // Collect conversation turns (user/assistant pairs) working backwards
  let messageIndex = nonSystemMessages.length - 2; // Start from second to last message
  const collectedTurns: CoreMessageWithId[][] = [];

  while (messageIndex >= 0 && turnsPreserved < finalMaxTurns) {
    // Look for assistant message
    if (
      nonSystemMessages[messageIndex]?.role === 'assistant' &&
      messageIndex > 0
    ) {
      const assistantMessage = nonSystemMessages[messageIndex];
      const userMessage = nonSystemMessages[messageIndex - 1];

      // Verify this is a proper user/assistant turn
      if (userMessage?.role === 'user') {
        collectedTurns.unshift([userMessage, assistantMessage]);
        turnsPreserved++;
        messageIndex -= 2; // Move to potential previous turn
      } else {
        messageIndex--; // Skip this message and continue
      }
    } else {
      messageIndex--; // Skip this message and continue
    }
  }

  // Optional: Always preserve the first turn if requested and available
  if (finalPreserveFirstTurn && nonSystemMessages.length >= 2) {
    const firstUserMessage = nonSystemMessages.find((m) => m.role === 'user');
    if (firstUserMessage) {
      const firstUserIndex = nonSystemMessages.indexOf(firstUserMessage);
      const potentialAssistantMessage = nonSystemMessages[firstUserIndex + 1];

      if (potentialAssistantMessage?.role === 'assistant') {
        const firstTurn = [firstUserMessage, potentialAssistantMessage];

        // Only add if it's not already in collectedTurns
        const isAlreadyIncluded = collectedTurns.some(
          (turn) => turn[0].id === firstUserMessage.id,
        );

        if (!isAlreadyIncluded) {
          collectedTurns.unshift(firstTurn);
          turnsPreserved++;
        }
      }
    }
  }

  // Assemble final message list
  for (const turn of collectedTurns) {
    prunedMessages.push(...turn);
  }

  // Add the current user message
  if (currentUserMessage?.role === 'user') {
    prunedMessages.push(currentUserMessage);
  }

  const finalCount = prunedMessages.length;

  // Log pruning activity for monitoring
  if (originalCount > finalCount + systemMessagesFiltered) {
    logger.info(
      {
        originalMessageCount: originalCount,
        prunedMessageCount: finalCount,
        turnsPreserved,
        systemMessagesFiltered,
        maxTurns: finalMaxTurns,
        preserveFirstTurn: finalPreserveFirstTurn,
      },
      'Conversation history pruned',
    );
  }

  return {
    messages: prunedMessages,
    metrics: {
      originalMessageCount: originalCount,
      prunedMessageCount: finalCount,
      turnsPreserved,
      systemMessagesFiltered,
    },
    wasApplied: true,
  };
}

/**
 * Estimate token count for messages (rough approximation)
 * Useful for token-budget based pruning in the future
 */
export function estimateTokenCount(messages: CoreMessageWithId[]): number {
  return messages.reduce((total, message) => {
    const content =
      typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
    // Rough approximation: 4 characters per token
    return total + Math.ceil(content.length / 4);
  }, 0);
}

/**
 * Advanced pruning strategy that considers token budget
 * For future implementation when more sophisticated pruning is needed
 */
export function pruneByTokenBudget(
  messages: CoreMessageWithId[],
  maxTokens = 4000,
): PruningResult {
  // Placeholder for token-budget based pruning
  // For now, fall back to turn-based pruning
  const estimatedTokens = estimateTokenCount(messages);

  if (estimatedTokens <= maxTokens) {
    return {
      messages: messages.filter((m) => m.role !== 'system'),
      metrics: {
        originalMessageCount: messages.length,
        prunedMessageCount: messages.filter((m) => m.role !== 'system').length,
        turnsPreserved: 0,
        systemMessagesFiltered: messages.filter((m) => m.role === 'system')
          .length,
      },
      wasApplied: false,
    };
  }

  // Use turn-based pruning as fallback, adjusting turns based on token overage
  const config = getConversationPruningConfig();
  const tokenOverageRatio = estimatedTokens / maxTokens;
  const adjustedMaxTurns = Math.max(
    1,
    Math.floor(config.MAX_HISTORY_TURNS / tokenOverageRatio),
  );

  return pruneConversationHistory(messages, adjustedMaxTurns);
}

/**
 * Get pruning statistics for monitoring and debugging
 */
export function getPruningStats(result: PruningResult): Record<string, number> {
  const { metrics } = result;
  const reductionPercentage =
    metrics.originalMessageCount > 0
      ? ((metrics.originalMessageCount - metrics.prunedMessageCount) /
          metrics.originalMessageCount) *
        100
      : 0;

  return {
    originalMessages: metrics.originalMessageCount,
    prunedMessages: metrics.prunedMessageCount,
    reductionPercentage: Math.round(reductionPercentage * 100) / 100,
    turnsPreserved: metrics.turnsPreserved,
    systemMessagesFiltered: metrics.systemMessagesFiltered,
  };
}
