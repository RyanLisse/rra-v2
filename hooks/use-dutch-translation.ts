import { useCallback } from 'react';
import { t, translateDynamic } from '@/lib/translations/dutch';

/**
 * Hook for Dutch translations in RoboRail Assistant
 * Provides simple translation functions for UI elements
 */
export function useDutchTranslation() {
  const translate = useCallback((key: string) => t(key), []);
  
  const translateText = useCallback((text: string) => translateDynamic(text), []);
  
  return {
    t: translate,
    translateText
  };
}