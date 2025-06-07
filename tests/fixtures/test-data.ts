import { nanoid } from 'nanoid';
import type { User, Chat, RAGDocument, DocumentContent, DocumentChunk } from '@/lib/db/schema';

// User fixtures
export const createTestUser = (overrides?: Partial<User>): Omit<User, 'id' | 'createdAt' | 'updatedAt'> => ({
  email: `test.${nanoid()}@example.com`,
  password: 'hashedpassword123',
  emailVerified: true,
  image: null,
  name: 'Test User',
  type: 'regular',
  ...overrides,
});

export const createAdminUser = (): Omit<User, 'id' | 'createdAt' | 'updatedAt'> => 
  createTestUser({ type: 'admin', name: 'Admin User' });

export const createPremiumUser = (): Omit<User, 'id' | 'createdAt' | 'updatedAt'> => 
  createTestUser({ type: 'premium', name: 'Premium User' });

// Chat fixtures
export const createTestChat = (userId: string, overrides?: Partial<Chat>): Omit<Chat, 'id'> => ({
  createdAt: new Date(),
  title: `Test Chat ${nanoid()}`,
  userId,
  visibility: 'private',
  ...overrides,
});

export const createPublicChat = (userId: string): Omit<Chat, 'id'> =>
  createTestChat(userId, { visibility: 'public', title: 'Public Test Chat' });

// RAG Document fixtures
export const createTestDocument = (uploadedBy: string, overrides?: Partial<RAGDocument>): Omit<RAGDocument, 'id' | 'createdAt' | 'updatedAt'> => ({
  fileName: `test-${nanoid()}.pdf`,
  originalName: 'test-document.pdf',
  filePath: `/uploads/test-${nanoid()}.pdf`,
  mimeType: 'application/pdf',
  fileSize: '1024000',
  status: 'uploaded',
  uploadedBy,
  ...overrides,
});

export const createProcessedDocument = (uploadedBy: string): Omit<RAGDocument, 'id' | 'createdAt' | 'updatedAt'> =>
  createTestDocument(uploadedBy, { status: 'processed' });

// Document Content fixtures
export const createTestDocumentContent = (documentId: string, overrides?: Partial<DocumentContent>): Omit<DocumentContent, 'id' | 'createdAt'> => ({
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
export const createTestDocumentChunk = (documentId: string, chunkIndex: number, overrides?: Partial<DocumentChunk>): Omit<DocumentChunk, 'id' | 'createdAt'> => ({
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
export const createTestFile = (name = 'test.pdf', type = 'application/pdf', size = 1024): File => {
  const content = new Uint8Array(size);
  // Fill with dummy PDF header
  content.set([0x25, 0x50, 0x44, 0x46]); // %PDF
  
  return new File([content], name, { type });
};

export const createLargeFile = (): File => createTestFile('large.pdf', 'application/pdf', 60 * 1024 * 1024); // 60MB

export const createInvalidFile = (): File => createTestFile('invalid.txt', 'text/plain', 1024);

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
  files.forEach(file => formData.append('files', file));
  return formData;
};

export const createChatMessage = (overrides?: any) => ({
  id: nanoid(),
  role: 'user' as const,
  parts: [{ type: 'text', text: 'Hello, this is a test message' }],
  experimental_attachments: [],
  ...overrides,
});

export const createChatRequest = (chatId: string, overrides?: any) => ({
  id: chatId,
  message: createChatMessage(),
  selectedChatModel: 'chat-model',
  selectedVisibilityType: 'private' as const,
  ...overrides,
});

// Vector embedding fixtures
export const createTestEmbedding = (): number[] => {
  // Create a realistic embedding vector (dimension 1536 for OpenAI)
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
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