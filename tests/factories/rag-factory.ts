import { faker } from '@faker-js/faker';
import { BaseFactory } from './base-factory';
import type {
  FactoryOptions,
  RAGDocumentInsert,
  DocumentContentInsert,
  DocumentChunkInsert,
  DocumentEmbeddingInsert,
  CompleteRAGDocument,
} from './types';

/**
 * RAG Document factory for creating test RAG document data
 */
export class RAGDocumentFactory extends BaseFactory<RAGDocumentInsert> {
  create(options?: FactoryOptions): RAGDocumentInsert {
    const realistic = options?.realistic ?? true;
    const mimeType = faker.helpers.arrayElement([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ]);

    const extension = this.getExtensionFromMimeType(mimeType);
    const fileName = realistic
      ? `${faker.system.fileName()}.${extension}`
      : `test-${faker.string.alphanumeric(8)}.${extension}`;

    const document: RAGDocumentInsert = {
      id: this.generateId(),
      fileName,
      originalName: realistic
        ? faker.helpers.arrayElement([
            'Annual Report 2024.pdf',
            'Product Specification.docx',
            'User Manual.pdf',
            'Technical Documentation.md',
            'Meeting Notes.txt',
            'Project Proposal.pdf',
          ])
        : fileName,
      filePath: `/uploads/${fileName}`,
      mimeType,
      fileSize: this.generateFileSize(this.getFileSizeCategory(mimeType)),
      status: faker.helpers.weightedArrayElement([
        { weight: 10, value: 'uploaded' },
        { weight: 5, value: 'processing' },
        { weight: 5, value: 'text_extracted' },
        { weight: 5, value: 'chunked' },
        { weight: 5, value: 'embedded' },
        { weight: 65, value: 'processed' },
        { weight: 5, value: 'error' },
      ]),
      uploadedBy: options?.overrides?.uploadedBy || this.generateId(),
      createdAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 1, max: 30 * 24 * 60 }),
      ),
      updatedAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 0, max: 24 * 60 }),
      ),
    };

    return this.applyOverrides(document, options?.overrides);
  }

  /**
   * Create PDF document
   */
  createPDFDocument(options?: FactoryOptions): RAGDocumentInsert {
    return this.create({
      ...options,
      overrides: {
        mimeType: 'application/pdf',
        originalName: `${faker.company.name()} ${faker.helpers.arrayElement(['Manual', 'Report', 'Guide'])}.pdf`,
        fileSize: this.generateFileSize('large'),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create DOCX document
   */
  createDOCXDocument(options?: FactoryOptions): RAGDocumentInsert {
    return this.create({
      ...options,
      overrides: {
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        originalName: `${faker.lorem.words(3)}.docx`,
        fileSize: this.generateFileSize('medium'),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create processed document
   */
  createProcessedDocument(options?: FactoryOptions): RAGDocumentInsert {
    return this.create({
      ...options,
      overrides: {
        status: 'processed',
        updatedAt: this.generateTimestamp(
          new Date(),
          -faker.number.int({ min: 1, max: 60 }),
        ),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create failed document
   */
  createFailedDocument(options?: FactoryOptions): RAGDocumentInsert {
    return this.create({
      ...options,
      overrides: {
        status: 'error',
        ...options?.overrides,
      },
    });
  }

  /**
   * Create large document for performance testing
   */
  createLargeDocument(options?: FactoryOptions): RAGDocumentInsert {
    return this.create({
      ...options,
      overrides: {
        fileSize: (100 * 1024 * 1024).toString(), // 100MB
        originalName: `Large Dataset ${faker.date.recent().getFullYear()}.pdf`,
        ...options?.overrides,
      },
    });
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'text/plain': 'txt',
      'text/markdown': 'md',
    };
    return mimeToExt[mimeType as keyof typeof mimeToExt] || 'pdf';
  }

  private getFileSizeCategory(mimeType: string): 'small' | 'medium' | 'large' {
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      return 'small';
    }
    if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return 'medium';
    }
    return 'large'; // PDFs are typically larger
  }
}

/**
 * Document Content factory for creating test document content data
 */
export class DocumentContentFactory extends BaseFactory<DocumentContentInsert> {
  create(options?: FactoryOptions): DocumentContentInsert {
    const realistic = options?.realistic ?? true;
    const extractedText = realistic
      ? this.generateRealisticDocumentText()
      : 'Test extracted text content';

    const content: DocumentContentInsert = {
      id: this.generateId(),
      documentId: options?.overrides?.documentId || this.generateId(),
      textFilePath: `/uploads/text/${this.generateId()}.txt`,
      extractedText,
      pageCount: faker.number.int({ min: 1, max: 50 }).toString(),
      charCount: extractedText.length.toString(),
      metadata: this.generateMetadata('document'),
      createdAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 0, max: 60 }),
      ),
    };

    return this.applyOverrides(content, options?.overrides);
  }

  /**
   * Create technical document content
   */
  createTechnicalContent(options?: FactoryOptions): DocumentContentInsert {
    return this.create({
      ...options,
      overrides: {
        extractedText: this.generateTechnicalText(),
        metadata: {
          ...this.generateMetadata('document'),
          documentType: 'technical',
          containsCode: true,
          containsDiagrams: true,
        },
        ...options?.overrides,
      },
    });
  }

  /**
   * Create large content for performance testing
   */
  createLargeContent(options?: FactoryOptions): DocumentContentInsert {
    const largeText = this.generateLargeText();
    return this.create({
      ...options,
      overrides: {
        extractedText: largeText,
        charCount: largeText.length.toString(),
        pageCount: faker.number.int({ min: 100, max: 500 }).toString(),
        ...options?.overrides,
      },
    });
  }

  private generateRealisticDocumentText(): string {
    const sections = [
      this.generateExecutiveSummary(),
      this.generateIntroduction(),
      this.generateMethodology(),
      this.generateResults(),
      this.generateConclusion(),
    ];

    return sections.join('\n\n');
  }

  private generateTechnicalText(): string {
    return `
# Technical Specification

## Overview
${faker.lorem.paragraph()}

## Architecture
The system follows a microservices architecture with the following components:

- **API Gateway**: Routes requests to appropriate services
- **Authentication Service**: Handles user authentication and authorization  
- **Data Service**: Manages data persistence and retrieval
- **Processing Service**: Handles document processing and analysis

## Implementation Details

### Database Schema
\`\`\`sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
\`\`\`

### API Endpoints
- \`GET /api/documents\` - List all documents
- \`POST /api/documents\` - Create new document
- \`PUT /api/documents/:id\` - Update document
- \`DELETE /api/documents/:id\` - Delete document

## Performance Considerations
${faker.lorem.paragraphs(2)}

## Security
${faker.lorem.paragraph()}
    `.trim();
  }

  private generateExecutiveSummary(): string {
    return `# Executive Summary\n\n${faker.lorem.paragraphs(2)}`;
  }

  private generateIntroduction(): string {
    return `# Introduction\n\n${faker.lorem.paragraphs(3)}`;
  }

  private generateMethodology(): string {
    return `# Methodology\n\n${faker.lorem.paragraphs(2)}\n\n## Approach\n${faker.lorem.paragraph()}`;
  }

  private generateResults(): string {
    return `# Results\n\n${faker.lorem.paragraphs(3)}`;
  }

  private generateConclusion(): string {
    return `# Conclusion\n\n${faker.lorem.paragraphs(2)}`;
  }

  private generateLargeText(): string {
    const sections = Array.from(
      { length: 20 },
      (_, i) => `# Section ${i + 1}\n\n${faker.lorem.paragraphs(10)}`,
    );
    return sections.join('\n\n');
  }
}

/**
 * Document Chunk factory for creating test document chunk data
 */
export class DocumentChunkFactory extends BaseFactory<DocumentChunkInsert> {
  create(options?: FactoryOptions): DocumentChunkInsert {
    const chunkIndex = options?.overrides?.chunkIndex || 0;
    const realistic = options?.realistic ?? true;

    const chunk: DocumentChunkInsert = {
      id: this.generateId(),
      documentId: options?.overrides?.documentId || this.generateId(),
      chunkIndex: chunkIndex.toString(),
      content: realistic
        ? this.generateRealisticChunkContent(chunkIndex)
        : `Test chunk ${chunkIndex} content`,
      metadata: this.generateMetadata('chunk'),
      tokenCount: faker.number.int({ min: 50, max: 500 }).toString(),
      createdAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 0, max: 30 }),
      ),
    };

    return this.applyOverrides(chunk, options?.overrides);
  }

  /**
   * Create semantic chunk
   */
  createSemanticChunk(options?: FactoryOptions): DocumentChunkInsert {
    return this.create({
      ...options,
      overrides: {
        content: this.generateSemanticContent(),
        metadata: {
          ...this.generateMetadata('chunk'),
          chunkType: 'semantic',
          semanticScore: faker.number.float({
            min: 0.7,
            max: 1.0,
            fractionDigits: 3,
          }),
        },
        ...options?.overrides,
      },
    });
  }

  /**
   * Create code chunk
   */
  createCodeChunk(options?: FactoryOptions): DocumentChunkInsert {
    return this.create({
      ...options,
      overrides: {
        content: this.generateCodeChunkContent(),
        metadata: {
          ...this.generateMetadata('chunk'),
          containsCode: true,
          language: faker.helpers.arrayElement(['javascript', 'python', 'sql']),
        },
        ...options?.overrides,
      },
    });
  }

  /**
   * Create chunks batch for a document
   */
  createChunksForDocument(
    documentId: string,
    chunkCount: number,
    options?: FactoryOptions,
  ): DocumentChunkInsert[] {
    return this.createBatch({
      count: chunkCount,
      ...options,
      overrides: { documentId, ...options?.overrides },
      customizer: (index) => ({ chunkIndex: index }),
    });
  }

  private generateRealisticChunkContent(chunkIndex: number): string {
    const contentTypes = [
      () => this.generateParagraphChunk(),
      () => this.generateListChunk(),
      () => this.generateTableChunk(),
      () => this.generateCodeChunk(),
      () => this.generateQuoteChunk(),
    ];

    const generator = faker.helpers.arrayElement(contentTypes);
    const content = generator();

    // Add context about chunk position
    const prefix =
      chunkIndex === 0
        ? 'Document beginning: '
        : `Continuing from previous section: `;

    return prefix + content;
  }

  private generateSemanticContent(): string {
    // Generate content that forms a complete semantic unit
    const topics = [
      'user authentication and authorization',
      'database design and optimization',
      'API development best practices',
      'security considerations',
      'performance monitoring',
      'testing strategies',
    ];

    const topic = faker.helpers.arrayElement(topics);

    return `This section discusses ${topic}. ${faker.lorem.paragraphs(3)}`;
  }

  private generateCodeChunkContent(): string {
    const language = faker.helpers.arrayElement([
      'javascript',
      'python',
      'sql',
    ]);

    switch (language) {
      case 'javascript':
        return `
// ${faker.hacker.phrase()}
function ${faker.hacker.verb()}Data(${faker.hacker.noun()}) {
  const result = ${faker.hacker.noun()}.map(item => ({
    id: item.id,
    ${faker.hacker.noun()}: item.${faker.hacker.verb()}(),
    processed: true
  }));
  
  return result.filter(item => item.${faker.hacker.noun()});
}
        `.trim();

      case 'python':
        return `
def ${faker.hacker.verb()}_${faker.hacker.noun()}(data):
    """${faker.lorem.sentence()}"""
    result = []
    for item in data:
        if item.get('${faker.hacker.noun()}'):
            result.append({
                'id': item['id'],
                '${faker.hacker.noun()}': item['${faker.hacker.verb()}'](),
                'processed': True
            })
    return result
        `.trim();

      case 'sql':
        return `
-- ${faker.lorem.sentence()}
SELECT 
  ${faker.hacker.noun()}_id,
  ${faker.hacker.verb()}_${faker.hacker.noun()}() as result,
  processed_at
FROM ${faker.hacker.noun()}_table
WHERE ${faker.hacker.adjective()} = true
  AND created_at > NOW() - INTERVAL '30 days'
ORDER BY processed_at DESC;
        `.trim();

      default:
        return this.generateParagraphChunk();
    }
  }

  private generateParagraphChunk(): string {
    return faker.lorem.paragraphs(faker.number.int({ min: 1, max: 3 }));
  }

  private generateListChunk(): string {
    const items = Array.from(
      { length: faker.number.int({ min: 3, max: 8 }) },
      () => `- ${faker.lorem.sentence()}`,
    );
    return `Key points:\n\n${items.join('\n')}`;
  }

  private generateTableChunk(): string {
    const headers = ['Item', 'Value', 'Status'];
    const rows = Array.from(
      { length: faker.number.int({ min: 3, max: 6 }) },
      () => [
        faker.lorem.word(),
        faker.number.int({ min: 1, max: 100 }),
        faker.helpers.arrayElement(['Active', 'Inactive', 'Pending']),
      ],
    );

    return `| ${headers.join(' | ')} |
|${headers.map(() => '---').join('|')}|
${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}`;
  }

  private generateQuoteChunk(): string {
    return `> ${faker.lorem.sentence()}\n\n${faker.lorem.paragraph()}`;
  }
}

/**
 * Document Embedding factory for creating test embedding data
 */
export class DocumentEmbeddingFactory extends BaseFactory<DocumentEmbeddingInsert> {
  create(options?: FactoryOptions): DocumentEmbeddingInsert {
    const model = faker.helpers.arrayElement([
      'cohere-embed-v4.0',
      'text-embedding-ada-002',
      'text-embedding-3-small',
      'text-embedding-3-large',
    ]);

    const dimensions = this.getDimensionsForModel(model);

    const embedding: DocumentEmbeddingInsert = {
      id: this.generateId(),
      chunkId: options?.overrides?.chunkId || this.generateId(),
      embedding: JSON.stringify(this.generateEmbedding(dimensions)),
      model,
      createdAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 0, max: 15 }),
      ),
    };

    return this.applyOverrides(embedding, options?.overrides);
  }

  /**
   * Create embedding for specific model
   */
  createForModel(
    model: string,
    options?: FactoryOptions,
  ): DocumentEmbeddingInsert {
    const dimensions = this.getDimensionsForModel(model);

    return this.create({
      ...options,
      overrides: {
        model,
        embedding: JSON.stringify(this.generateEmbedding(dimensions)),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create embeddings batch for multiple chunks
   */
  createEmbeddingsForChunks(
    chunkIds: string[],
    options?: FactoryOptions,
  ): DocumentEmbeddingInsert[] {
    return chunkIds.map((chunkId) =>
      this.create({
        ...options,
        overrides: { chunkId, ...options?.overrides },
      }),
    );
  }

  /**
   * Create similar embeddings (for testing similarity search)
   */
  createSimilarEmbeddings(
    baseEmbedding: number[],
    count: number,
    similarity = 0.8,
  ): DocumentEmbeddingInsert[] {
    return Array.from({ length: count }, () => {
      const similarEmbedding = this.generateSimilarEmbedding(
        baseEmbedding,
        similarity,
      );
      return this.create({
        overrides: {
          embedding: JSON.stringify(similarEmbedding),
        },
      });
    });
  }

  private getDimensionsForModel(model: string): number {
    const modelDimensions = {
      'cohere-embed-v4.0': 1024,
      'text-embedding-ada-002': 1536,
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
    };
    return modelDimensions[model as keyof typeof modelDimensions] || 1536;
  }

  private generateSimilarEmbedding(
    baseEmbedding: number[],
    similarity: number,
  ): number[] {
    const noise = 1 - similarity;
    return baseEmbedding.map(
      (value) => value + faker.number.float({ min: -noise, max: noise }) * 0.1,
    );
  }
}

/**
 * Complete RAG Document factory that creates document with all related data
 */
export class CompleteRAGDocumentFactory extends BaseFactory<CompleteRAGDocument> {
  private documentFactory = new RAGDocumentFactory(this.seed);
  private contentFactory = new DocumentContentFactory(this.seed);
  private chunkFactory = new DocumentChunkFactory(this.seed);
  private embeddingFactory = new DocumentEmbeddingFactory(this.seed);

  create(options?: FactoryOptions): CompleteRAGDocument {
    const document = this.documentFactory.create(options);
    const content = this.contentFactory.create({
      overrides: { documentId: document.id },
      ...options,
    });

    // Generate realistic number of chunks based on content size
    const chunkCount = this.calculateChunkCount(content.extractedText || '');
    const chunks = this.chunkFactory.createChunksForDocument(
      document.id,
      chunkCount,
      options,
    );

    // Create embeddings for all chunks
    const embeddings = this.embeddingFactory.createEmbeddingsForChunks(
      chunks.map((chunk) => chunk.id),
      options,
    );

    const result: CompleteRAGDocument = {
      document,
      content,
      chunks,
      embeddings,
    };

    return this.applyOverrides(result, options?.overrides);
  }

  /**
   * Create minimal RAG document (for performance testing)
   */
  createMinimal(options?: FactoryOptions): CompleteRAGDocument {
    const document = this.documentFactory.create(options);
    const content = this.contentFactory.create({
      overrides: {
        documentId: document.id,
        extractedText: faker.lorem.paragraph(),
      },
    });

    const chunks = this.chunkFactory.createChunksForDocument(
      document.id,
      1,
      options,
    );
    const embeddings = this.embeddingFactory.createEmbeddingsForChunks(
      chunks.map((chunk) => chunk.id),
      options,
    );

    return { document, content, chunks, embeddings };
  }

  /**
   * Create large RAG document (for performance testing)
   */
  createLarge(options?: FactoryOptions): CompleteRAGDocument {
    const document = this.documentFactory.createLargeDocument(options);
    const content = this.contentFactory.createLargeContent({
      overrides: { documentId: document.id },
    });

    const chunks = this.chunkFactory.createChunksForDocument(
      document.id,
      50,
      options,
    );
    const embeddings = this.embeddingFactory.createEmbeddingsForChunks(
      chunks.map((chunk) => chunk.id),
      options,
    );

    return { document, content, chunks, embeddings };
  }

  private calculateChunkCount(text: string): number {
    const avgChunkSize = 500; // characters
    const baseCount = Math.max(1, Math.ceil(text.length / avgChunkSize));

    // Add some variance
    const variance = faker.number.int({ min: -2, max: 3 });
    return Math.max(1, baseCount + variance);
  }
}

// Export factory instances
export const ragDocumentFactory = new RAGDocumentFactory();
export const documentContentFactory = new DocumentContentFactory();
export const documentChunkFactory = new DocumentChunkFactory();
export const documentEmbeddingFactory = new DocumentEmbeddingFactory();
export const completeRAGDocumentFactory = new CompleteRAGDocumentFactory();
