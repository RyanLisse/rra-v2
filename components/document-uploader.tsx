'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, XCircle, Clock } from 'lucide-react';

interface UploadedFile {
  documentId: string;
  originalName: string;
  fileName: string;
  size: number;
  status:
    | 'uploaded'
    | 'processing'
    | 'text_extracted'
    | 'chunked'
    | 'embedded'
    | 'processed'
    | 'error';
}

interface ProcessingFile extends UploadedFile {
  progress: number;
  error?: string;
}

export function DocumentUploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<ProcessingFile[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter((file) => {
      if (file.type !== 'application/pdf') {
        toast.error(`${file.name} is not a PDF file`);
        return false;
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 50MB limit`);
        return false;
      }
      return true;
    });

    setFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);
    const formData = new FormData();

    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      toast.success(result.message);

      // Start processing uploaded files
      const uploadedFiles: UploadedFile[] = result.files;
      setProcessing(uploadedFiles.map((file) => ({ ...file, progress: 0 })));
      setFiles([]);

      // Process each file through the full pipeline
      for (const file of uploadedFiles) {
        await processDocument(file);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const processDocument = async (file: UploadedFile) => {
    // Update progress to show processing started
    setProcessing((prev) =>
      prev.map((f) =>
        f.documentId === file.documentId
          ? { ...f, status: 'processing', progress: 25 }
          : f,
      ),
    );

    try {
      // Step 1: Text extraction
      const extractResponse = await fetch('/api/documents/extract-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId: file.documentId }),
      });

      const extractResult = await extractResponse.json();

      if (!extractResponse.ok) {
        throw new Error(extractResult.error || 'Text extraction failed');
      }

      // Update progress
      setProcessing((prev) =>
        prev.map((f) =>
          f.documentId === file.documentId
            ? { ...f, status: 'processing', progress: 50 }
            : f,
        ),
      );

      // Step 2: Chunking
      const chunkResponse = await fetch('/api/documents/chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId: file.documentId }),
      });

      const chunkResult = await chunkResponse.json();

      if (!chunkResponse.ok) {
        throw new Error(chunkResult.error || 'Chunking failed');
      }

      // Update progress
      setProcessing((prev) =>
        prev.map((f) =>
          f.documentId === file.documentId
            ? { ...f, status: 'processing', progress: 75 }
            : f,
        ),
      );

      // Step 3: Embedding generation
      const embedResponse = await fetch('/api/documents/embed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId: file.documentId }),
      });

      const embedResult = await embedResponse.json();

      if (!embedResponse.ok) {
        throw new Error(embedResult.error || 'Embedding generation failed');
      }

      // Update to completed
      setProcessing((prev) =>
        prev.map((f) =>
          f.documentId === file.documentId
            ? { ...f, status: 'processed', progress: 100 }
            : f,
        ),
      );

      toast.success(`Successfully processed ${file.originalName}`);
    } catch (error) {
      console.error('Document processing error:', error);

      // Update to error state
      setProcessing((prev) =>
        prev.map((f) =>
          f.documentId === file.documentId
            ? {
                ...f,
                status: 'error',
                progress: 100,
                error:
                  error instanceof Error
                    ? error.message
                    : 'Document processing failed',
              }
            : f,
        ),
      );

      toast.error(`Failed to process ${file.originalName}`);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'text_extracted':
      case 'chunked':
      case 'embedded':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'processed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              }
            `}
          >
            <input {...getInputProps()} />
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg">Drop the PDF files here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
                  Drag & drop PDF files here, or click to select
                </p>
                <p className="text-sm text-muted-foreground">
                  Max 50MB per file
                </p>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Selected Files:</h4>
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center justify-between p-2 bg-muted rounded"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({formatFileSize(file.size)})
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={uploadFiles}
            disabled={files.length === 0 || uploading}
            className="w-full"
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} file(s)`}
          </Button>
        </CardContent>
      </Card>

      {processing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {processing.map((file) => (
              <div key={file.documentId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(file.status)}
                    <span className="text-sm font-medium">
                      {file.originalName}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">
                    {file.status.replace('_', ' ')}
                  </span>
                </div>
                <Progress value={file.progress} className="h-2" />
                {file.error && (
                  <p className="text-xs text-red-500">{file.error}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
