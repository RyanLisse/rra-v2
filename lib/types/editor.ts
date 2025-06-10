/**
 * Shared Editor Types
 *
 * Centralized type definitions for the editor system to prevent circular dependencies.
 */

import type { Suggestion } from '@/lib/db/schema';
import type { ArtifactKind } from '@/lib/types/artifacts';

/**
 * Extended suggestion interface with selection information
 */
export interface UISuggestion extends Suggestion {
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Text position in document
 */
export interface Position {
  start: number;
  end: number;
}

/**
 * Editor suggestion props
 */
export interface SuggestionProps {
  suggestion: UISuggestion;
  onApply: () => void;
  artifactKind: ArtifactKind;
}

/**
 * Suggestion plugin configuration
 */
export interface SuggestionPluginConfig {
  suggestions: UISuggestion[];
  onApplySuggestion?: (suggestion: UISuggestion) => void;
  artifactKind?: ArtifactKind;
}

/**
 * Suggestion state
 */
export interface SuggestionState {
  suggestions: UISuggestion[];
  activeSuggestion: UISuggestion | null;
  isVisible: boolean;
}

/**
 * Suggestion action types
 */
export type SuggestionAction =
  | { type: 'SET_SUGGESTIONS'; payload: UISuggestion[] }
  | { type: 'SET_ACTIVE_SUGGESTION'; payload: UISuggestion | null }
  | { type: 'TOGGLE_VISIBILITY'; payload?: boolean }
  | { type: 'APPLY_SUGGESTION'; payload: UISuggestion }
  | { type: 'DISMISS_SUGGESTION'; payload: UISuggestion }
  | { type: 'CLEAR_SUGGESTIONS' };

/**
 * Suggestion context
 */
export interface SuggestionContext {
  state: SuggestionState;
  dispatch: (action: SuggestionAction) => void;
  applySuggestion: (suggestion: UISuggestion) => void;
  dismissSuggestion: (suggestion: UISuggestion) => void;
  clearAllSuggestions: () => void;
}

/**
 * Suggestion filter options
 */
export interface SuggestionFilterOptions {
  byType?: string;
  byPriority?: 'high' | 'medium' | 'low';
  excludeApplied?: boolean;
  maxResults?: number;
}

/**
 * Suggestion generation options
 */
export interface SuggestionGenerationOptions {
  contextLength?: number;
  includeFormatting?: boolean;
  suggestionTypes?: string[];
  maxSuggestions?: number;
}

/**
 * Default suggestion configuration
 */
export const SUGGESTION_DEFAULTS = {
  MAX_SUGGESTIONS: 10,
  DEFAULT_CONTEXT_LENGTH: 100,
  SUGGESTION_TIMEOUT: 5000,
  AUTO_APPLY_THRESHOLD: 0.9,
} as const;

/**
 * Suggestion priority levels
 */
export const SUGGESTION_PRIORITIES = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

/**
 * Suggestion types
 */
export const SUGGESTION_TYPES = {
  GRAMMAR: 'grammar',
  STYLE: 'style',
  CONTENT: 'content',
  FORMATTING: 'formatting',
  STRUCTURE: 'structure',
} as const;
