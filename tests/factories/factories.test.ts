import { describe, it, expect } from 'vitest';
import {
  userFactory,
  chatFactory,
  completeChatFactory,
  completeRAGDocumentFactory,
  ragDocumentFactory,
  documentContentFactory,
  documentChunkFactory,
  documentEmbeddingFactory,
} from './index';

describe('Factory Tests', () => {
  describe('UserFactory', () => {
    it('should create a valid user', () => {
      const user = userFactory.create();

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBeDefined();
      expect(user.name).toBeDefined();
      expect(user.type).toMatch(/^(regular|premium|admin)$/);
      expect(user.isAnonymous).toBe(false);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should create an anonymous user', () => {
      const user = userFactory.createAnonymous();

      expect(user.isAnonymous).toBe(true);
      expect(user.email).toBeNull();
      expect(user.password).toBeNull();
      expect(user.name).toBe('Anonymous User');
    });

    it('should create an admin user', () => {
      const user = userFactory.createAdmin();

      expect(user.type).toBe('admin');
      expect(user.emailVerified).toBe(true);
      expect(user.name).toMatch(/^Admin/);
    });
  });

  describe('ChatFactory', () => {
    it('should create a valid chat', () => {
      const chat = chatFactory.create();

      expect(chat).toBeDefined();
      expect(chat.id).toBeDefined();
      expect(chat.title).toBeDefined();
      expect(chat.userId).toBeDefined();
      expect(chat.visibility).toMatch(/^(public|private)$/);
      expect(chat.createdAt).toBeInstanceOf(Date);
    });

    it('should create a public chat', () => {
      const chat = chatFactory.createPublic();

      expect(chat.visibility).toBe('public');
      expect(chat.title).toBeDefined();
    });
  });

  describe('CompleteChatFactory', () => {
    it('should create a complete chat with related data', () => {
      const completeChat = completeChatFactory.create();

      expect(completeChat.chat).toBeDefined();
      expect(completeChat.messages).toBeDefined();
      expect(completeChat.votes).toBeDefined();
      expect(completeChat.streams).toBeDefined();

      expect(Array.isArray(completeChat.messages)).toBe(true);
      expect(Array.isArray(completeChat.votes)).toBe(true);
      expect(Array.isArray(completeChat.streams)).toBe(true);
    });

    it('should create a public complete chat', () => {
      const completeChat = completeChatFactory.createPublic();

      expect(completeChat.chat.visibility).toBe('public');
      expect(completeChat.messages.length).toBeGreaterThan(0);
    });
  });

  describe('RAGDocumentFactory', () => {
    it('should create a valid RAG document', () => {
      const document = ragDocumentFactory.create();

      expect(document).toBeDefined();
      expect(document.id).toBeDefined();
      expect(document.fileName).toBeDefined();
      expect(document.originalName).toBeDefined();
      expect(document.filePath).toBeDefined();
      expect(document.mimeType).toBeDefined();
      expect(document.fileSize).toBeDefined();
      expect(document.status).toMatch(
        /^(uploaded|processing|text_extracted|images_extracted|ade_processing|ade_processed|chunked|embedded|processed|error|error_image_extraction|error_ade_processing|failed)$/,
      );
      expect(document.uploadedBy).toBeDefined();
      expect(document.createdAt).toBeInstanceOf(Date);
      expect(document.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a PDF document', () => {
      const document = ragDocumentFactory.createPDFDocument();

      expect(document.mimeType).toBe('application/pdf');
      expect(document.originalName).toMatch(/\.pdf$/);
    });
  });

  describe('DocumentContentFactory', () => {
    it('should create valid document content', () => {
      const content = documentContentFactory.create();

      expect(content).toBeDefined();
      expect(content.id).toBeDefined();
      expect(content.documentId).toBeDefined();
      expect(content.extractedText).toBeDefined();
      expect(content.pageCount).toBeDefined();
      expect(content.charCount).toBeDefined();
      expect(content.metadata).toBeDefined();
      expect(content.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('DocumentChunkFactory', () => {
    it('should create valid document chunks', () => {
      const chunk = documentChunkFactory.create();

      expect(chunk).toBeDefined();
      expect(chunk.id).toBeDefined();
      expect(chunk.documentId).toBeDefined();
      expect(chunk.chunkIndex).toBeDefined();
      expect(chunk.content).toBeDefined();
      expect(chunk.metadata).toBeDefined();
      expect(chunk.tokenCount).toBeDefined();
      expect(chunk.createdAt).toBeInstanceOf(Date);
    });

    it('should create chunks for a document', () => {
      const documentId = 'test-doc-id';
      const chunkCount = 3;

      const chunks = documentChunkFactory.createChunksForDocument(
        documentId,
        chunkCount,
      );

      expect(chunks).toHaveLength(chunkCount);
      chunks.forEach((chunk, index) => {
        expect(chunk.documentId).toBe(documentId);
        expect(chunk.chunkIndex).toBe(index.toString());
      });
    });
  });

  describe('DocumentEmbeddingFactory', () => {
    it('should create valid embeddings', () => {
      const embedding = documentEmbeddingFactory.create();

      expect(embedding).toBeDefined();
      expect(embedding.id).toBeDefined();
      expect(embedding.chunkId).toBeDefined();
      expect(embedding.documentId).toBeDefined();
      expect(embedding.embedding).toBeDefined();
      expect(embedding.embeddingType).toBeDefined();
      expect(embedding.dimensions).toBeDefined();
      expect(embedding.model).toBeDefined();
      expect(embedding.createdAt).toBeInstanceOf(Date);

      // Verify embedding is valid JSON
      expect(() => JSON.parse(embedding.embedding)).not.toThrow();
      const parsedEmbedding = JSON.parse(embedding.embedding);
      expect(Array.isArray(parsedEmbedding)).toBe(true);
      expect(parsedEmbedding).toHaveLength(embedding.dimensions);
    });

    it('should create embeddings for specific model', () => {
      const model = 'text-embedding-ada-002';
      const embedding = documentEmbeddingFactory.createForModel(model);

      expect(embedding.model).toBe(model);
      expect(embedding.dimensions).toBe(1536); // Ada-002 dimensions
    });
  });

  describe('CompleteRAGDocumentFactory', () => {
    it('should create a complete RAG document with all relations', () => {
      const completeDoc = completeRAGDocumentFactory.create();

      expect(completeDoc.document).toBeDefined();
      expect(completeDoc.content).toBeDefined();
      expect(completeDoc.chunks).toBeDefined();
      expect(completeDoc.embeddings).toBeDefined();

      expect(Array.isArray(completeDoc.chunks)).toBe(true);
      expect(Array.isArray(completeDoc.embeddings)).toBe(true);

      // Verify relationships
      expect(completeDoc.content.documentId).toBe(completeDoc.document.id);
      completeDoc.chunks.forEach((chunk) => {
        expect(chunk.documentId).toBe(completeDoc.document.id);
      });
      completeDoc.embeddings.forEach((embedding) => {
        expect(embedding.documentId).toBe(completeDoc.document.id);
        expect(
          completeDoc.chunks.some((chunk) => chunk.id === embedding.chunkId),
        ).toBe(true);
      });
    });

    it('should create minimal RAG document', () => {
      const minimalDoc = completeRAGDocumentFactory.createMinimal();

      expect(minimalDoc.chunks).toHaveLength(1);
      expect(minimalDoc.embeddings).toHaveLength(1);
    });

    it('should create large RAG document', () => {
      const largeDoc = completeRAGDocumentFactory.createLarge();

      expect(largeDoc.chunks).toHaveLength(50);
      expect(largeDoc.embeddings).toHaveLength(50);
    });
  });
});
