/**
 * Shared Chat Types
 *
 * Centralized type definitions for the chat system to prevent circular dependencies.
 */

/**
 * Chat visibility options
 */
export type VisibilityType = 'private' | 'public';

/**
 * Chat message roles
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Chat status types
 */
export type ChatStatus = 'active' | 'archived' | 'deleted';

/**
 * Chat visibility configuration
 */
export interface VisibilityConfig {
  id: VisibilityType;
  label: string;
  description: string;
  icon: React.ReactNode;
}

/**
 * Chat hook parameters
 */
export interface ChatVisibilityHookParams {
  chatId: string;
  initialVisibilityType: VisibilityType;
}

/**
 * Chat visibility hook return type
 */
export interface ChatVisibilityHookReturn {
  visibilityType: VisibilityType;
  setVisibilityType: (visibility: VisibilityType) => void;
}

/**
 * Chat action parameters
 */
export interface UpdateChatVisibilityParams {
  chatId: string;
  visibility: VisibilityType;
}

/**
 * Chat history item
 */
export interface ChatHistoryItem {
  id: string;
  title: string;
  visibility: VisibilityType;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

/**
 * Chat pagination options
 */
export interface ChatPaginationOptions {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Chat filter options
 */
export interface ChatFilterOptions {
  visibility?: VisibilityType;
  status?: ChatStatus;
  userId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Chat search options
 */
export interface ChatSearchOptions {
  query: string;
  includeMessages?: boolean;
  limit?: number;
  userId?: string;
}

/**
 * Chat export options
 */
export interface ChatExportOptions {
  format: 'json' | 'markdown' | 'txt';
  includeMetadata?: boolean;
  includeSystemMessages?: boolean;
}

/**
 * Default visibility configurations
 */
export const DEFAULT_VISIBILITY_CONFIGS: VisibilityConfig[] = [
  {
    id: 'private',
    label: 'Private',
    description: 'Only you can see this chat',
    icon: null, // Will be filled by component
  },
  {
    id: 'public',
    label: 'Public',
    description: 'Anyone can see this chat',
    icon: null, // Will be filled by component
  },
];

/**
 * Chat configuration defaults
 */
export const CHAT_DEFAULTS = {
  DEFAULT_VISIBILITY: 'private' as VisibilityType,
  DEFAULT_STATUS: 'active' as ChatStatus,
  MAX_TITLE_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 10000,
  DEFAULT_PAGINATION_LIMIT: 20,
} as const;
