'use client';

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatSource } from '@/lib/ai/context-formatter';

interface SourceData {
  type: 'sources';
  sources: ChatSource[];
  searchStats?: any;
}

/**
 * Hook to handle source data from chat streams and attach them to messages
 */
export function useSources({
  data,
  messages,
  setMessages,
}: {
  data: any[] | undefined;
  messages: UIMessage[];
  setMessages: UseChatHelpers['setMessages'];
}) {
  const lastProcessedIndex = useRef(-1);
  const pendingSources = useRef<ChatSource[] | null>(null);

  useEffect(() => {
    if (!data?.length) return;

    // Process new data stream items
    const newData = data.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = data.length - 1;

    newData.forEach((item) => {
      if (item && typeof item === 'object' && item.type === 'sources') {
        const sourceData = item as SourceData;
        pendingSources.current = sourceData.sources;

        // Find the latest assistant message and attach sources to it
        const latestAssistantMessageIndex = messages
          .map((msg, index) => ({ msg, index }))
          .filter(({ msg }) => msg.role === 'assistant')
          .pop()?.index;

        if (latestAssistantMessageIndex !== undefined) {
          setMessages((currentMessages) => {
            const updatedMessages = [...currentMessages];
            const targetMessage = updatedMessages[latestAssistantMessageIndex];

            if (targetMessage && targetMessage.role === 'assistant') {
              updatedMessages[latestAssistantMessageIndex] = {
                ...targetMessage,
                sources: sourceData.sources,
              } as UIMessage & { sources: ChatSource[] };
            }

            return updatedMessages;
          });

          // Clear pending sources since we've attached them
          pendingSources.current = null;
        }
      }
    });
  }, [data, messages, setMessages]);

  // If we have pending sources and a new assistant message appears, attach them
  useEffect(() => {
    if (!pendingSources.current) return;

    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.role === 'assistant') {
      setMessages((currentMessages) => {
        const updatedMessages = [...currentMessages];
        const lastIndex = updatedMessages.length - 1;

        updatedMessages[lastIndex] = {
          ...updatedMessages[lastIndex],
          sources: pendingSources.current,
        } as UIMessage & { sources: ChatSource[] };

        return updatedMessages;
      });

      pendingSources.current = null;
    }
  }, [messages, setMessages]);
}
