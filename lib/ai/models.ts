export const DEFAULT_CHAT_MODEL: string = 'grok-2-vision';

export interface ChatModel {
  id: string;
  name: string;
  description: string;
  provider: 'xai' | 'openai' | 'anthropic' | 'google';
  modelId: string;
  capabilities: {
    chat: boolean;
    reasoning: boolean;
    vision: boolean;
    tools: boolean;
  };
  pricing?: {
    inputTokens: number; // per 1M tokens in USD
    outputTokens: number;
  };
  contextWindow: number;
  maxOutput: number;
}

export const chatModels: Array<ChatModel> = [
  // xAI Models
  {
    id: 'grok-2-vision',
    name: 'Grok 2 Vision',
    description: 'Advanced multimodal model with vision capabilities',
    provider: 'xai',
    modelId: 'grok-2-vision-1212',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 2.0, outputTokens: 10.0 },
    contextWindow: 131072,
    maxOutput: 4096,
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    description: 'Fast reasoning model with advanced thinking capabilities',
    provider: 'xai',
    modelId: 'grok-3-mini-beta',
    capabilities: { chat: true, reasoning: true, vision: false, tools: true },
    pricing: { inputTokens: 0.15, outputTokens: 0.75 },
    contextWindow: 131072,
    maxOutput: 4096,
  },
  {
    id: 'grok-2',
    name: 'Grok 2',
    description: 'High-performance text model for complex tasks',
    provider: 'xai',
    modelId: 'grok-2-1212',
    capabilities: { chat: true, reasoning: true, vision: false, tools: true },
    pricing: { inputTokens: 2.0, outputTokens: 10.0 },
    contextWindow: 131072,
    maxOutput: 4096,
  },

  // OpenAI Models
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable multimodal model from OpenAI',
    provider: 'openai',
    modelId: 'gpt-4o',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 2.5, outputTokens: 10.0 },
    contextWindow: 128000,
    maxOutput: 4096,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and efficient model for most tasks',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 0.15, outputTokens: 0.6 },
    contextWindow: 128000,
    maxOutput: 16384,
  },
  {
    id: 'o1-preview',
    name: 'o1 Preview',
    description: 'Advanced reasoning model for complex problems',
    provider: 'openai',
    modelId: 'o1-preview',
    capabilities: { chat: true, reasoning: true, vision: false, tools: false },
    pricing: { inputTokens: 15.0, outputTokens: 60.0 },
    contextWindow: 128000,
    maxOutput: 32768,
  },
  {
    id: 'o1-mini',
    name: 'o1 Mini',
    description: 'Faster reasoning model for simpler tasks',
    provider: 'openai',
    modelId: 'o1-mini',
    capabilities: { chat: true, reasoning: true, vision: false, tools: false },
    pricing: { inputTokens: 3.0, outputTokens: 12.0 },
    contextWindow: 128000,
    maxOutput: 65536,
  },

  // Anthropic Models
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Best balance of intelligence and speed',
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 3.0, outputTokens: 15.0 },
    contextWindow: 200000,
    maxOutput: 8192,
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    description: 'Fastest model for simple tasks',
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-20241022',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 0.8, outputTokens: 4.0 },
    contextWindow: 200000,
    maxOutput: 8192,
  },

  // Google Models
  {
    id: 'gemini-2-flash-exp',
    name: 'Gemini 2.0 Flash Experimental',
    description: 'Latest experimental multimodal model from Google',
    provider: 'google',
    modelId: 'gemini-2.0-flash-exp',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 0.075, outputTokens: 0.3 },
    contextWindow: 1048576,
    maxOutput: 8192,
  },
  {
    id: 'gemini-1-5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Large context window model for complex tasks',
    provider: 'google',
    modelId: 'gemini-1.5-pro',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 1.25, outputTokens: 5.0 },
    contextWindow: 2097152,
    maxOutput: 8192,
  },
  {
    id: 'gemini-1-5-flash',
    name: 'Gemini 1.5 Flash',
    description: 'Fast model with large context window',
    provider: 'google',
    modelId: 'gemini-1.5-flash',
    capabilities: { chat: true, reasoning: true, vision: true, tools: true },
    pricing: { inputTokens: 0.075, outputTokens: 0.3 },
    contextWindow: 1048576,
    maxOutput: 8192,
  },
];

// Backwards compatibility
export const legacyModels = {
  'chat-model': 'grok-2-vision',
  'chat-model-reasoning': 'grok-3-mini',
};
