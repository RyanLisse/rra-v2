'use client';

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import type { VectorProviderConfig } from '@/lib/search/types';

// Database provider types
export type DatabaseProviderType = 'neondb' | 'openai' | 'pinecone';

export interface DatabaseProvider {
  id: string;
  name: string;
  description: string;
  type: DatabaseProviderType;
  isAvailable: boolean;
  isConnected: boolean;
  config?: Partial<VectorProviderConfig>;
}

export interface DatabaseContextValue {
  selectedProvider: DatabaseProvider | null;
  availableProviders: DatabaseProvider[];
  switchProvider: (providerId: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
  refreshProviders: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

interface DatabaseProviderProps {
  children: React.ReactNode;
}

// RoboRail-specific database providers configuration
const DEFAULT_PROVIDERS: DatabaseProvider[] = [
  {
    id: 'all_documents',
    name: 'Alle Documenten',
    description: 'Doorzoekt alle beschikbare RoboRail documentatie',
    type: 'neondb',
    isAvailable: true,
    isConnected: false,
  },
  {
    id: 'roborail_manuals',
    name: 'RoboRail Handleidingen',
    description: 'Operators Manual RoboRail V2.2 - volledige systeemhandleiding',
    type: 'neondb',
    isAvailable: true,
    isConnected: false,
  },
  {
    id: 'faq_troubleshooting',
    name: 'FAQ & Probleemoplossing',
    description: 'FAQ documenten en troubleshooting guides',
    type: 'neondb',
    isAvailable: true,
    isConnected: false,
  },
  {
    id: 'calibration_guides',
    name: 'Kalibratie Gidsen',
    description: 'Kalibratie-specifieke documenten en chuck alignment procedures',
    type: 'neondb',
    isAvailable: true,
    isConnected: false,
  },
];

const STORAGE_KEY = 'roborail-selected-database';

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [selectedProvider, setSelectedProvider] = useState<DatabaseProvider | null>(null);
  const [availableProviders, setAvailableProviders] = useState<DatabaseProvider[]>(DEFAULT_PROVIDERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vectorSearchProvider, setVectorSearchProvider] = useState<VectorSearchProvider | null>(null);

  // Refresh provider availability and connection status
  const refreshProviderStatus = useCallback(async (): Promise<DatabaseProvider[]> => {
    try {
      const healthStatus = await vectorSearchFactory.getProvidersHealth();
      
      const updatedProviders = DEFAULT_PROVIDERS.map(provider => {
        const health = healthStatus[provider.id];
        return {
          ...provider,
          isConnected: health?.isHealthy || false,
          isAvailable: provider.isAvailable && (provider.config?.type !== 'openai' || !!process.env.OPENAI_API_KEY),
        };
      });

      setAvailableProviders(updatedProviders);
      return updatedProviders;
    } catch (err) {
      console.error('Failed to refresh provider status:', err);
      return availableProviders;
    }
  }, [availableProviders]);

  // Select and activate a provider
  const selectProvider = useCallback(async (provider: DatabaseProvider): Promise<void> => {
    if (!provider.config) {
      throw new Error(`Provider ${provider.id} has no configuration`);
    }

    try {
      // Validate configuration first
      const validation = vectorSearchFactory.validateProviderConfig(provider.config);
      if (!validation.isValid) {
        throw new Error(`Invalid provider configuration: ${validation.errors.join(', ')}`);
      }

      // Create the vector search provider instance
      const searchProvider = vectorSearchFactory.createProvider(provider.config);
      
      // Validate the provider is working
      const status = await searchProvider.getStatus();
      if (!status.isHealthy) {
        throw new Error(`Provider is not healthy: ${status.error || 'Unknown error'}`);
      }

      // Update state
      setVectorSearchProvider(searchProvider);
      setSelectedProvider({ ...provider, isConnected: true });
      setError(null);

      // Persist selection
      localStorage.setItem(STORAGE_KEY, provider.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Failed to select provider ${provider.id}:`, errorMessage);
      
      // Update provider as disconnected
      setSelectedProvider({ ...provider, isConnected: false });
      setError(errorMessage);
      throw err;
    }
  }, []);

  // Switch to a different provider by ID
  const switchProvider = useCallback(async (providerId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const provider = availableProviders.find(p => p.id === providerId);
      if (!provider) {
        throw new Error(`Provider with ID ${providerId} not found`);
      }

      if (!provider.isAvailable) {
        throw new Error(`Provider ${provider.name} is not available`);
      }

      await selectProvider(provider);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch provider';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [availableProviders, selectProvider]);

  // Get the current vector search provider
  const getVectorSearchProvider = useCallback((): VectorSearchProvider | null => {
    return vectorSearchProvider;
  }, [vectorSearchProvider]);

  // Refresh providers (for manual refresh)
  const refreshProviders = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await refreshProviderStatus();
    } finally {
      setIsLoading(false);
    }
  }, [refreshProviderStatus]);

  // Load saved provider from localStorage on mount
  useEffect(() => {
    const initializeProvider = async () => {
      try {
        const savedProviderId = localStorage.getItem(STORAGE_KEY);
        const providers = await refreshProviderStatus();
        
        // Find saved provider or default to first available
        const targetProvider = savedProviderId 
          ? providers.find(p => p.id === savedProviderId) || providers.find(p => p.isAvailable)
          : providers.find(p => p.isAvailable);

        if (targetProvider) {
          await selectProvider(targetProvider);
        }
      } catch (err) {
        console.error('Failed to initialize database provider:', err);
        setError('Failed to initialize database connection');
      } finally {
        setIsLoading(false);
      }
    };

    initializeProvider();
  }, [refreshProviderStatus, selectProvider]);

  const value: DatabaseContextValue = {
    selectedProvider,
    availableProviders,
    switchProvider,
    isLoading,
    error,
    getVectorSearchProvider,
    refreshProviders,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabaseProvider(): DatabaseContextValue {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabaseProvider must be used within a DatabaseProvider');
  }
  return context;
}

// Helper hook for getting the current vector search provider
export function useVectorSearchProvider(): VectorSearchProvider | null {
  const { getVectorSearchProvider } = useDatabaseProvider();
  return getVectorSearchProvider();
}

// Helper hook for checking if a provider is selected and connected
export function useDatabaseConnection(): {
  isConnected: boolean;
  provider: DatabaseProvider | null;
  error: string | null;
} {
  const { selectedProvider, error } = useDatabaseProvider();
  return {
    isConnected: selectedProvider?.isConnected || false,
    provider: selectedProvider,
    error,
  };
}