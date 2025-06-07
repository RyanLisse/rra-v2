'use client';

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Copy } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  getDocumentDetails,
  type DocumentDetailView,
} from '@/app/(chat)/documents/actions';

interface DocumentDetailProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
}

const statusConfig = {
  uploaded: {
    label: 'Uploaded',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  },
  processing: {
    label: 'Processing',
    color:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  },
  text_extracted: {
    label: 'Text Extracted',
    color:
      'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  },
  chunked: {
    label: 'Chunked',
    color:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  },
  embedded: {
    label: 'Embedded',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  },
  processed: {
    label: 'Ready',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  },
  error: {
    label: 'Error',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  },
};

export function DocumentDetail({
  documentId,
  isOpen,
  onClose,
}: DocumentDetailProps) {
  const [document, setDocument] = useState<DocumentDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<
    'overview' | 'content' | 'chunks'
  >('overview');
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && documentId) {
      loadDocumentDetails();
    }
  }, [isOpen, documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDocumentDetails = async () => {
    setLoading(true);
    try {
      const details = await getDocumentDetails(documentId);
      if (details) {
        setDocument(details);
      } else {
        toast.error('Failed to load document details');
        onClose();
      }
    } catch (error) {
      console.error('Error loading document details:', error);
      toast.error('Failed to load document details');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (sizeStr: string): string => {
    const size = Number.parseInt(sizeStr);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const copyToClipboard = async (text: string, chunkId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedChunkId(chunkId);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedChunkId(null), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const downloadDocument = () => {
    if (!document) return;
    // In a real implementation, this would trigger a download of the original PDF
    toast.info('Download functionality not implemented yet');
  };

  const content = loading ? (
    <div className="space-y-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  ) : document ? (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{document.originalName}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{formatFileSize(document.fileSize)}</span>
              <span>•</span>
              <span>
                Uploaded {formatDistanceToNow(new Date(document.createdAt))} ago
              </span>
            </div>
          </div>
          <Badge
            className={
              statusConfig[document.status as keyof typeof statusConfig]
                ?.color || ''
            }
          >
            {statusConfig[document.status as keyof typeof statusConfig]
              ?.label || document.status}
          </Badge>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadDocument}
            disabled={document.status === 'processing'}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      {/* Section Buttons */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeSection === 'overview' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveSection('overview')}
        >
          Overview
        </Button>
        <Button
          variant={activeSection === 'content' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveSection('content')}
          disabled={!document.hasContent}
        >
          Content
        </Button>
        <Button
          variant={activeSection === 'chunks' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveSection('chunks')}
          disabled={document.chunkCount === 0}
        >
          Chunks ({document.chunkCount})
        </Button>
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Document Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">File Name:</span>
                <span className="font-mono">{document.fileName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">MIME Type:</span>
                <span>{document.mimeType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span>{document.status}</span>
              </div>
              {document.pageCount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pages:</span>
                  <span>{document.pageCount}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chunks:</span>
                <span>{document.chunkCount}</span>
              </div>
            </CardContent>
          </Card>

          {document.metadata && Object.keys(document.metadata).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(document.metadata, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Content Section */}
      {activeSection === 'content' && (
        <div className="space-y-4">
          {document.extractedText ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extracted Text</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] w-full rounded-md border p-4 overflow-auto">
                  <pre className="whitespace-pre-wrap text-sm">
                    {document.extractedText}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No text content available
            </div>
          )}
        </div>
      )}

      {/* Chunks Section */}
      {activeSection === 'chunks' && (
        <div className="space-y-4">
          {document.chunks && document.chunks.length > 0 ? (
            <div className="h-[400px] w-full overflow-auto">
              <div className="space-y-4">
                {document.chunks.map((chunk) => (
                  <Card key={chunk.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          Chunk {chunk.chunkIndex}
                          {chunk.tokenCount && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({chunk.tokenCount} tokens)
                            </span>
                          )}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(chunk.content, chunk.id)
                          }
                        >
                          {copiedChunkId === chunk.id ? (
                            <>
                              <Check className="h-3 w-3 mr-1" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">
                        {chunk.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No chunks available
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Document Details</SheetTitle>
        </SheetHeader>
        <div className="mt-6">{content}</div>
      </SheetContent>
    </Sheet>
  );
}

// Add missing import
import { Check } from 'lucide-react';
