import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DocumentList } from '@/components/document-list';
import type { ManagedDocumentView, DocumentStats } from '@/app/(chat)/documents/actions';

// Create manual mocks
const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
};

const mockDocumentActions = {
  getManagedDocuments: vi.fn(),
  getDocumentStats: vi.fn(),
  deleteDocument: vi.fn(),
  getDocumentDetails: vi.fn(),
};

// Mock modules
vi.mock('sonner', () => ({
  toast: mockToast,
}));

vi.mock('@/app/(chat)/documents/actions', () => ({
  getManagedDocuments: () => mockDocumentActions.getManagedDocuments(),
  getDocumentStats: () => mockDocumentActions.getDocumentStats(),
  deleteDocument: (id: string) => mockDocumentActions.deleteDocument(id),
  getDocumentDetails: (id: string) => mockDocumentActions.getDocumentDetails(id),
}));

vi.mock('@/components/document-detail', () => ({
  DocumentDetail: ({ isOpen, onClose }: any) =>
    isOpen ? <div data-testid="document-detail">Document Detail</div> : null,
}));

const mockDocuments: ManagedDocumentView[] = [
  {
    id: 'doc-1',
    fileName: 'test-document.pdf',
    originalName: 'Test Document.pdf',
    filePath: '/uploads/test-document.pdf',
    mimeType: 'application/pdf',
    fileSize: '1024000',
    status: 'processed',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    chunkCount: 5,
    hasContent: true,
    pageCount: 10,
  },
  {
    id: 'doc-2',
    fileName: 'processing-doc.pdf',
    originalName: 'Processing Document.pdf',
    filePath: '/uploads/processing-doc.pdf',
    mimeType: 'application/pdf',
    fileSize: '2048000',
    status: 'processing',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    chunkCount: 0,
    hasContent: false,
    pageCount: null,
  },
];

const mockStats: DocumentStats = {
  total: 2,
  uploaded: 0,
  processing: 1,
  textExtracted: 0,
  chunked: 0,
  embedded: 0,
  processed: 1,
  error: 0,
};

describe('DocumentList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentActions.getManagedDocuments.mockResolvedValue(mockDocuments);
    mockDocumentActions.getDocumentStats.mockResolvedValue(mockStats);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<DocumentList userId="user-1" />);
    expect(screen.getByText('Loading documents...')).toBeInTheDocument();
  });

  it('loads and displays documents list', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Document.pdf')).toBeInTheDocument();
      expect(screen.getByText('Processing Document.pdf')).toBeInTheDocument();
    });

    // Verify server action calls
    expect(mockDocumentActions.getManagedDocuments).toHaveBeenCalled();
    expect(mockDocumentActions.getDocumentStats).toHaveBeenCalled();
  });

  it('displays document stats overview', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Total Documents')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // total count
      expect(screen.getByText('Ready for Chat')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // processed count
    });
  });

  it('filters documents by search term', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Document.pdf')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search documents...');
    fireEvent.change(searchInput, { target: { value: 'Processing' } });

    expect(screen.queryByText('Test Document.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Processing Document.pdf')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    mockDocumentActions.getManagedDocuments.mockRejectedValueOnce(
      new Error('Network error'),
    );

    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to load documents. Please try again.',
      );
    });
  });

  it('displays empty state when no documents', async () => {
    mockDocumentActions.getManagedDocuments.mockResolvedValueOnce([]);
    mockDocumentActions.getDocumentStats.mockResolvedValueOnce({
      ...mockStats,
      total: 0,
    });

    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('No documents uploaded yet')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Upload your first document to get started with intelligent chat conversations.',
        ),
      ).toBeInTheDocument();
    });
  });
});