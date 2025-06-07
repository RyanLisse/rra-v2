import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';
import type {
  User,
  Chat,
  RAGDocument,
  DocumentContent,
  DocumentChunk,
} from '@/lib/db/schema';

// User fixtures
export const createTestUser = (
  overrides?: Partial<User>,
): Omit<User, 'id' | 'createdAt' | 'updatedAt'> => ({
  email: `test.${nanoid()}@example.com`,
  password: 'hashedpassword123',
  emailVerified: true,
  image: null,
  name: 'Test User',
  type: 'regular',
  ...overrides,
});

export const createAdminUser = (): Omit<
  User,
  'id' | 'createdAt' | 'updatedAt'
> => createTestUser({ type: 'admin', name: 'Admin User' });

export const createPremiumUser = (): Omit<
  User,
  'id' | 'createdAt' | 'updatedAt'
> => createTestUser({ type: 'premium', name: 'Premium User' });

// Chat fixtures
export const createTestChat = (
  userId: string,
  overrides?: Partial<Chat>,
): Omit<Chat, 'id'> => ({
  createdAt: new Date(),
  title: `Test Chat ${nanoid()}`,
  userId,
  visibility: 'private',
  ...overrides,
});

export const createPublicChat = (userId: string): Omit<Chat, 'id'> =>
  createTestChat(userId, { visibility: 'public', title: 'Public Test Chat' });

// RAG Document fixtures
export const createTestDocument = (
  uploadedBy: string,
  overrides?: Partial<RAGDocument>,
): Omit<RAGDocument, 'id' | 'createdAt' | 'updatedAt'> => ({
  fileName: `test-${nanoid()}.pdf`,
  originalName: 'test-document.pdf',
  filePath: `/uploads/test-${nanoid()}.pdf`,
  mimeType: 'application/pdf',
  fileSize: '1024000',
  status: 'uploaded',
  uploadedBy,
  ...overrides,
});

export const createProcessedDocument = (
  uploadedBy: string,
): Omit<RAGDocument, 'id' | 'createdAt' | 'updatedAt'> =>
  createTestDocument(uploadedBy, { status: 'processed' });

// Document Content fixtures
export const createTestDocumentContent = (
  documentId: string,
  overrides?: Partial<DocumentContent>,
): Omit<DocumentContent, 'id' | 'createdAt'> => ({
  documentId,
  textFilePath: `/uploads/text/test-${nanoid()}.txt`,
  extractedText: `This is test extracted text content. It contains multiple paragraphs and sections.

## Section 1
This section contains important information about the test document.

## Section 2
This section contains additional information for testing purposes.

The document contains approximately 500 characters of text for testing chunking and embedding functionality.`,
  pageCount: '5',
  charCount: '500',
  metadata: {
    language: 'en',
    format: 'pdf',
    hasImages: false,
    hasTables: true,
  },
  ...overrides,
});

// Document Chunk fixtures
export const createTestDocumentChunk = (
  documentId: string,
  chunkIndex: number,
  overrides?: Partial<DocumentChunk>,
): Omit<DocumentChunk, 'id' | 'createdAt'> => ({
  documentId,
  chunkIndex: chunkIndex.toString(),
  content: `This is chunk ${chunkIndex} of the test document. It contains relevant information that can be searched and retrieved during RAG operations.`,
  metadata: {
    chunkIndex,
    startOffset: chunkIndex * 200,
    endOffset: (chunkIndex + 1) * 200,
    wordCount: 25,
  },
  tokenCount: '32',
  ...overrides,
});

// File upload fixtures
export const createTestFile = (
  name = 'test.pdf',
  type = 'application/pdf',
  size = 1024,
): File => {
  const content = new Uint8Array(size);
  // Fill with dummy PDF header
  content.set([0x25, 0x50, 0x44, 0x46]); // %PDF

  return new File([content], name, { type });
};

export const createLargeFile = (): File =>
  createTestFile('large.pdf', 'application/pdf', 60 * 1024 * 1024); // 60MB

export const createInvalidFile = (): File =>
  createTestFile('invalid.txt', 'text/plain', 1024);

// Session fixtures
export const createTestSession = (userId: string) => ({
  user: {
    id: userId,
    email: 'test@example.com',
    name: 'Test User',
    type: 'regular' as const,
  },
  session: {
    id: nanoid(),
    userId,
    token: nanoid(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  },
});

export const createAdminSession = (userId: string) => ({
  ...createTestSession(userId),
  user: {
    ...createTestSession(userId).user,
    type: 'admin' as const,
  },
});

// API Request fixtures
export const createFormDataWithFiles = (files: File[]): FormData => {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  return formData;
};

export const createChatMessage = (overrides?: any) => ({
  id: nanoid(),
  role: 'user' as const,
  parts: [{ type: 'text', text: 'Hello, this is a test message' }],
  experimental_attachments: [],
  ...overrides,
});

export const createChatRequest = (
  chatId: string,
  messageContent?: string,
  overrides?: any,
) => ({
  id: chatId,
  message: createChatMessage(
    messageContent
      ? { parts: [{ type: 'text', text: messageContent }] }
      : undefined,
  ),
  selectedChatModel: 'chat-model',
  selectedVisibilityType: 'private' as const,
  ...overrides,
});

// Vector embedding fixtures
export const createTestEmbedding = (): number[] => {
  // Create a realistic embedding vector (dimension 1536 for OpenAI)
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
};

// Performance testing factory
export const createPerformanceDataFactory = () => {
  return {
    createBulkDocuments: (uploadedBy: string, count: number) => {
      return Array.from({ length: count }, (_, i) => ({
        fileName: `performance-doc-${i}-${nanoid()}.pdf`,
        originalName: `performance-document-${i}.pdf`,
        filePath: `/uploads/performance/doc-${i}-${nanoid()}.pdf`,
        mimeType: 'application/pdf',
        fileSize: (Math.random() * 10000000 + 1000000).toString(), // 1-10MB
        status: 'uploaded' as const,
        uploadedBy,
      }));
    },

    createBulkDocumentChunks: (documentId: string, count: number) => {
      return Array.from({ length: count }, (_, i) => ({
        documentId,
        chunkIndex: i.toString(),
        content: `Performance test chunk ${i}. This is a realistic chunk of text content that would be extracted from a document during processing. It contains enough text to be meaningful for embedding and search operations. The content varies to create realistic diversity in the dataset for performance testing. Chunk ${i} represents a section of the document with specific information about performance testing methodologies and data generation patterns.`,
        metadata: {
          chunkIndex: i,
          startOffset: i * 500,
          endOffset: (i + 1) * 500,
          wordCount: 75 + Math.floor(Math.random() * 25), // 75-100 words
          section: `Section ${Math.floor(i / 10)}`,
          performanceTest: true,
        },
        tokenCount: (100 + Math.floor(Math.random() * 50)).toString(), // 100-150 tokens
      }));
    },

    createRealisticEmbedding: (dimension: number = 1536) => {
      // Create embeddings with realistic patterns (not purely random)
      const embedding = new Array(dimension);
      const clusterCount = 10;
      const clusterSize = dimension / clusterCount;

      for (let cluster = 0; cluster < clusterCount; cluster++) {
        const clusterMean = (Math.random() - 0.5) * 2; // -1 to 1
        const clusterStd = 0.3 + Math.random() * 0.4; // 0.3 to 0.7

        for (let i = 0; i < clusterSize; i++) {
          const index = cluster * clusterSize + i;
          if (index < dimension) {
            // Generate value with some clustering pattern
            embedding[index] = clusterMean + (Math.random() - 0.5) * clusterStd;
            // Normalize to reasonable range
            embedding[index] = Math.max(-1, Math.min(1, embedding[index]));
          }
        }
      }

      return embedding;
    },

    createSearchableEmbedding: (
      dimension: number = 1536,
      patternId: number = 0,
    ) => {
      // Create embeddings with specific patterns for search testing
      const embedding = new Array(dimension);
      const patternPhase = (patternId * Math.PI * 2) / 10; // 10 different patterns

      for (let i = 0; i < dimension; i++) {
        const baseValue =
          Math.sin((i / dimension) * Math.PI * 4 + patternPhase) * 0.5;
        const noise = (Math.random() - 0.5) * 0.3;
        embedding[i] = baseValue + noise;
      }

      return embedding;
    },

    createLargeTestFile: (name: string, type: string, size: number): File => {
      const content = new Uint8Array(size);

      // Add realistic file header based on type
      if (type === 'application/pdf') {
        // PDF header
        content.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
      } else if (
        type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        // DOCX header (ZIP)
        content.set([0x50, 0x4b, 0x03, 0x04]);
      }

      // Fill with semi-realistic content patterns
      for (let i = 8; i < size; i++) {
        if (i % 1000 === 0) {
          // Add some structure markers every 1KB
          content[i] = 0x0a; // Newline
        } else if (i % 100 === 0) {
          // Add spaces for readability
          content[i] = 0x20; // Space
        } else {
          // Random printable ASCII characters
          content[i] = 32 + (i % 95); // Printable ASCII range
        }
      }

      return new File([content], name, { type });
    },

    createMemoryIntensiveData: (sizeMB: number) => {
      const sizeBytes = sizeMB * 1024 * 1024;
      const data = new ArrayBuffer(sizeBytes);
      const view = new Uint8Array(data);

      // Fill with pattern to simulate real data
      for (let i = 0; i < sizeBytes; i++) {
        view[i] = i % 256;
      }

      return data;
    },

    createConcurrentOperations: (
      count: number,
      operationFn: (index: number) => Promise<any>,
    ) => {
      return Array.from({ length: count }, (_, i) => operationFn(i));
    },

    generatePerformanceReport: (testName: string, metrics: any) => {
      return {
        testName,
        timestamp: new Date().toISOString(),
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryLimit: '512MB',
        },
        metrics,
        summary: {
          passed: metrics.duration < (metrics.expectedDuration || 30000),
          performance: metrics.throughput > (metrics.expectedThroughput || 1),
          memory: (metrics.memoryUsage || 0) < 512 * 1024 * 1024,
        },
      };
    },
  };
};

// Error simulation helpers
export const simulateNetworkError = () => {
  throw new Error('Network error: Connection timeout');
};

export const simulateDatabaseError = () => {
  throw new Error('Database error: Connection lost');
};

export const simulateFileSystemError = () => {
  throw new Error('File system error: Permission denied');
};
