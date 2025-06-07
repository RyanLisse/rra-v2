'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  MapPin,
  Tag,
  Clock,
  Target,
  Sparkles,
  BookOpen,
  Hash,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ChatSource } from '@/lib/ai/context-formatter';

interface SourceMetadataDisplayProps {
  sources: ChatSource[];
  maxInitialSources?: number;
  showElementTypes?: boolean;
  showConfidenceScores?: boolean;
  showPageNumbers?: boolean;
  compact?: boolean;
}

export function SourceMetadataDisplay({
  sources,
  maxInitialSources = 3,
  showElementTypes = true,
  showConfidenceScores = true,
  showPageNumbers = true,
  compact = false,
}: SourceMetadataDisplayProps) {
  const [showAllSources, setShowAllSources] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);

  if (!sources || sources.length === 0) {
    return null;
  }

  const displayedSources = showAllSources 
    ? sources 
    : sources.slice(0, maxInitialSources);
  const hasMoreSources = sources.length > maxInitialSources;

  const getElementTypeIcon = (elementType: string | null | undefined) => {
    if (!elementType) return <FileText className="h-3 w-3" />;
    
    switch (elementType.toLowerCase()) {
      case 'title':
        return <Hash className="h-3 w-3" />;
      case 'heading':
        return <BookOpen className="h-3 w-3" />;
      case 'table_text':
        return <Tag className="h-3 w-3" />;
      case 'figure_caption':
        return <Target className="h-3 w-3" />;
      case 'list_item':
        return <Hash className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  const getElementTypeColor = (elementType: string | null | undefined) => {
    if (!elementType) return 'bg-gray-100 text-gray-700';
    
    switch (elementType.toLowerCase()) {
      case 'title':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      case 'heading':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'table_text':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
      case 'figure_caption':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
      case 'list_item':
        return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300';
      case 'paragraph':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const formatElementType = (elementType: string | null | undefined) => {
    if (!elementType) return 'Text';
    return elementType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-1 text-xs">
        <span className="text-muted-foreground">Sources:</span>
        {sources.slice(0, 3).map((source, index) => (
          <Tooltip key={source.id}>
            <TooltipTrigger>
              <Badge 
                variant="outline" 
                className="h-5 text-xs cursor-help"
              >
                {source.title.length > 20 
                  ? `${source.title.substring(0, 20)}...` 
                  : source.title}
                {showPageNumbers && source.pageNumber && (
                  <span className="ml-1 text-muted-foreground">
                    p.{source.pageNumber}
                  </span>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-xs">
                <div className="font-medium">{source.title}</div>
                {source.elementType && (
                  <div className="text-xs text-muted-foreground">
                    {formatElementType(source.elementType)}
                  </div>
                )}
                {source.pageNumber && (
                  <div className="text-xs text-muted-foreground">
                    Page {source.pageNumber}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  Relevance: {Math.round(source.similarity * 100)}%
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {sources.length > 3 && (
          <Badge variant="secondary" className="h-5 text-xs">
            +{sources.length - 3} more
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>Sources ({sources.length})</span>
        </div>
        {hasMoreSources && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllSources(!showAllSources)}
            className="h-6 text-xs"
          >
            {showAllSources ? (
              <>
                Show less <ChevronUp className="h-3 w-3 ml-1" />
              </>
            ) : (
              <>
                Show all <ChevronDown className="h-3 w-3 ml-1" />
              </>
            )}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {displayedSources.map((source, index) => (
          <Card key={source.id} className="p-3 bg-muted/30">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {getElementTypeIcon(source.elementType)}
                  <div className="font-medium text-sm truncate">
                    {source.title}
                  </div>
                  <Badge 
                    variant="secondary" 
                    className="text-xs"
                  >
                    #{index + 1}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  {showElementTypes && source.elementType && (
                    <Badge 
                      className={cn("text-xs", getElementTypeColor(source.elementType))}
                    >
                      {formatElementType(source.elementType)}
                    </Badge>
                  )}
                  
                  {showPageNumbers && source.pageNumber && (
                    <Badge variant="outline" className="text-xs">
                      <MapPin className="h-3 w-3 mr-1" />
                      Page {source.pageNumber}
                    </Badge>
                  )}

                  <Badge variant="outline" className="text-xs">
                    <Target className="h-3 w-3 mr-1" />
                    {Math.round(source.similarity * 100)}% match
                  </Badge>

                  {source.wasReranked && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Reranked
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          Re-ranked for relevance
                          {source.rerankScore && (
                            <div>Score: {source.rerankScore.toFixed(3)}</div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {showConfidenceScores && source.confidence && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs",
                            source.confidence > 0.8 
                              ? "bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-300"
                              : source.confidence > 0.6
                              ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                              : "bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300"
                          )}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          {Math.round(source.confidence * 100)}%
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          Extraction confidence: {source.confidence.toFixed(3)}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {source.tokenCount && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      ~{source.tokenCount} tokens
                    </Badge>
                  )}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedSource(
                    expandedSource === source.id ? null : source.id
                  )}
                  className="h-6 text-xs"
                >
                  {expandedSource === source.id ? (
                    <>
                      Hide preview <ChevronUp className="h-3 w-3 ml-1" />
                    </>
                  ) : (
                    <>
                      Show preview <ChevronDown className="h-3 w-3 ml-1" />
                    </>
                  )}
                </Button>

                <AnimatePresence>
                  {expandedSource === source.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 pt-2 border-t border-border"
                    >
                      <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded border max-h-32 overflow-y-auto">
                        {source.content.length > 300 
                          ? `${source.content.substring(0, 300)}...`
                          : source.content
                        }
                      </div>
                      
                      {source.metadata && Object.keys(source.metadata).length > 0 && (
                        <div className="mt-2 text-xs">
                          <div className="font-medium text-muted-foreground mb-1">
                            Additional metadata:
                          </div>
                          <div className="space-y-1">
                            {Object.entries(source.metadata).map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-muted-foreground">{key}:</span>
                                <span className="text-foreground">
                                  {typeof value === 'object' 
                                    ? JSON.stringify(value)
                                    : String(value)
                                  }
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Compact inline version for use within messages
export function InlineSourcesBadge({ 
  sources, 
  maxSources = 2 
}: { 
  sources: ChatSource[];
  maxSources?: number;
}) {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">Sources:</span>
      {sources.slice(0, maxSources).map((source, index) => (
        <Tooltip key={source.id}>
          <TooltipTrigger>
            <Badge 
              variant="outline" 
              className="h-4 text-xs cursor-help px-1"
            >
              {index + 1}
              {source.pageNumber && (
                <span className="ml-0.5 text-muted-foreground">
                  p{source.pageNumber}
                </span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <div className="max-w-xs">
              <div className="font-medium">{source.title}</div>
              {source.elementType && (
                <div className="text-xs text-muted-foreground">
                  {formatElementType(source.elementType)}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {Math.round(source.similarity * 100)}% relevance
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
      {sources.length > maxSources && (
        <Badge variant="secondary" className="h-4 text-xs px-1">
          +{sources.length - maxSources}
        </Badge>
      )}
    </div>
  );
}

function formatElementType(elementType: string | null | undefined) {
  if (!elementType) return 'Text';
  return elementType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}