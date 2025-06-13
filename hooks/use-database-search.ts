'use client';

import { useMemo, useCallback } from 'react';
import { useDatabaseProvider } from '@/lib/providers/database-provider-simple';

export interface SearchOptions {
  query: string;
  searchType?: 'vector' | 'hybrid' | 'context-aware' | 'multi-step';
  limit?: number;
  threshold?: number;
  trackSearch?: boolean;
  includeAnalytics?: boolean;
  embeddingModel?: 'v3.0' | 'v4.0';
  scoringAlgorithm?: 'weighted' | 'rrf' | 'adaptive';
}

export interface SearchResult {
  query: string;
  searchType: string;
  results: Array<{
    id: string;
    content: string;
    score: number;
    rerankScore?: number;
    document: {
      id: string;
      title: string;
      fileName: string;
    };
    chunkIndex: number;
    elementType?: string;
    pageNumber?: number;
    bbox?: any;
  }>;
  totalResults: number;
  responseTime: number;
  facets?: {
    applied: any;
    available: any;
  };
  analytics?: any;
  performance?: {
    totalResponseTime: number;
    searchTime: number;
    facetTime: number;
    cacheUsed: boolean;
  };
}

export interface SearchError {
  type: string;
  message: string;
  details?: any;
}

export function useDatabaseSearch() {
  const { selectedProvider, isLoading: providerLoading, error: providerError } = useDatabaseProvider();
  const vectorSearchProvider = useVectorSearchProvider();

  // Check if search is available
  const isSearchAvailable = useMemo(() => {
    return (
      !providerLoading &&
      selectedProvider?.isConnected &&
      vectorSearchProvider !== null &&
      !providerError
    );
  }, [providerLoading, selectedProvider, vectorSearchProvider, providerError]);

  // Get current database info
  const currentDatabase = useMemo(() => {
    if (!selectedProvider) return null;
    
    return {
      id: selectedProvider.id,
      name: selectedProvider.name,
      type: selectedProvider.type,
      isConnected: selectedProvider.isConnected,
    };
  }, [selectedProvider]);

  // Search function that uses the current provider
  const search = useCallback(async (options: SearchOptions): Promise<SearchResult> => {
    if (!isSearchAvailable) {
      throw new Error('Search is not available. Please check database connection.');
    }

    if (!vectorSearchProvider) {
      throw new Error('No vector search provider available.');
    }

    try {
      // Add database provider context to the search
      const searchOptionsWithProvider = {
        ...options,
        providerId: selectedProvider?.id,
        providerType: selectedProvider?.type,
      };

      // Call the search API with provider context
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchOptionsWithProvider),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Search failed with status ${response.status}`);
      }

      const result = await response.json();
      return result as SearchResult;
    } catch (error) {
      console.error('Database search error:', error);
      
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred during search');
    }
  }, [isSearchAvailable, vectorSearchProvider, selectedProvider]);

  // Simple search function for basic queries
  const quickSearch = useCallback(async (query: string, limit = 10): Promise<SearchResult> => {
    return search({
      query,
      searchType: 'hybrid',
      limit,
      threshold: 0.3,
      useRerank: true,
      trackSearch: true,
    });
  }, [search]);

  // Advanced search with facets
  const advancedSearch = useCallback(async (
    query: string,
    facets: SearchOptions['facets'],
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult> => {
    return search({
      query,
      searchType: 'hybrid',
      limit: 20,
      threshold: 0.3,
      useRerank: true,
      trackSearch: true,
      facets,
      ...options,
    });
  }, [search]);

  // Context-aware search for chat conversations
  const contextSearch = useCallback(async (
    query: string,
    conversationContext: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    options: Partial<SearchOptions> = {}
  ): Promise<SearchResult> => {
    return search({
      query,
      searchType: 'context-aware',
      limit: 15,
      threshold: 0.3,
      useRerank: true,
      trackSearch: true,
      ...options,
    });
  }, [search]);

  // Get search analytics
  const getAnalytics = useCallback(async (timeRange: 'hour' | 'day' | 'week' | 'month' = 'day') => {
    if (!isSearchAvailable) {
      throw new Error('Analytics not available. Please check database connection.');
    }

    try {
      const response = await fetch(`/api/search?analytics=true&timeRange=${timeRange}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Analytics fetch error:', error);
      throw error;
    }
  }, [isSearchAvailable]);

  return {
    // Search functions
    search,
    quickSearch,
    advancedSearch,
    contextSearch,
    
    // Analytics
    getAnalytics,
    
    // State
    isSearchAvailable,
    isLoading: providerLoading,
    error: providerError,
    currentDatabase,
    
    // Provider info
    selectedProvider,
    vectorSearchProvider,
  };
}

// Helper hook for search status
export function useSearchStatus() {
  const { isSearchAvailable, isLoading, error, currentDatabase } = useDatabaseSearch();
  
  return {
    isAvailable: isSearchAvailable,
    isLoading,
    error,
    statusMessage: error 
      ? `Error: ${error}`
      : !isSearchAvailable 
        ? 'Search not available'
        : `Connected to ${currentDatabase?.name}`,
    database: currentDatabase,
  };
}