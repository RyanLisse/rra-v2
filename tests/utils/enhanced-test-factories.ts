import { randomUUID } from 'crypto';
import type { User, Session, RagDocument, DocumentChunk, DocumentEmbedding } from '@/lib/db/schema';

/**
 * Enhanced Test Data Factory
 * Provides realistic test data generation with relationships and constraints
 */
export class TestDataFactory {
  private sequenceCounters: Map<string, number> = new Map();

  /**
   * Get next sequence number for entity type
   */
  private getNextSequence(entityType: string): number {
    const current = this.sequenceCounters.get(entityType) || 0;
    const next = current + 1;
    this.sequenceCounters.set(entityType, next);
    return next;
  }

  /**
   * Generate a realistic email address
   */
  private generateEmail(name?: string, domain?: string): string {
    const defaultName = name || `user${this.getNextSequence('email')}`;
    const defaultDomain = domain || 'example.com';
    return `${defaultName.toLowerCase().replace(/\s+/g, '.')}@${defaultDomain}`;
  }

  /**
   * Generate a random string of specified length
   */
  private generateRandomString(length: number, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'): string {
    return Array.from({ length }, () => charset.charAt(Math.floor(Math.random() * charset.length))).join('');
  }

  /**
   * Generate realistic text content for documents
   */
  private generateDocumentContent(length: 'short' | 'medium' | 'long' = 'medium'): string {
    const sentences = [
      'The RoboRail system provides automated measurement capabilities for industrial applications.',
      'Calibration procedures must be followed carefully to ensure accurate measurements.',
      'Data collection protocols include multiple validation steps for quality assurance.',
      'System diagnostics can identify communication issues with the PMAC controller.',
      'Chuck alignment is critical for proper operation of the measurement system.',
      'Environmental factors may affect measurement accuracy and should be monitored.',
      'Regular maintenance schedules help prevent equipment failures and ensure reliability.',
      'User training is essential for safe and effective operation of the system.',
      'Troubleshooting guides provide step-by-step instructions for common issues.',
      'Software updates include performance improvements and bug fixes.'
    ];

    const lengths = {
      short: 2,
      medium: 5,
      long: 10
    };

    const sentenceCount = lengths[length];
    const selectedSentences = Array.from({ length: sentenceCount }, () => 
      sentences[Math.floor(Math.random() * sentences.length)]
    );

    return selectedSentences.join(' ');
  }

  /**
   * Generate a realistic embedding vector
   */
  private generateEmbedding(dimensions: number = 1536): number[] {
    return Array.from({ length: dimensions }, () => 
      (Math.random() - 0.5) * 2 // Values between -1 and 1
    );
  }

  /**
   * Create a test user with realistic data
   */
  createUser(overrides: Partial<User> = {}): User {
    const sequence = this.getNextSequence('user');
    const defaultName = `Test User ${sequence}`;
    
    return {
      id: randomUUID(),
      email: this.generateEmail(overrides.name || defaultName),
      name: defaultName,
      type: 'regular',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    } as User;
  }

  /**
   * Create multiple test users
   */
  createUsers(count: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: count }, () => this.createUser(overrides));
  }

  /**
   * Create a test session for a user
   */
  createSession(userId: string, overrides: Partial<Session> = {}): Session {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    return {
      id: randomUUID(),
      userId,
      token: `session_${this.generateRandomString(32)}`,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ...overrides
    } as Session;
  }

  /**
   * Create a test document with realistic metadata
   */
  createDocument(userId: string, overrides: Partial<RagDocument> = {}): RagDocument {
    const sequence = this.getNextSequence('document');
    const documentTypes = ['manual', 'faq', 'specification', 'guide', 'procedure'];
    const statuses = ['uploaded', 'processing', 'text_extracted', 'chunked', 'embedded', 'processed'];
    
    return {
      id: randomUUID(),
      userId,
      name: `Test Document ${sequence}`,
      originalName: `test-document-${sequence}.pdf`,
      mimeType: 'application/pdf',
      size: Math.floor(Math.random() * 5000000) + 100000, // 100KB to 5MB
      checksum: this.generateRandomString(64, '0123456789abcdef'),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      metadata: {
        type: documentTypes[Math.floor(Math.random() * documentTypes.length)],
        version: '1.0',
        pages: Math.floor(Math.random() * 100) + 1,
        extractedAt: new Date().toISOString()
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    } as RagDocument;
  }

  /**
   * Create multiple test documents
   */
  createDocuments(userId: string, count: number, overrides: Partial<RagDocument> = {}): RagDocument[] {
    return Array.from({ length: count }, () => this.createDocument(userId, overrides));
  }

  /**
   * Create a test document chunk
   */
  createDocumentChunk(documentId: string, index: number, overrides: Partial<DocumentChunk> = {}): DocumentChunk {
    const contentLengths = ['short', 'medium', 'long'] as const;
    const contentLength = contentLengths[Math.floor(Math.random() * contentLengths.length)];

    return {
      id: randomUUID(),
      documentId,
      content: this.generateDocumentContent(contentLength),
      index,
      metadata: {
        pageNumber: Math.floor(index / 5) + 1, // Roughly 5 chunks per page
        chunkType: 'text',
        wordCount: Math.floor(Math.random() * 500) + 50,
        characterCount: Math.floor(Math.random() * 2000) + 200
      },
      createdAt: new Date(),
      ...overrides
    } as DocumentChunk;
  }

  /**
   * Create multiple document chunks
   */
  createDocumentChunks(documentId: string, count: number, overrides: Partial<DocumentChunk> = {}): DocumentChunk[] {
    return Array.from({ length: count }, (_, index) => 
      this.createDocumentChunk(documentId, index, overrides)
    );
  }

  /**
   * Create a test document embedding
   */
  createDocumentEmbedding(chunkId: string, overrides: Partial<DocumentEmbedding> = {}): DocumentEmbedding {
    const models = ['cohere-embed-v4.0', 'text-embedding-3-large', 'text-embedding-ada-002'];
    const selectedModel = models[Math.floor(Math.random() * models.length)];
    
    // Different embedding dimensions for different models
    const modelDimensions = {
      'cohere-embed-v4.0': 1024,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536
    };

    const dimensions = modelDimensions[selectedModel as keyof typeof modelDimensions] || 1536;

    return {
      id: randomUUID(),
      chunkId,
      embedding: JSON.stringify(this.generateEmbedding(dimensions)),
      model: selectedModel,
      createdAt: new Date(),
      ...overrides
    } as DocumentEmbedding;
  }

  /**
   * Create rate limit entry for testing
   */
  createRateLimitEntry(ipAddress: string, endpoint: string, overrides: Partial<any> = {}) {
    return {
      id: randomUUID(),
      ipAddress,
      endpoint,
      attemptCount: 1,
      windowStart: new Date(),
      createdAt: new Date(),
      ...overrides
    };
  }

  /**
   * Create performance metric entry
   */
  createPerformanceMetric(operation: string, duration: number, overrides: Partial<any> = {}) {
    return {
      id: randomUUID(),
      operation,
      duration,
      success: true,
      metadata: {},
      timestamp: new Date(),
      ...overrides
    };
  }

  /**
   * Create a complete test data set with relationships
   */
  createTestDataSet(options: {
    userCount?: number;
    documentsPerUser?: number;
    chunksPerDocument?: number;
    withEmbeddings?: boolean;
    withSessions?: boolean;
  } = {}) {
    const {
      userCount = 3,
      documentsPerUser = 2,
      chunksPerDocument = 10,
      withEmbeddings = true,
      withSessions = true
    } = options;

    const users = this.createUsers(userCount);
    const sessions = withSessions ? users.map(user => this.createSession(user.id)) : [];
    
    const documents: RagDocument[] = [];
    const chunks: DocumentChunk[] = [];
    const embeddings: DocumentEmbedding[] = [];

    users.forEach(user => {
      const userDocs = this.createDocuments(user.id, documentsPerUser);
      documents.push(...userDocs);

      userDocs.forEach(doc => {
        const docChunks = this.createDocumentChunks(doc.id, chunksPerDocument);
        chunks.push(...docChunks);

        if (withEmbeddings) {
          docChunks.forEach(chunk => {
            embeddings.push(this.createDocumentEmbedding(chunk.id));
          });
        }
      });
    });

    return {
      users,
      sessions,
      documents,
      chunks,
      embeddings,
      stats: {
        totalUsers: users.length,
        totalDocuments: documents.length,
        totalChunks: chunks.length,
        totalEmbeddings: embeddings.length,
        totalSessions: sessions.length
      }
    };
  }

  /**
   * Reset sequence counters
   */
  reset(): void {
    this.sequenceCounters.clear();
  }

  /**
   * Get current sequence counters (useful for debugging)
   */
  getSequenceCounters(): Record<string, number> {
    return Object.fromEntries(this.sequenceCounters);
  }
}