import { smoothStream, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { updateDocumentPrompt } from '@/lib/ai/prompts';
import { 
  retrieveContextAndSources, 
  createStructuredSystemPrompt,
  ELEMENT_TYPE_PRIORITIES 
} from '@/lib/ai/context-formatter';

export const textDocumentHandler = createDocumentHandler<'text'>({
  kind: 'text',
  onCreateDocument: async ({ title, dataStream, session }) => {
    let draftContent = '';

    // Try to retrieve relevant context from user's documents
    let contextualSystemPrompt = 'Write about the given topic. Markdown is supported. Use headings wherever appropriate.';
    let enhancedPrompt = title;

    if (session?.user?.id) {
      try {
        // Retrieve context with prioritization for conceptual content
        const contextResult = await retrieveContextAndSources(title, session.user.id, {
          limit: 8,
          threshold: 0.3,
          prioritizeElementTypes: ELEMENT_TYPE_PRIORITIES.conceptual,
          maxContextTokens: 2000,
        });

        if (contextResult.sources.length > 0) {
          // Create structured system prompt aware of document context
          contextualSystemPrompt = createStructuredSystemPrompt(true) + 
            '\n\nWhen writing about the topic, incorporate relevant information from the provided context documents. Use the structural information to create well-organized content with appropriate headings, tables, and lists where relevant.';
          
          // Enhance the prompt with context
          enhancedPrompt = `Topic: ${title}

RELEVANT CONTEXT DOCUMENTS:
${contextResult.formattedContext}

Please write a comprehensive document about "${title}" incorporating the relevant information from the context documents above. Use markdown formatting with appropriate headings, and cite sources using [Context X] format where appropriate.`;

          // Stream context metadata to client
          dataStream.writeData({
            type: 'sources',
            content: JSON.stringify(contextResult.sources),
          });
        }
      } catch (error) {
        console.warn('Failed to retrieve document context:', error);
        // Fall back to standard creation without context
      }
    }

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: contextualSystemPrompt,
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: enhancedPrompt,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { textDelta } = delta;

        draftContent += textDelta;

        dataStream.writeData({
          type: 'text-delta',
          content: textDelta,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const { fullStream } = streamText({
      model: myProvider.languageModel('artifact-model'),
      system: updateDocumentPrompt(document.content, 'text'),
      experimental_transform: smoothStream({ chunking: 'word' }),
      prompt: description,
      experimental_providerMetadata: {
        openai: {
          prediction: {
            type: 'content',
            content: document.content,
          },
        },
      },
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === 'text-delta') {
        const { textDelta } = delta;

        draftContent += textDelta;
        dataStream.writeData({
          type: 'text-delta',
          content: textDelta,
        });
      }
    }

    return draftContent;
  },
});
