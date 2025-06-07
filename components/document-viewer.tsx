'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Search, 
  BookOpen, 
  Bookmark,
  MessageSquare,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Highlight {
  id: string;
  startIndex: number;
  endIndex: number;
  text: string;
  color: string;
  note?: string;
  timestamp: Date;
  author?: string;
}

interface Annotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  type: 'note' | 'question' | 'important';
  timestamp: Date;
  author?: string;
}

interface DocumentSection {
  id: string;
  title: string;
  startPage?: number;
  endPage?: number;
  content: string;
  level: number;
}

interface DocumentViewerProps {
  document: {
    id: string;
    title: string;
    content: string;
    type: 'pdf' | 'text' | 'markdown';
    pageCount?: number;
    sections?: DocumentSection[];
  };
  highlights?: Highlight[];
  annotations?: Annotation[];
  onHighlight?: (highlight: Omit<Highlight, 'id' | 'timestamp'>) => void;
  onAnnotate?: (annotation: Omit<Annotation, 'id' | 'timestamp'>) => void;
  onSearchTermFound?: (term: string, results: number) => void;
  readOnly?: boolean;
  showTOC?: boolean;
}

export function DocumentViewer({
  document,
  highlights = [],
  annotations = [],
  onHighlight,
  onAnnotate,
  onSearchTermFound,
  readOnly = false,
  showTOC = true
}: DocumentViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ index: number; length: number }>>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [showHighlightTools, setShowHighlightTools] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  
  const contentRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Search functionality
  const performSearch = useCallback((term: string) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }

    const content = document.content.toLowerCase();
    const searchTerm = term.toLowerCase();
    const results: Array<{ index: number; length: number }> = [];
    
    let index = content.indexOf(searchTerm);
    while (index !== -1) {
      results.push({ index, length: term.length });
      index = content.indexOf(searchTerm, index + 1);
    }
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
    onSearchTermFound?.(term, results.length);
  }, [document.content, onSearchTermFound]);

  // Handle text selection for highlighting
  const handleTextSelection = () => {
    if (readOnly) return;
    
    const selection = window.getSelection();
    if (selection?.toString().trim()) {
      setSelectedText(selection.toString().trim());
      setShowHighlightTools(true);
    } else {
      setShowHighlightTools(false);
      setSelectedText('');
    }
  };

  // Create highlight
  const createHighlight = (color: string) => {
    const selection = window.getSelection();
    if (!selection || !selectedText || !onHighlight) return;

    const range = selection.getRangeAt(0);
    const startIndex = range.startOffset;
    const endIndex = range.endOffset;

    onHighlight({
      startIndex,
      endIndex,
      text: selectedText,
      color,
      author: 'Current User' // This should come from auth context
    });

    setShowHighlightTools(false);
    setSelectedText('');
    selection.removeAllRanges();
  };

  // Render content with highlights and search results
  const renderContentWithHighlights = (content: string) => {
    let renderedContent = content;
    const allMarkers: Array<{ index: number; type: 'highlight' | 'search'; data: any }> = [];

    // Add highlights
    highlights.forEach(highlight => {
      allMarkers.push({
        index: highlight.startIndex,
        type: 'highlight',
        data: { ...highlight, isStart: true }
      });
      allMarkers.push({
        index: highlight.endIndex,
        type: 'highlight',
        data: { ...highlight, isStart: false }
      });
    });

    // Add search results
    searchResults.forEach((result, index) => {
      allMarkers.push({
        index: result.index,
        type: 'search',
        data: { ...result, isStart: true, isCurrent: index === currentSearchIndex }
      });
      allMarkers.push({
        index: result.index + result.length,
        type: 'search',
        data: { ...result, isStart: false, isCurrent: index === currentSearchIndex }
      });
    });

    // Sort markers by index
    allMarkers.sort((a, b) => a.index - b.index);

    // Apply markers
    let offset = 0;
    allMarkers.forEach(marker => {
      const position = marker.index + offset;
      
      if (marker.type === 'highlight') {
        const tag = marker.data.isStart 
          ? `<mark class="highlight" style="background-color: ${marker.data.color}; cursor: pointer;" data-highlight-id="${marker.data.id}">`
          : '</mark>';
        renderedContent = renderedContent.slice(0, position) + tag + renderedContent.slice(position);
        offset += tag.length;
      } else if (marker.type === 'search') {
        const className = marker.data.isCurrent ? 'search-current' : 'search-result';
        const tag = marker.data.isStart 
          ? `<span class="${className}">`
          : '</span>';
        renderedContent = renderedContent.slice(0, position) + tag + renderedContent.slice(position);
        offset += tag.length;
      }
    });

    return renderedContent;
  };

  useEffect(() => {
    if (searchTerm) {
      performSearch(searchTerm);
    } else {
      setSearchResults([]);
    }
  }, [searchTerm, performSearch]);

  return (
    <div 
      ref={viewerRef}
      className={cn(
        "flex h-full bg-background border rounded-lg overflow-hidden",
        isFullscreen && "fixed inset-0 z-50 rounded-none"
      )}
    >
      {/* Table of Contents */}
      {showTOC && document.sections && (
        <div className="w-64 border-r bg-muted/30 flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Contents
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {document.sections.map((section) => (
              <button
                key={section.id}
                className={cn(
                  "w-full text-left p-2 rounded text-sm hover:bg-muted transition-colors",
                  `ml-${section.level * 4}`,
                  activeSection === section.id && "bg-primary text-primary-foreground"
                )}
                onClick={() => setActiveSection(section.id)}
              >
                {section.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Document Area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="border-b bg-background p-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="font-medium truncate max-w-xs">{document.title}</h2>
            <Badge variant="outline">{document.type.toUpperCase()}</Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search in document..."
                className="pl-8 w-48"
              />
              {searchResults.length > 0 && (
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {currentSearchIndex + 1}/{searchResults.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setCurrentSearchIndex(Math.max(0, currentSearchIndex - 1))}
                    disabled={currentSearchIndex === 0}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setCurrentSearchIndex(Math.min(searchResults.length - 1, currentSearchIndex + 1))}
                    disabled={currentSearchIndex === searchResults.length - 1}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoomLevel(Math.max(50, zoomLevel - 10))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-mono w-12 text-center">{zoomLevel}%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoomLevel(Math.min(200, zoomLevel + 10))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Actions */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Bookmark className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add bookmark</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ask about this document</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Document Content */}
        <div className="flex-1 overflow-auto p-6 relative">
          <div
            ref={contentRef}
            className="max-w-4xl mx-auto prose prose-sm dark:prose-invert"
            style={{ 
              fontSize: `${zoomLevel}%`,
              lineHeight: 1.6
            }}
            onMouseUp={handleTextSelection}
            dangerouslySetInnerHTML={{
              __html: renderContentWithHighlights(document.content)
            }}
          />

          {/* Highlight Tools */}
          <AnimatePresence>
            {showHighlightTools && !readOnly && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute z-10 bg-background border shadow-lg rounded-lg p-3"
                style={{
                  top: window.getSelection()?.getRangeAt(0)?.getBoundingClientRect().bottom || 0,
                  left: window.getSelection()?.getRangeAt(0)?.getBoundingClientRect().left || 0,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Highlight:</span>
                  {['#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#f3e8ff'].map((color) => (
                    <button
                      key={color}
                      className="w-6 h-6 rounded border-2 border-border hover:border-foreground"
                      style={{ backgroundColor: color }}
                      onClick={() => createHighlight(color)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Annotations */}
          {annotations.map((annotation) => (
            <div
              key={annotation.id}
              className="absolute bg-yellow-200 dark:bg-yellow-800 border border-yellow-400 rounded p-2 max-w-xs shadow-lg"
              style={{
                left: annotation.x,
                top: annotation.y,
                width: annotation.width,
                height: annotation.height
              }}
            >
              <div className="text-xs font-medium mb-1 capitalize">
                {annotation.type}
              </div>
              <div className="text-sm">{annotation.content}</div>
              {annotation.author && (
                <div className="text-xs text-muted-foreground mt-1">
                  by {annotation.author}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Page Navigation (for PDFs) */}
        {document.type === 'pdf' && document.pageCount && (
          <div className="border-t p-3 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            
            <div className="flex items-center gap-2">
              <span className="text-sm">Page</span>
              <Input
                type="number"
                value={currentPage}
                onChange={(e) => setCurrentPage(Math.max(1, Math.min(document.pageCount!, Number.parseInt(e.target.value) || 1)))}
                className="w-16 text-center"
                min={1}
                max={document.pageCount}
              />
              <span className="text-sm">of {document.pageCount}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(document.pageCount!, currentPage + 1))}
              disabled={currentPage === document.pageCount}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// Document thumbnail component for document lists
export function DocumentThumbnail({
  document,
  onClick,
  className
}: {
  document: { id: string; title: string; type: string; preview?: string };
  onClick: () => void;
  className?: string;
}) {
  return (
    <Card 
      className={cn("p-3 cursor-pointer hover:shadow-md transition-shadow", className)}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{document.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {document.type.toUpperCase()}
            </Badge>
          </div>
          {document.preview && (
            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {document.preview}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}