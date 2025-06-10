import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { xai } from '@ai-sdk/xai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { isTestEnvironment } from '../constants';
import { chatModels, type ChatModel, legacyModels } from './models';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
} from './models.mock';

// Provider instances mapping
const providerInstances = {
  xai: xai,
  openai: openai,
  anthropic: anthropic,
  google: google,
};

function createLanguageModel(model: ChatModel) {
  const provider = providerInstances[model.provider];
  if (!provider) {
    throw new Error(`Provider ${model.provider} not available`);
  }

  const baseModel = provider(model.modelId);
  
  // Apply reasoning middleware for capable models with 'reasoning' in their capabilities
  if (model.capabilities.reasoning && (model.id.includes('mini') || model.id.includes('o1'))) {
    return wrapLanguageModel({
      model: baseModel,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    });
  }
  
  return baseModel;
}

// Create dynamic language models mapping
const languageModels = chatModels.reduce((acc, model) => {
  acc[model.id] = createLanguageModel(model);
  return acc;
}, {} as Record<string, any>);

// Add legacy model support
Object.entries(legacyModels).forEach(([legacyId, modernId]) => {
  const modernModel = chatModels.find(m => m.id === modernId);
  if (modernModel) {
    languageModels[legacyId] = createLanguageModel(modernModel);
  }
});

// Add utility models
languageModels['title-model'] = xai('grok-2-1212');
languageModels['artifact-model'] = xai('grok-2-1212');

export const multiProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        'chat-model': chatModel,
        'chat-model-reasoning': reasoningModel,
        'title-model': titleModel,
        'artifact-model': artifactModel,
        ...languageModels,
      },
    })
  : customProvider({
      languageModels,
      imageModels: {
        'small-model': xai.image('grok-2-image'),
        'dall-e-3': openai.image('dall-e-3'),
        'dall-e-2': openai.image('dall-e-2'),
      },
    });

// Backwards compatibility
export const myProvider = multiProvider;
