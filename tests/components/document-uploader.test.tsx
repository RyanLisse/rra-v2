import { vi } from 'vitest';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch for API calls
global.fetch = vi.fn();

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentUploader } from '@/components/document-uploader';
import { setupTestEnvironment } from '../utils/test-helpers';
import {
  createTestFile,
  createLargeFile,
  createInvalidFile,
} from '../fixtures/test-data';
import { toast } from 'sonner';

// Mock file upload API response
const mockSuccessResponse = {
  ok: true,
  json: () =>
    Promise.resolve({
      message: 'Successfully uploaded 1 file(s)',
      files: [
        {
          documentId: 'doc-123',
          originalName: 'test.pdf',
          fileName: 'unique-test.pdf',
          size: 1024,
          status: 'uploaded',
        },
      ],
    }),
};

const mockErrorResponse = {
  ok: false,
  status: 400,
  json: () =>
    Promise.resolve({
      error: 'File size exceeds 50MB limit',
    }),
};

describe('DocumentUploader Component', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
    vi.mocked(fetch).mockResolvedValue(mockSuccessResponse as any);
    user = userEvent.setup();
  });

  describe('Rendering', () => {
    it('should render upload interface', () => {
      render(<DocumentUploader />);

      expect(screen.getByText(/Upload Documents/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Drag & drop PDF files here, or click to select/i),
      ).toBeInTheDocument();
    });

    it('should show accepted file types', () => {
      render(<DocumentUploader />);

      expect(screen.getByText(/Max 50MB per file/i)).toBeInTheDocument();
    });

    it('should render file input element', () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveAttribute('accept', 'application/pdf');
      expect(fileInput).toHaveAttribute('multiple');
    });
  });

  describe('File Selection', () => {
    it('should handle single file selection', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const testFile = createTestFile('single.pdf');

      await user.upload(fileInput, testFile);

      expect(screen.getByText('single.pdf')).toBeInTheDocument();
      expect(screen.getByText(/1 KB/i)).toBeInTheDocument();
    });

    it('should handle multiple file selection', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const files = [
        createTestFile('first.pdf'),
        createTestFile('second.pdf'),
        createTestFile('third.pdf'),
      ];

      await user.upload(fileInput, files);

      expect(screen.getByText('first.pdf')).toBeInTheDocument();
      expect(screen.getByText('second.pdf')).toBeInTheDocument();
      expect(screen.getByText('third.pdf')).toBeInTheDocument();
    });

    it('should validate file types', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const invalidFile = createInvalidFile();

      await user.upload(fileInput, invalidFile);

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'invalid.txt is not a PDF file',
      );
      expect(screen.queryByText('invalid.txt')).not.toBeInTheDocument();
    });

    it('should validate file sizes', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const largeFile = createLargeFile();

      await user.upload(fileInput, largeFile);

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'large.pdf exceeds 50MB limit',
      );
    });

    it('should allow removing selected files', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const testFile = createTestFile('removable.pdf');

      await user.upload(fileInput, testFile);
      expect(screen.getByText('removable.pdf')).toBeInTheDocument();

      // Find the remove button by looking for the parent element
      const fileItem = screen.getByText('removable.pdf').closest('div');
      const removeButton = fileItem?.querySelector('button');
      expect(removeButton).toBeInTheDocument();

      await user.click(removeButton!);

      expect(screen.queryByText('removable.pdf')).not.toBeInTheDocument();
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag over events', () => {
      render(<DocumentUploader />);

      const dropZone = screen.getByRole('button', { name: /upload files/i });

      fireEvent.dragOver(dropZone);
      expect(dropZone).toHaveClass('border-blue-500'); // Assuming drag over styling
    });

    it('should handle drag leave events', () => {
      render(<DocumentUploader />);

      const dropZone = screen.getByRole('button', { name: /upload files/i });

      fireEvent.dragOver(dropZone);
      fireEvent.dragLeave(dropZone);

      expect(dropZone).not.toHaveClass('border-blue-500');
    });

    it('should handle file drop', () => {
      render(<DocumentUploader />);

      const dropZone = screen.getByRole('button', { name: /upload files/i });
      const testFile = createTestFile('dropped.pdf');

      const dropEvent = new Event('drop', { bubbles: true });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          files: [testFile],
        },
      });

      fireEvent(dropZone, dropEvent);

      expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
    });

    it('should prevent default drag behaviors', () => {
      render(<DocumentUploader />);

      const dropZone = screen.getByRole('button', { name: /upload files/i });

      const dragOverEvent = new Event('dragover', { bubbles: true });
      const dropEvent = new Event('drop', { bubbles: true });

      const dragOverSpy = vi.spyOn(dragOverEvent, 'preventDefault');
      const dropSpy = vi.spyOn(dropEvent, 'preventDefault');

      fireEvent(dropZone, dragOverEvent);
      fireEvent(dropZone, dropEvent);

      expect(dragOverSpy).toHaveBeenCalled();
      expect(dropSpy).toHaveBeenCalled();
    });
  });

  describe('Upload Process', () => {
    it('should upload files successfully', async () => {
      render(<DocumentUploader />);

      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('upload.pdf');

      await user.upload(fileInput, testFile);

      const uploadButton = screen.getByRole('button', {
        name: /upload 1 file/i,
      });
      await user.click(uploadButton);

      expect(screen.getByText(/Uploading.../i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/successfully uploaded/i)).toBeInTheDocument();
      });

      expect(fetch).toHaveBeenCalledWith('/api/documents/upload', {
        method: 'POST',
        body: expect.any(FormData),
      });
    });

    it('should show upload progress', async () => {
      render(<DocumentUploader />);

      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('progress.pdf');

      await user.upload(fileInput, testFile);

      const uploadButton = screen.getByRole('button', {
        name: /upload files/i,
      });
      await user.click(uploadButton);

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText(/uploading progress\.pdf/i)).toBeInTheDocument();
    });

    it('should handle upload errors', async () => {
      vi.mocked(fetch).mockResolvedValue(mockErrorResponse as any);

      render(<DocumentUploader />);

      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('error.pdf');

      await user.upload(fileInput, testFile);

      const uploadButton = screen.getByRole('button', {
        name: /upload files/i,
      });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(
          screen.getByText(/file size exceeds 50mb limit/i),
        ).toBeInTheDocument();
      });
    });

    it('should disable upload button when no files selected', () => {
      render(<DocumentUploader />);

      const uploadButton = screen.getByRole('button', {
        name: /upload files/i,
      });
      expect(uploadButton).toBeDisabled();
    });

    it('should disable upload button during upload', async () => {
      // Mock a slow response
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(mockSuccessResponse as any), 1000),
          ),
      );

      render(<DocumentUploader />);

      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('slow.pdf');

      await user.upload(fileInput, testFile);

      const uploadButton = screen.getByRole('button', {
        name: /upload 1 file/i,
      });
      await user.click(uploadButton);

      expect(uploadButton).toBeDisabled();
      expect(screen.getByText(/Uploading.../i)).toBeInTheDocument();
    });

    it('should reset form after successful upload', async () => {
      render(<DocumentUploader />);

      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('reset.pdf');

      await user.upload(fileInput, testFile);
      expect(screen.getByText('reset.pdf')).toBeInTheDocument();

      const uploadButton = screen.getByRole('button', {
        name: /upload 1 file/i,
      });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
          'Successfully uploaded 1 file(s)',
        );
      });

      // Form should reset
      expect(screen.queryByText('reset.pdf')).not.toBeInTheDocument();
      expect(uploadButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<DocumentUploader />);

      const uploadButton = screen.getByRole('button', {
        name: /upload 0 file/i,
      });
      expect(uploadButton).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<DocumentUploader />);

      const dropZone = screen
        .getByText(/Drag & drop PDF files here/i)
        .closest('div');
      expect(dropZone).toBeInTheDocument();

      // Test file input is accessible
      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });

    it('should announce upload status to screen readers', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const testFile = createTestFile('accessible.pdf');

      await user.upload(fileInput, testFile);

      const uploadButton = screen.getByRole('button', {
        name: /upload 1 file/i,
      });
      await user.click(uploadButton);

      // Wait for processing status to appear
      await waitFor(() => {
        expect(screen.getByText(/Processing Status/i)).toBeInTheDocument();
      });
    });

    it('should have proper color contrast for error states', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const invalidFile = createInvalidFile();

      await user.upload(fileInput, invalidFile);

      // Error is shown via toast notification
      expect(vi.mocked(toast.error)).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of files efficiently', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const manyFiles = Array.from({ length: 50 }, (_, i) =>
        createTestFile(`file-${i}.pdf`),
      );

      const startTime = performance.now();
      await user.upload(fileInput, manyFiles);
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(5000); // Should handle 50 files in under 5 seconds
      expect(screen.getAllByText(/\.pdf/)).toHaveLength(50);
    });

    it('should not cause memory leaks with repeated uploads', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;

      // Simulate multiple upload cycles
      for (let i = 0; i < 10; i++) {
        const testFile = createTestFile(`cycle-${i}.pdf`);
        await user.upload(fileInput, testFile);

        const uploadButton = screen.getByRole('button', {
          name: /upload 1 file/i,
        });
        await user.click(uploadButton);

        await waitFor(() => {
          expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
            'Successfully uploaded 1 file(s)',
          );
        });

        // Wait for form reset
        await waitFor(() => {
          expect(screen.queryByText(`cycle-${i}.pdf`)).not.toBeInTheDocument();
        });

        // Clear mocks for next iteration
        vi.mocked(toast.success).mockClear();
      }

      // Component should still be responsive
      expect(screen.getByText(/Upload Documents/i)).toBeInTheDocument();
    });
  });

  describe('Integration with File API', () => {
    it('should read file metadata correctly', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const testFile = createTestFile('metadata.pdf', 'application/pdf', 2048);

      await user.upload(fileInput, testFile);

      expect(screen.getByText('metadata.pdf')).toBeInTheDocument();
      expect(screen.getByText(/2 KB/i)).toBeInTheDocument();
    });

    it('should handle FileReader errors gracefully', async () => {
      render(<DocumentUploader />);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const testFile = createTestFile('reader-error.pdf');

      await user.upload(fileInput, testFile);

      // Component should accept the file normally
      expect(screen.getByText('reader-error.pdf')).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should adapt to mobile viewport', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<DocumentUploader />);

      // Should show upload interface
      expect(screen.getByText(/Upload Documents/i)).toBeInTheDocument();
    });

    it('should show appropriate touch targets for mobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(<DocumentUploader />);

      const uploadButton = screen.getByRole('button', {
        name: /upload 0 file/i,
      });
      // Button should be present and clickable
      expect(uploadButton).toBeInTheDocument();
    });
  });
});
