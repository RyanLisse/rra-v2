'use client';

import { useState } from 'react';
import { toast } from '@/components/ui/sonner';
import { EnhancedSearch, SearchResults } from '@/components/enhanced-search';
import { useDatabaseSearch } from '@/hooks/use-database-search';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

interface SearchWithDatabaseProps {
  onResultClick?: (resultId: string) => void;
  className?: string;
}

interface SearchFilters {
  dateRange: 'all' | 'today' | 'week' | 'month' | 'custom';
  documentTypes: string[];
  tags: string[];
  author?: string;
  minLength?: number;
  maxLength?: number;
}

export function SearchWithDatabase({ 
  onResultClick,
  className = "" 
}: SearchWithDatabaseProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [lastQuery, setLastQuery] = useState('');
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  
  const { quickSearch, currentDatabase, isSearchAvailable, error } = useDatabaseSearch();

  const handleSearch = async (query: string, filters: SearchFilters) => {
    if (!isSearchAvailable) {
      toast.error('Search is niet beschikbaar. Controleer database verbinding.');
      return;
    }

    setIsSearching(true);
    setLastQuery(query);
    setLastProvider(currentDatabase?.id || null);

    try {
      // Convert filters to the search API format
      const searchOptions = {
        query,
        limit: 10,
        searchType: 'hybrid' as const,
        facets: {
          documentTypes: filters.documentTypes.length > 0 ? filters.documentTypes : undefined,
          dateRange: filters.dateRange !== 'all' ? {
            start: getDateRangeStart(filters.dateRange),
            end: new Date().toISOString(),
          } : undefined,
          sources: undefined,
          elementTypes: filters.tags.length > 0 ? filters.tags : undefined,
        },
      };

      const result = await quickSearch(query);
      
      // Transform results to match the SearchResults component format
      const transformedResults = result.results.map(item => ({
        id: item.id,
        title: item.document.title || item.document.fileName,
        content: item.content,
        type: 'document' as const,
        score: item.score,
        highlights: [query], // Simple highlighting
        metadata: {
          date: new Date().toLocaleDateString(),
          tags: item.elementType ? [item.elementType] : [],
          source: item.document.fileName,
        },
      }));

      setSearchResults(transformedResults);
      
      toast.success(`${transformedResults.length} resultaten gevonden in ${currentDatabase?.name}`);
    } catch (error) {
      console.error('Search error:', error);
      toast.error(`Zoekfout: ${error instanceof Error ? error.message : 'Onbekende fout'}`);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDatabaseChange = (databaseId: string) => {
    // Clear results when database changes
    setSearchResults([]);
    setLastProvider(databaseId);
    toast.success(`Database gewijzigd naar ${databaseId}`);
  };

  const handleResultClick = (resultId: string) => {
    if (onResultClick) {
      onResultClick(resultId);
    } else {
      toast.info(`Opening result: ${resultId}`);
    }
  };

  // Helper function to convert date range to start date
  const getDateRangeStart = (range: string): string => {
    const now = new Date();
    switch (range) {
      case 'today':
        now.setHours(0, 0, 0, 0);
        return now.toISOString();
      case 'week':
        now.setDate(now.getDate() - 7);
        return now.toISOString();
      case 'month':
        now.setMonth(now.getMonth() - 1);
        return now.toISOString();
      default:
        return new Date(0).toISOString();
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Enhanced Search with Database Selector */}
      <EnhancedSearch
        placeholder="Zoek in RoboRail documenten..."
        onSearch={handleSearch}
        onDatabaseChange={handleDatabaseChange}
        isLoading={isSearching}
        showDatabaseSelector={true}
        recentSearches={['calibration setup', 'PMAC communication', 'measurement procedure']}
      />

      {/* Search Status */}
      {!isSearchAvailable && error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="text-red-700">
            <strong>Database Verbindingsprobleem:</strong>
            <div className="mt-1 text-sm">{error}</div>
          </div>
        </Card>
      )}

      {/* Search Metadata */}
      {(lastQuery || lastProvider) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 text-sm text-muted-foreground"
        >
          {lastQuery && (
            <div>
              Laatste zoekopdracht: <strong>&ldquo;{lastQuery}&rdquo;</strong>
            </div>
          )}
          {lastProvider && currentDatabase && (
            <div className="flex items-center gap-2">
              Gezocht in:
              <Badge variant="outline" className="text-xs">
                {currentDatabase.name}
              </Badge>
            </div>
          )}
        </motion.div>
      )}

      {/* Search Results */}
      {(searchResults.length > 0 || isSearching) && (
        <SearchResults
          results={searchResults}
          query={lastQuery}
          isLoading={isSearching}
          onResultClick={handleResultClick}
        />
      )}

      {/* Empty State */}
      {!isSearching && searchResults.length === 0 && lastQuery && (
        <Card className="p-8 text-center">
          <div className="text-muted-foreground">
            <h3 className="font-medium mb-2">Geen resultaten gevonden</h3>
            <p>
              Probeer andere zoektermen of pas de filters aan. 
              Controleer ook of de juiste database is geselecteerd.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}