import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { isTestEnvironment } from '../constants';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.mock';

// Get the preferred provider from environment or default to google
const getProvider = () => {
  if (process.env.OPENAI_API_KEY) {
    return {
      chat: openai('gpt-4o'),
      reasoning: openai('gpt-4o-mini'),
      title: openai('gpt-4o-mini'),
      artifact: openai('gpt-4o'),
    };
  } else if (process.env.ANTHROPIC_API_KEY) {
    return {
      chat: anthropic('claude-3-5-sonnet-20241022'),
      reasoning: anthropic('claude-3-5-haiku-20241022'),
      title: anthropic('claude-3-5-haiku-20241022'),
      artifact: anthropic('claude-3-5-sonnet-20241022'),
    };
  } else if (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    return {
      chat: google('gemini-2.0-flash-exp'),
      reasoning: google('gemini-1.5-flash'),
      title: google('gemini-1.5-flash'),
      artifact: google('gemini-2.0-flash-exp'),
    };
  } else {
    throw new Error(
      'No AI provider API key configured. Please set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY',
    );
  }
};

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
      },
    })
  : (() => {
      const models = getProvider();
      return customProvider({
        languageModels: {
          'chat-model': models.chat,
          'chat-model-reasoning': wrapLanguageModel({
            model: models.reasoning,
            middleware: extractReasoningMiddleware({ tagName: 'think' }),
          }),
          'title-model': models.title,
          'artifact-model': models.artifact,
        },
      });
    })();
