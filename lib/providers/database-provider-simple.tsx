'use client';

import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';

// Database provider types
export type DatabaseProviderType = 'neondb' | 'openai' | 'pinecone';

export interface DatabaseProvider {
  id: string;
  name: string;
  description: string;
  type: DatabaseProviderType;
  isAvailable: boolean;
  isConnected: boolean;
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
    isConnected: true,
  },
  {
    id: 'roborail_manuals',
    name: 'RoboRail Handleidingen',
    description: 'Operators Manual RoboRail V2.2 - volledige systeemhandleiding',
    type: 'neondb',
    isAvailable: true,
    isConnected: true,
  },
  {
    id: 'faq_troubleshooting',
    name: 'FAQ & Probleemoplossing',
    description: 'FAQ documenten en troubleshooting guides',
    type: 'neondb',
    isAvailable: true,
    isConnected: true,
  },
  {
    id: 'calibration_guides',
    name: 'Kalibratie Gidsen',
    description: 'Kalibratie-specifieke documenten en chuck alignment procedures',
    type: 'neondb',
    isAvailable: true,
    isConnected: true,
  },
  {
    id: 'openai_vector_store',
    name: 'OpenAI Vector Store',
    description: 'OpenAI-powered intelligent document search with advanced semantic understanding',
    type: 'openai',
    isAvailable: !!process.env.OPENAI_API_KEY,
    isConnected: false, // Will be determined at runtime
  },
];

const STORAGE_KEY = 'roborail-selected-database';

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [selectedProvider, setSelectedProvider] = useState<DatabaseProvider | null>(null);
  const [availableProviders, setAvailableProviders] = useState<DatabaseProvider[]>(DEFAULT_PROVIDERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load saved provider from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const provider = availableProviders.find(p => p.id === saved);
        if (provider) {
          setSelectedProvider(provider);
        }
      }
      
      // Default to first provider if none selected
      if (!selectedProvider && availableProviders.length > 0) {
        setSelectedProvider(availableProviders[0]);
      }
    } catch (err) {
      console.error('Failed to load saved provider:', err);
    } finally {
      setIsLoading(false);
    }
  }, [availableProviders, selectedProvider]);

  // Switch to a different provider
  const switchProvider = useCallback(async (providerId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const provider = availableProviders.find(p => p.id === providerId);
      if (!provider) {
        throw new Error(`Provider ${providerId} not found`);
      }

      if (!provider.isAvailable) {
        throw new Error(`Provider ${provider.name} is not available`);
      }

      setSelectedProvider(provider);
      localStorage.setItem(STORAGE_KEY, providerId);
      
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to switch provider:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [availableProviders]);

  // Refresh provider status
  const refreshProviders = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      // In a real implementation, this would check actual provider health
      // For now, we'll simulate all providers being healthy
      const updatedProviders = DEFAULT_PROVIDERS.map(provider => ({
        ...provider,
        isConnected: true,
      }));
      
      setAvailableProviders(updatedProviders);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh providers';
      setError(message);
      console.error('Failed to refresh providers:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const contextValue: DatabaseContextValue = {
    selectedProvider,
    availableProviders,
    switchProvider,
    isLoading,
    error,
    refreshProviders,
  };

  return (
    <DatabaseContext.Provider value={contextValue}>
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