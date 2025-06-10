'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Brain,
  Search,
  FileText,
  Image,
  Table,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface DocumentElement {
  id: string;
  type:
    | 'text'
    | 'table'
    | 'figure'
    | 'header'
    | 'footer'
    | 'list'
    | 'paragraph'
    | 'title';
  content: string;
  pageNumber: number;
  confidence: number;
}

interface DocumentSummary {
  title: string;
  summary: string;
  keyTopics: string[];
  structure: {
    totalPages: number;
    totalElements: number;
    hasTable: boolean;
    hasFigures: boolean;
    hasHeaders: boolean;
    sectionCount: number;
  };
  elements: Array<{
    type: string;
    count: number;
    averageConfidence: number;
  }>;
}

interface AgenticDocumentViewerProps {
  documentId: string;
  documentTitle: string;
  onQueryResult?: (result: any) => void;
}

export function AgenticDocumentViewer({
  documentId,
  documentTitle,
  onQueryResult,
}: AgenticDocumentViewerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  const checkProcessingStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/documents/agentic?action=summary&documentId=${documentId}`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSummary(data.result);
          setIsProcessed(true);
        }
      }
    } catch (error) {
      console.log('Document not yet processed with agentic analysis');
    }
  }, [documentId]);

  useEffect(() => {
    checkProcessingStatus();
  }, [checkProcessingStatus]);

  const processDocument = async () => {
    setIsProcessing(true);
    setError(null);
    setProcessingProgress(0);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProcessingProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const response = await fetch('/api/documents/agentic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          options: {
            generateEmbeddings: true,
            confidenceThreshold: 0.7,
            enableStructuralAnalysis: true,
          },
        }),
      });

      clearInterval(progressInterval);
      setProcessingProgress(100);

      const data = await response.json();

      if (data.success) {
        setIsProcessed(true);
        await checkProcessingStatus(); // Refresh summary
      } else {
        setError(data.error || 'Processing failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Processing failed');
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
    }
  };

  const queryDocument = async () => {
    if (!query.trim()) return;

    setIsQuerying(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/documents/agentic?action=query&documentId=${documentId}&query=${encodeURIComponent(query)}&includeVisualContext=true`,
      );

      const data = await response.json();

      if (data.success) {
        setQueryResult(data.result);
        onQueryResult?.(data.result);
      } else {
        setError(data.error || 'Query failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Query failed');
    } finally {
      setIsQuerying(false);
    }
  };

  const reprocessDocument = async () => {
    setIsProcessed(false);
    setSummary(null);
    setQueryResult(null);
    await processDocument();
  };

  const getElementIcon = (type: string) => {
    switch (type) {
      case 'table':
        return <Table className="h-4 w-4" />;
      case 'figure':
        // eslint-disable-next-line jsx-a11y/alt-text
        return <Image className="h-4 w-4" />;
      case 'title':
      case 'header':
        return <FileText className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Agentic Document Analysis
          </CardTitle>
          <CardDescription>
            Advanced AI-powered document understanding for {documentTitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isProcessed ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This document hasn&apos;t been processed with agentic analysis
                yet. Start processing to unlock advanced features like
                structural analysis, element extraction, and intelligent
                querying.
              </p>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={processingProgress} className="w-full" />
                  <p className="text-sm text-muted-foreground">
                    Processing document with AI analysis...
                  </p>
                </div>
              )}

              <Button
                onClick={processDocument}
                disabled={isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Brain className="mr-2 h-4 w-4" />
                    Start Agentic Analysis
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Document analyzed</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={reprocessDocument}
                disabled={isProcessing}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reprocess
              </Button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Document Summary</CardTitle>
            <CardDescription>{summary.title}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Overview</h4>
              <p className="text-sm text-muted-foreground">{summary.summary}</p>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-2">Key Topics</h4>
              <div className="flex flex-wrap gap-2">
                {summary.keyTopics.map((topic) => (
                  <Badge key={`topic-${topic}`} variant="secondary">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {summary.structure.totalPages}
                </div>
                <div className="text-xs text-muted-foreground">Pages</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {summary.structure.totalElements}
                </div>
                <div className="text-xs text-muted-foreground">Elements</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {summary.structure.sectionCount}
                </div>
                <div className="text-xs text-muted-foreground">Sections</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {summary.structure.hasTable ? '✓' : '✗'}
                </div>
                <div className="text-xs text-muted-foreground">Has Tables</div>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-2">Element Analysis</h4>
              <div className="space-y-2">
                {summary.elements.map((element, index) => (
                  <div
                    key={`element-${element.type}-${index}`}
                    className="flex items-center justify-between p-2 bg-muted rounded"
                  >
                    <div className="flex items-center gap-2">
                      {getElementIcon(element.type)}
                      <span className="text-sm font-medium capitalize">
                        {element.type}
                      </span>
                      <Badge variant="outline">{element.count}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${getConfidenceColor(element.averageConfidence)}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {(element.averageConfidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Query */}
      {isProcessed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Intelligent Document Query
            </CardTitle>
            <CardDescription>
              Ask questions about this document and get AI-powered answers with
              source references
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Ask a question about this document..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && queryDocument()}
                className="flex-1"
              />
              <Button
                onClick={queryDocument}
                disabled={isQuerying || !query.trim()}
              >
                {isQuerying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {queryResult && (
              <div className="space-y-4">
                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">Answer</h4>
                    <Badge
                      variant={
                        queryResult.confidence > 0.7 ? 'default' : 'secondary'
                      }
                    >
                      {(queryResult.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                  </div>
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm">{queryResult.answer}</p>
                  </div>
                </div>

                {queryResult.relevantElements &&
                  queryResult.relevantElements.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Relevant Elements</h4>
                      <div className="space-y-2">
                        {queryResult.relevantElements.map(
                          (element: DocumentElement, index: number) => (
                            <div
                              key={`relevant-${element.id || element.type}-${index}`}
                              className="p-3 border rounded-md"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {getElementIcon(element.type)}
                                  <Badge variant="outline">
                                    {element.type}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    Page {element.pageNumber}
                                  </span>
                                </div>
                                <div
                                  className={`w-2 h-2 rounded-full ${getConfidenceColor(element.confidence)}`}
                                />
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {element.content}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                {queryResult.sources && queryResult.sources.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Sources</h4>
                    <div className="space-y-2">
                      {queryResult.sources.map((source: any, index: number) => (
                        <div
                          key={`source-${source.id || source.elementType}-${index}`}
                          className="p-2 bg-background border rounded text-xs"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {source.elementType}
                            </Badge>
                            <span className="text-muted-foreground">
                              Page {source.pageNumber}
                            </span>
                          </div>
                          <p className="text-muted-foreground">
                            {source.content.substring(0, 100)}...
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
