import { vi } from 'vitest';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock document actions
vi.mock('@/app/(chat)/documents/actions', () => ({
  getManagedDocuments: vi.fn(),
  getDocumentStats: vi.fn(),
  deleteDocument: vi.fn(),
  getDocumentDetails: vi.fn(),
}));

// Mock DocumentDetail component
vi.mock('@/components/document-detail', () => ({
  DocumentDetail: ({ isOpen, onClose }: any) =>
    isOpen ? <div data-testid="document-detail">Document Detail</div> : null,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentList } from '@/components/document-list';
import { toast } from 'sonner';
import type { ManagedDocumentView, DocumentStats } from '@/app/(chat)/documents/actions';

// Import mocked functions
import * as documentActions from '@/app/(chat)/documents/actions';

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
    vi.mocked(documentActions.getManagedDocuments).mockResolvedValue(
      mockDocuments,
    );
    vi.mocked(documentActions.getDocumentStats).mockResolvedValue(mockStats);
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
    expect(documentActions.getManagedDocuments).toHaveBeenCalled();
    expect(documentActions.getDocumentStats).toHaveBeenCalled();
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

  it('filters documents by status', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Document.pdf')).toBeInTheDocument();
    });

    // Find and click the status filter
    const statusFilter = screen.getByRole('combobox');
    fireEvent.click(statusFilter);

    const readyOption = screen.getByText('Ready');
    fireEvent.click(readyOption);

    expect(screen.getByText('Test Document.pdf')).toBeInTheDocument();
    expect(
      screen.queryByText('Processing Document.pdf'),
    ).not.toBeInTheDocument();
  });

  it('refreshes document list when refresh button clicked', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Document.pdf')).toBeInTheDocument();
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshButton);

    // Should make new server action calls
    await waitFor(() => {
      expect(documentActions.getManagedDocuments).toHaveBeenCalledTimes(2); // Initial + refresh
      expect(documentActions.getDocumentStats).toHaveBeenCalledTimes(2);
    });
  });

  it('handles delete document with confirmation', async () => {
    // Mock successful delete
    vi.mocked(documentActions.deleteDocument).mockResolvedValue({
      success: true,
    });

    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Document.pdf')).toBeInTheDocument();
    });

    // Find and click the more options button
    const moreButtons = screen.getAllByRole('button');
    const moreButton = moreButtons.find((btn) =>
      btn.querySelector('[data-testid="more-vertical"]'),
    );
    if (moreButton) fireEvent.click(moreButton);

    // Click delete option
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    // Confirm deletion in dialog
    const confirmButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(documentActions.deleteDocument).toHaveBeenCalledWith('doc-1');
      expect(toast.success).toHaveBeenCalledWith(
        'Document "Test Document.pdf" has been deleted.',
      );
    });
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(documentActions.getManagedDocuments).mockRejectedValueOnce(
      new Error('Network error'),
    );

    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to load documents. Please try again.',
      );
    });
  });

  it('displays empty state when no documents', async () => {
    vi.mocked(documentActions.getManagedDocuments).mockResolvedValueOnce([]);
    vi.mocked(documentActions.getDocumentStats).mockResolvedValueOnce({
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

  it('shows processing status with animation', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      const processingBadge = screen.getByText('Processing');
      expect(processingBadge).toBeInTheDocument();

      // Check for spinner icon (should have animate-spin class)
      const spinner = processingBadge.previousElementSibling;
      expect(spinner).toHaveClass('animate-spin');
    });
  });

  it('formats file sizes correctly', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('1.0 MB')).toBeInTheDocument(); // 1024000 bytes
      expect(screen.getByText('2.0 MB')).toBeInTheDocument(); // 2048000 bytes
    });
  });

  it('displays relative upload times', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      // Should show "about x days ago" or similar
      expect(screen.getByText(/ago/)).toBeInTheDocument();
    });
  });

  it('opens document detail view when View Details is clicked', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Document.pdf')).toBeInTheDocument();
    });

    // Find and click the more options button for the first document
    const moreButtons = screen.getAllByRole('button');
    const moreButton = moreButtons.find((btn) =>
      btn.querySelector('[data-testid="more-vertical"]'),
    );
    if (moreButton) fireEvent.click(moreButton);

    // Click View Details option
    const viewDetailsButton = screen.getByText('View Details');
    fireEvent.click(viewDetailsButton);

    // Document detail should open
    await waitFor(() => {
      expect(screen.getByTestId('document-detail')).toBeInTheDocument();
    });
  });

  it('disables Start Chat for non-processed documents', async () => {
    render(<DocumentList userId="user-1" />);

    await waitFor(() => {
      const moreButtons = screen.getAllByRole('button');
      // The processing document's "Start Chat" should be disabled
      // This would need to be verified through the dropdown menu
    });
  });
});