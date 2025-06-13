'use client';

import { useMemo, useCallback } from 'react';
import { useDatabaseProvider } from '@/lib/providers/database-provider-simple';

export interface SearchOptions {
  query: string;
  searchType?: 'vector' | 'hybrid' | 'context-aware' | 'multi-step';
  limit?: number;
  threshold?: number;
}

export interface SearchResult {
  query: string;
  searchType: string;
  results: Array<{
    id: string;
    content: string;
    score: number;
    document: {
      id: string;
      title: string;
      fileName: string;
    };
    chunkIndex: number;
  }>;
  totalResults: number;
  responseTime: number;
}

export interface SearchError {
  type: string;
  message: string;
  details?: any;
}

export function useDatabaseSearch() {
  const { selectedProvider, isLoading: providerLoading, error: providerError } = useDatabaseProvider();

  const isReady = useMemo(() => {
    return !providerLoading && selectedProvider?.isConnected && !providerError;
  }, [providerLoading, selectedProvider, providerError]);

  const search = useCallback(async (options: SearchOptions): Promise<SearchResult> => {
    if (!isReady) {
      throw new Error('Database search is not ready');
    }

    if (!selectedProvider) {
      throw new Error('No database provider selected');
    }

    // In a real implementation, this would call the search API
    // For now, return a mock result
    return {
      query: options.query,
      searchType: options.searchType || 'hybrid',
      results: [],
      totalResults: 0,
      responseTime: 0,
    };
  }, [isReady, selectedProvider]);

  return {
    search,
    isReady,
    isLoading: providerLoading,
    error: providerError,
    selectedProvider,
  };
}