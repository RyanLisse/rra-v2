import type { UserType } from '@/lib/auth/kinde';
import type { ChatModel } from './models';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
  availableProviders: Array<'xai' | 'openai' | 'anthropic' | 'google'>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account - Limited access to basic models
   */
  guest: {
    maxMessagesPerDay: 20,
    availableChatModelIds: [
      'grok-3-mini',
      'gpt-4o-mini',
      'claude-3-5-haiku',
      'gemini-1-5-flash',
      // Legacy support
      'chat-model',
      'chat-model-reasoning',
    ],
    availableProviders: ['xai', 'openai', 'anthropic', 'google'],
  },

  /*
   * For users with an account - Access to most models
   */
  regular: {
    maxMessagesPerDay: 100,
    availableChatModelIds: [
      // xAI Models
      'grok-2-vision',
      'grok-3-mini',
      'grok-2',
      
      // OpenAI Models
      'gpt-4o',
      'gpt-4o-mini',
      'o1-preview',
      'o1-mini',
      
      // Anthropic Models
      'claude-3-5-sonnet',
      'claude-3-5-haiku',
      
      // Google Models
      'gemini-2-flash-exp',
      'gemini-1-5-pro',
      'gemini-1-5-flash',
      
      // Legacy support
      'chat-model',
      'chat-model-reasoning',
    ],
    availableProviders: ['xai', 'openai', 'anthropic', 'google'],
  },

  /*
   * TODO: For users with an account and a paid membership
   * premium: {
   *   maxMessagesPerDay: 500,
   *   availableChatModelIds: [...all models including experimental],
   *   availableProviders: ['xai', 'openai', 'anthropic', 'google'],
   * },
   */
};
