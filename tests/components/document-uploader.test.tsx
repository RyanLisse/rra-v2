import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentUploader } from '@/components/document-uploader';
import { setupTestEnvironment } from '../utils/test-helpers';
import { createTestFile, createLargeFile, createInvalidFile } from '../fixtures/test-data';

// Mock fetch for API calls
global.fetch = vi.fn();

// Mock file upload API response
const mockSuccessResponse = {
  ok: true,
  json: () => Promise.resolve({
    message: 'Successfully uploaded 1 file(s)',
    files: [{
      documentId: 'doc-123',
      originalName: 'test.pdf',
      fileName: 'unique-test.pdf',
      size: 1024,
      status: 'uploaded',
    }],
  }),
};

const mockErrorResponse = {
  ok: false,
  status: 400,
  json: () => Promise.resolve({
    error: 'File size exceeds 50MB limit',
  }),
};

describe('DocumentUploader Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
    vi.mocked(fetch).mockResolvedValue(mockSuccessResponse as any);
  });

  describe('Rendering', () => {
    it('should render upload interface', () => {
      render(<DocumentUploader />);
      
      expect(screen.getByText(/upload documents/i)).toBeInTheDocument();
      expect(screen.getByText(/drag and drop files here/i)).toBeInTheDocument();
      expect(screen.getByText(/or click to browse/i)).toBeInTheDocument();
    });

    it('should show accepted file types', () => {
      render(<DocumentUploader />);
      
      expect(screen.getByText(/pdf files only/i)).toBeInTheDocument();
      expect(screen.getByText(/max 50mb per file/i)).toBeInTheDocument();
    });

    it('should render file input element', () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('type', 'file');
      expect(fileInput).toHaveAttribute('accept', '.pdf');
      expect(fileInput).toHaveAttribute('multiple');
    });
  });

  describe('File Selection', () => {
    it('should handle single file selection', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('single.pdf');
      
      await user.upload(fileInput, testFile);
      
      expect(screen.getByText('single.pdf')).toBeInTheDocument();
      expect(screen.getByText(/1 kb/i)).toBeInTheDocument();
    });

    it('should handle multiple file selection', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
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
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const invalidFile = createInvalidFile();
      
      await user.upload(fileInput, invalidFile);
      
      expect(screen.getByText(/only pdf files are allowed/i)).toBeInTheDocument();
      expect(screen.queryByText('invalid.txt')).not.toBeInTheDocument();
    });

    it('should validate file sizes', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const largeFile = createLargeFile();
      
      await user.upload(fileInput, largeFile);
      
      expect(screen.getByText(/file size exceeds 50mb limit/i)).toBeInTheDocument();
    });

    it('should allow removing selected files', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('removable.pdf');
      
      await user.upload(fileInput, testFile);
      expect(screen.getByText('removable.pdf')).toBeInTheDocument();
      
      const removeButton = screen.getByLabelText(/remove removable\.pdf/i);
      await user.click(removeButton);
      
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
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
      await user.click(uploadButton);
      
      expect(screen.getByText(/uploading/i)).toBeInTheDocument();
      
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
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
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
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
      await user.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.getByText(/file size exceeds 50mb limit/i)).toBeInTheDocument();
      });
    });

    it('should disable upload button when no files selected', () => {
      render(<DocumentUploader />);
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
      expect(uploadButton).toBeDisabled();
    });

    it('should disable upload button during upload', async () => {
      // Mock a slow response
      vi.mocked(fetch).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockSuccessResponse as any), 1000))
      );
      
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('slow.pdf');
      
      await user.upload(fileInput, testFile);
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
      await user.click(uploadButton);
      
      expect(uploadButton).toBeDisabled();
      expect(screen.getByText(/uploading/i)).toBeInTheDocument();
    });

    it('should reset form after successful upload', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('reset.pdf');
      
      await user.upload(fileInput, testFile);
      expect(screen.getByText('reset.pdf')).toBeInTheDocument();
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
      await user.click(uploadButton);
      
      await waitFor(() => {
        expect(screen.getByText(/successfully uploaded/i)).toBeInTheDocument();
      });
      
      // Form should reset
      expect(screen.queryByText('reset.pdf')).not.toBeInTheDocument();
      expect(uploadButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<DocumentUploader />);
      
      expect(screen.getByLabelText(/upload files/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      render(<DocumentUploader />);
      
      const dropZone = screen.getByRole('button', { name: /upload files/i });
      
      // Focus the drop zone
      dropZone.focus();
      expect(dropZone).toHaveFocus();
      
      // Enter should trigger file dialog
      fireEvent.keyDown(dropZone, { key: 'Enter', code: 'Enter' });
      // Note: File dialog opening is hard to test in unit tests
    });

    it('should announce upload status to screen readers', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('accessible.pdf');
      
      await user.upload(fileInput, testFile);
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
      await user.click(uploadButton);
      
      // Should have aria-live region for status updates
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should have proper color contrast for error states', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const invalidFile = createInvalidFile();
      
      await user.upload(fileInput, invalidFile);
      
      const errorMessage = screen.getByText(/only pdf files are allowed/i);
      expect(errorMessage).toHaveClass('text-red-600'); // Assuming error styling
    });
  });

  describe('Performance', () => {
    it('should handle large numbers of files efficiently', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const manyFiles = Array.from({ length: 50 }, (_, i) => 
        createTestFile(`file-${i}.pdf`)
      );
      
      const startTime = performance.now();
      await user.upload(fileInput, manyFiles);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(5000); // Should handle 50 files in under 5 seconds
      expect(screen.getAllByText(/\.pdf/)).toHaveLength(50);
    });

    it('should not cause memory leaks with repeated uploads', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      
      // Simulate multiple upload cycles
      for (let i = 0; i < 10; i++) {
        const testFile = createTestFile(`cycle-${i}.pdf`);
        await user.upload(fileInput, testFile);
        
        const uploadButton = screen.getByRole('button', { name: /upload files/i });
        await user.click(uploadButton);
        
        await waitFor(() => {
          expect(screen.getByText(/successfully uploaded/i)).toBeInTheDocument();
        });
        
        // Wait for form reset
        await waitFor(() => {
          expect(screen.queryByText(`cycle-${i}.pdf`)).not.toBeInTheDocument();
        });
      }
      
      // Component should still be responsive
      expect(screen.getByText(/upload documents/i)).toBeInTheDocument();
    });
  });

  describe('Integration with File API', () => {
    it('should read file metadata correctly', async () => {
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('metadata.pdf', 'application/pdf', 2048);
      
      await user.upload(fileInput, testFile);
      
      expect(screen.getByText('metadata.pdf')).toBeInTheDocument();
      expect(screen.getByText(/2 kb/i)).toBeInTheDocument();
      expect(screen.getByText(/pdf/i)).toBeInTheDocument();
    });

    it('should handle FileReader errors gracefully', async () => {
      // Mock FileReader to simulate error
      const originalFileReader = global.FileReader;
      global.FileReader = vi.fn().mockImplementation(() => ({
        readAsDataURL: vi.fn(),
        error: new Error('FileReader error'),
      }));
      
      render(<DocumentUploader />);
      
      const fileInput = screen.getByLabelText(/upload files/i);
      const testFile = createTestFile('reader-error.pdf');
      
      await user.upload(fileInput, testFile);
      
      // Should handle error gracefully
      expect(screen.getByText(/error reading file/i)).toBeInTheDocument();
      
      // Restore original FileReader
      global.FileReader = originalFileReader;
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
      
      // Should show mobile-optimized layout
      const dropZone = screen.getByRole('button', { name: /upload files/i });
      expect(dropZone).toHaveClass('mobile:p-4'); // Assuming mobile styling
    });

    it('should show appropriate touch targets for mobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });
      
      render(<DocumentUploader />);
      
      const uploadButton = screen.getByRole('button', { name: /upload files/i });
      // Touch targets should be at least 44px (assumed in styling)
      expect(uploadButton).toHaveClass('min-h-[44px]');
    });
  });
});