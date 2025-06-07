'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Filter,
  Calendar,
  FileText,
  Tag,
  Clock,
  X,
  ChevronDown,
  Bookmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SearchFilters {
  dateRange: 'all' | 'today' | 'week' | 'month' | 'custom';
  documentTypes: string[];
  tags: string[];
  author?: string;
  minLength?: number;
  maxLength?: number;
}

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'query' | 'document' | 'tag' | 'history';
  meta?: string;
  icon?: React.ReactNode;
}

interface EnhancedSearchProps {
  placeholder?: string;
  onSearch: (query: string, filters: SearchFilters) => void;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  recentSearches?: string[];
  savedSearches?: Array<{
    id: string;
    name: string;
    query: string;
    filters: SearchFilters;
  }>;
  suggestions?: SearchSuggestion[];
  isLoading?: boolean;
}

export function EnhancedSearch({
  placeholder = 'Search documents and conversations...',
  onSearch,
  onSuggestionSelect,
  recentSearches = [],
  savedSearches = [],
  suggestions = [],
  isLoading = false,
}: EnhancedSearchProps) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    dateRange: 'all',
    documentTypes: [],
    tags: [],
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query.trim(), filters);
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      dateRange: 'all',
      documentTypes: [],
      tags: [],
    });
  };

  const hasActiveFilters =
    filters.dateRange !== 'all' ||
    filters.documentTypes.length > 0 ||
    filters.tags.length > 0;

  const mockSuggestions: SearchSuggestion[] = [
    ...recentSearches.slice(0, 3).map((search) => ({
      id: `recent-${search}`,
      text: search,
      type: 'history' as const,
      icon: <Clock className="h-4 w-4" />,
    })),
    {
      id: 'doc-1',
      text: 'RoboRail Installation Guide',
      type: 'document',
      meta: 'PDF • 2.3MB',
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: 'tag-1',
      text: 'calibration',
      type: 'tag',
      meta: '15 documents',
      icon: <Tag className="h-4 w-4" />,
    },
    ...suggestions,
  ];

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder={placeholder}
          className="pl-10 pr-20"
        />

        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn('h-7 px-2', hasActiveFilters && 'text-primary')}
          >
            <Filter className="h-4 w-4" />
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 h-4 text-xs">
                {filters.documentTypes.length +
                  filters.tags.length +
                  (filters.dateRange !== 'all' ? 1 : 0)}
              </Badge>
            )}
          </Button>

          <Button
            onClick={handleSearch}
            size="sm"
            className="h-7"
            disabled={isLoading || !query.trim()}
          >
            {isLoading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 1,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'linear',
                }}
              >
                <Search className="h-4 w-4" />
              </motion.div>
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Search Suggestions */}
      <AnimatePresence>
        {showSuggestions &&
          (query || recentSearches.length > 0 || savedSearches.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 z-50"
            >
              <Card className="p-2 shadow-lg border">
                {savedSearches.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      Saved Searches
                    </div>
                    {savedSearches.map((saved) => (
                      <button
                        key={saved.id}
                        className="w-full px-2 py-2 text-left hover:bg-muted rounded text-sm flex items-center gap-2"
                        onClick={() => {
                          setQuery(saved.query);
                          setFilters(saved.filters);
                          setShowSuggestions(false);
                        }}
                      >
                        <Bookmark className="h-4 w-4 text-muted-foreground" />
                        <span>{saved.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {mockSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    className="w-full px-2 py-2 text-left hover:bg-muted rounded text-sm flex items-center gap-2"
                    onClick={() => {
                      if (
                        suggestion.type === 'query' ||
                        suggestion.type === 'history'
                      ) {
                        setQuery(suggestion.text);
                      }
                      onSuggestionSelect?.(suggestion);
                      setShowSuggestions(false);
                    }}
                  >
                    {suggestion.icon}
                    <div className="flex-1">
                      <div className="font-medium">{suggestion.text}</div>
                      {suggestion.meta && (
                        <div className="text-xs text-muted-foreground">
                          {suggestion.meta}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </Card>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Advanced Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3"
          >
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Search Filters</h3>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear all
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Date Range */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Date Range
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {filters.dateRange === 'all'
                            ? 'All time'
                            : filters.dateRange === 'today'
                              ? 'Today'
                              : filters.dateRange === 'week'
                                ? 'This week'
                                : filters.dateRange === 'month'
                                  ? 'This month'
                                  : 'Custom'}
                        </div>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {['all', 'today', 'week', 'month'].map((range) => (
                        <DropdownMenuItem
                          key={range}
                          onClick={() =>
                            setFilters({ ...filters, dateRange: range as any })
                          }
                        >
                          {range === 'all'
                            ? 'All time'
                            : range === 'today'
                              ? 'Today'
                              : range === 'week'
                                ? 'This week'
                                : 'This month'}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Document Types */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Document Types
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          {filters.documentTypes.length === 0
                            ? 'All types'
                            : `${filters.documentTypes.length} selected`}
                        </div>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Document Types</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {['PDF', 'DOC', 'TXT', 'Chat'].map((type) => (
                        <DropdownMenuCheckboxItem
                          key={type}
                          checked={filters.documentTypes.includes(type)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFilters({
                                ...filters,
                                documentTypes: [...filters.documentTypes, type],
                              });
                            } else {
                              setFilters({
                                ...filters,
                                documentTypes: filters.documentTypes.filter(
                                  (t) => t !== type,
                                ),
                              });
                            }
                          }}
                        >
                          {type}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Tags</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4" />
                          {filters.tags.length === 0
                            ? 'All tags'
                            : `${filters.tags.length} selected`}
                        </div>
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel>Tags</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {[
                        'calibration',
                        'installation',
                        'troubleshooting',
                        'maintenance',
                      ].map((tag) => (
                        <DropdownMenuCheckboxItem
                          key={tag}
                          checked={filters.tags.includes(tag)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFilters({
                                ...filters,
                                tags: [...filters.tags, tag],
                              });
                            } else {
                              setFilters({
                                ...filters,
                                tags: filters.tags.filter((t) => t !== tag),
                              });
                            }
                          }}
                        >
                          {tag}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Active Filters Display */}
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-2">
                  {filters.dateRange !== 'all' && (
                    <Badge variant="secondary" className="gap-1">
                      {filters.dateRange}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() =>
                          setFilters({ ...filters, dateRange: 'all' })
                        }
                      />
                    </Badge>
                  )}
                  {filters.documentTypes.map((type) => (
                    <Badge key={type} variant="secondary" className="gap-1">
                      {type}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() =>
                          setFilters({
                            ...filters,
                            documentTypes: filters.documentTypes.filter(
                              (t) => t !== type,
                            ),
                          })
                        }
                      />
                    </Badge>
                  ))}
                  {filters.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      #{tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() =>
                          setFilters({
                            ...filters,
                            tags: filters.tags.filter((t) => t !== tag),
                          })
                        }
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SearchResultsProps {
  results: Array<{
    id: string;
    title: string;
    content: string;
    type: 'document' | 'chat' | 'section';
    score: number;
    highlights: string[];
    metadata: {
      author?: string;
      date: string;
      tags: string[];
      source?: string;
    };
  }>;
  query: string;
  isLoading?: boolean;
  onResultClick: (resultId: string) => void;
}

export function SearchResults({
  results,
  query,
  isLoading,
  onResultClick,
}: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-medium mb-2">No results found</h3>
        <p className="text-muted-foreground">
          Try adjusting your search terms or filters
        </p>
      </Card>
    );
  }

  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights.length) return text;

    const regex = new RegExp(`(${highlights.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      highlights.some((h) => h.toLowerCase() === part.toLowerCase()) ? (
        <mark
          key={index}
          className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Found {results.length} results for &ldquo;{query}&rdquo;
      </div>

      {results.map((result) => (
        <motion.div
          key={result.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onResultClick(result.id)}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium">
                    {highlightText(result.title, result.highlights)}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline">{result.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {result.metadata.date}
                    </span>
                    {result.metadata.author && (
                      <span className="text-xs text-muted-foreground">
                        by {result.metadata.author}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {Math.round(result.score * 100)}% match
                </div>
              </div>

              <p className="text-sm text-muted-foreground line-clamp-3">
                {highlightText(result.content, result.highlights)}
              </p>

              {result.metadata.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.metadata.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
