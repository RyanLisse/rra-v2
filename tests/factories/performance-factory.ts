import { faker } from '@faker-js/faker';
import { BaseFactory, BatchCreator } from './base-factory';
import { RelationshipFactory } from './relationship-factory';
import { CompleteUserFactory } from './user-factory';
import { CompleteRAGDocumentFactory } from './rag-factory';
import { CompleteChatFactory } from './chat-factory';
import type {
  FactoryOptions,
  PerformanceDataOptions,
  PerformanceScenario,
  PerformanceMetrics,
  PerformanceReport,
} from './types';

/**
 * Performance factory for creating large-scale test data
 */
export class PerformanceFactory extends BaseFactory<any> {
  private userFactory = new CompleteUserFactory(this.seed);
  private ragFactory = new CompleteRAGDocumentFactory(this.seed);
  private chatFactory = new CompleteChatFactory(this.seed);
  private relationshipFactory = new RelationshipFactory(this.seed);

  private metrics: PerformanceMetrics[] = [];

  create(options?: FactoryOptions): any {
    throw new Error('PerformanceFactory requires specific performance methods');
  }

  /**
   * Create performance test dataset based on scale
   */
  async createPerformanceDataset(
    scale: PerformanceDataOptions['scale'] = 'medium',
    options?: PerformanceDataOptions,
  ): Promise<any> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    const config = this.getScaleConfig(scale);
    const patterns = options?.patterns || 'mixed';
    const scenarios = options?.scenarios || ['users', 'documents', 'chats'];

    const dataset: any = {};

    // Create users
    if (scenarios.includes('users')) {
      console.log(`Creating ${config.users} users...`);
      dataset.users = await this.createPerformanceUsers(config.users, patterns);
    }

    // Create documents
    if (scenarios.includes('documents')) {
      console.log(`Creating ${config.documents} documents...`);
      dataset.documents = await this.createPerformanceDocuments(
        config.documents,
        patterns,
      );
    }

    // Create chats
    if (scenarios.includes('chats')) {
      console.log(`Creating ${config.chats} chats...`);
      dataset.chats = await this.createPerformanceChats(config.chats, patterns);
    }

    // Create relationships if requested
    if (scenarios.includes('relationships')) {
      console.log('Creating relationships...');
      dataset.relationships =
        await this.createPerformanceRelationships(dataset);
    }

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;

    const performanceMetrics: PerformanceMetrics = {
      operationType: 'insert',
      tableName: 'performance_dataset',
      rowCount: this.getTotalRowCount(dataset),
      executionTime: endTime - startTime,
      memoryUsage: endMemory - startMemory,
      cpuUsage: process.cpuUsage().user / 1000, // Convert to milliseconds
      timestamp: new Date(),
    };

    this.metrics.push(performanceMetrics);

    return {
      dataset,
      metrics: performanceMetrics,
      config,
    };
  }

  /**
   * Create load testing scenarios
   */
  createLoadTestingScenarios(): PerformanceScenario[] {
    return [
      {
        name: 'baseline-load',
        description: 'Baseline load testing with standard dataset',
        scale: 'small',
        setup: async () => {
          return this.createPerformanceDataset('small', {
            scenarios: ['users', 'documents', 'chats'],
            patterns: 'sequential',
          });
        },
        data: { scenario: 'baseline-load' },
        metrics: {
          expectedRows: 1000,
          maxSetupTime: 30000, // 30 seconds
          maxMemoryUsage: 100 * 1024 * 1024, // 100MB
        },
      },
      {
        name: 'moderate-load',
        description: 'Moderate load testing with increased dataset',
        scale: 'medium',
        setup: async () => {
          return this.createPerformanceDataset('medium', {
            scenarios: ['users', 'documents', 'chats', 'relationships'],
            patterns: 'mixed',
          });
        },
        data: { scenario: 'moderate-load' },
        metrics: {
          expectedRows: 10000,
          maxSetupTime: 120000, // 2 minutes
          maxMemoryUsage: 500 * 1024 * 1024, // 500MB
        },
      },
      {
        name: 'heavy-load',
        description: 'Heavy load testing with large dataset',
        scale: 'large',
        setup: async () => {
          return this.createPerformanceDataset('large', {
            scenarios: ['users', 'documents', 'chats', 'relationships'],
            patterns: 'random',
          });
        },
        data: { scenario: 'heavy-load' },
        metrics: {
          expectedRows: 100000,
          maxSetupTime: 600000, // 10 minutes
          maxMemoryUsage: 2 * 1024 * 1024 * 1024, // 2GB
        },
      },
      {
        name: 'extreme-load',
        description: 'Extreme load testing with very large dataset',
        scale: 'xlarge',
        setup: async () => {
          return this.createPerformanceDataset('xlarge', {
            scenarios: ['users', 'documents', 'chats'],
            patterns: 'sequential', // More predictable for extreme loads
          });
        },
        data: { scenario: 'extreme-load' },
        metrics: {
          expectedRows: 1000000,
          maxSetupTime: 1800000, // 30 minutes
          maxMemoryUsage: 8 * 1024 * 1024 * 1024, // 8GB
        },
      },
    ];
  }

  /**
   * Create stress testing scenarios
   */
  createStressTestingScenarios(): PerformanceScenario[] {
    return [
      {
        name: 'memory-stress',
        description: 'Memory stress testing with large documents',
        scale: 'large',
        setup: async () => {
          // Create documents with very large content
          const documents = await BatchCreator.createLargeBatch(
            this.ragFactory,
            5000,
            100,
            async (batch, progress) => {
              console.log(
                `Memory stress progress: ${(progress * 100).toFixed(1)}%`,
              );
            },
          );

          // Make documents larger
          documents.forEach((doc) => {
            doc.content.extractedText = Array.from({ length: 100 }, () =>
              faker.lorem.paragraphs(50),
            ).join('\n\n');
          });

          return { documents };
        },
        data: { scenario: 'memory-stress' },
        metrics: {
          expectedRows: 5000,
          maxSetupTime: 300000, // 5 minutes
          maxMemoryUsage: 4 * 1024 * 1024 * 1024, // 4GB
        },
      },
      {
        name: 'embedding-stress',
        description: 'Stress testing for embedding generation',
        scale: 'large',
        setup: async () => {
          const documents = Array.from({ length: 1000 }, () =>
            this.ragFactory.createLarge(),
          );

          // Create additional embeddings for each chunk (multiple models)
          const models = [
            'cohere-embed-v4.0',
            'text-embedding-ada-002',
            'text-embedding-3-large',
          ];
          const extraEmbeddings = documents.flatMap((doc) =>
            doc.chunks.flatMap((chunk) =>
              models.map((model) =>
                this.ragFactory.documentEmbeddingFactory.createForModel(model, {
                  overrides: { chunkId: chunk.id },
                }),
              ),
            ),
          );

          return { documents, extraEmbeddings };
        },
        data: { scenario: 'embedding-stress' },
        metrics: {
          expectedRows: 150000, // Includes extra embeddings
          maxSetupTime: 600000, // 10 minutes
          maxMemoryUsage: 3 * 1024 * 1024 * 1024, // 3GB
        },
      },
      {
        name: 'concurrent-access',
        description: 'Stress testing for concurrent user access',
        scale: 'medium',
        setup: async () => {
          // Create users with overlapping sessions
          const users = await BatchCreator.createParallel(
            this.userFactory,
            [100, 100, 100, 100, 100], // 5 batches of 100 users
            3, // Concurrency limit
          );

          // Create concurrent sessions for each user
          const concurrentSessions = users.flat().flatMap((user) => {
            const sessionCount = faker.number.int({ min: 5, max: 15 });
            return Array.from({ length: sessionCount }, () => ({
              userId: user.user.id,
              token: faker.string.alphanumeric(64),
              expiresAt: faker.date.future(),
              ipAddress: faker.internet.ip(),
              userAgent: faker.internet.userAgent(),
              createdAt: faker.date.recent(),
              updatedAt: faker.date.recent(),
            }));
          });

          return { users: users.flat(), concurrentSessions };
        },
        data: { scenario: 'concurrent-access' },
        metrics: {
          expectedRows: 7500, // 500 users + ~7000 sessions
          maxSetupTime: 180000, // 3 minutes
          maxMemoryUsage: 1 * 1024 * 1024 * 1024, // 1GB
        },
      },
    ];
  }

  /**
   * Create search performance scenarios
   */
  createSearchPerformanceScenarios(): PerformanceScenario[] {
    return [
      {
        name: 'vector-search-performance',
        description: 'Vector similarity search performance testing',
        scale: 'large',
        setup: async () => {
          // Create documents with embeddings optimized for search testing
          const documents = Array.from({ length: 10000 }, () =>
            this.ragFactory.create(),
          );

          // Create base query vectors for testing
          const queryVectors = Array.from({ length: 100 }, () => ({
            id: faker.string.uuid(),
            vector: this.generateEmbedding(1536),
            query: faker.lorem.sentence(),
          }));

          return { documents, queryVectors };
        },
        data: { scenario: 'vector-search-performance' },
        metrics: {
          expectedRows: 100000, // 10k docs with ~10 chunks each
          maxSetupTime: 900000, // 15 minutes
          maxMemoryUsage: 6 * 1024 * 1024 * 1024, // 6GB
        },
      },
      {
        name: 'text-search-performance',
        description: 'Full-text search performance testing',
        scale: 'large',
        setup: async () => {
          const documents = Array.from({ length: 5000 }, () => {
            const doc = this.ragFactory.create();
            // Ensure content has searchable terms
            doc.content.extractedText = this.generateSearchableContent();
            doc.chunks.forEach((chunk) => {
              chunk.content = this.generateSearchableChunkContent();
            });
            return doc;
          });

          const searchQueries = Array.from({ length: 200 }, () => ({
            id: faker.string.uuid(),
            query: this.generateSearchQuery(),
            filters: this.generateSearchFilters(),
          }));

          return { documents, searchQueries };
        },
        data: { scenario: 'text-search-performance' },
        metrics: {
          expectedRows: 50000,
          maxSetupTime: 600000, // 10 minutes
          maxMemoryUsage: 3 * 1024 * 1024 * 1024, // 3GB
        },
      },
    ];
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(testSuite: string): PerformanceReport {
    const relevantMetrics = this.metrics.filter(
      (m) => m.timestamp.getTime() > Date.now() - 3600000, // Last hour
    );

    const totalQueries = relevantMetrics.length;
    const totalTime = relevantMetrics.reduce(
      (sum, m) => sum + m.executionTime,
      0,
    );
    const averageTime = totalTime / totalQueries;
    const peakMemory = Math.max(...relevantMetrics.map((m) => m.memoryUsage));

    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (averageTime > 5000) {
      recommendations.push(
        'Consider optimizing data creation algorithms - average time is high',
      );
    }
    if (peakMemory > 2 * 1024 * 1024 * 1024) {
      recommendations.push(
        'Memory usage is high - consider batch processing or streaming',
      );
    }
    if (totalQueries > 1000) {
      recommendations.push(
        'High query volume detected - consider connection pooling',
      );
    }

    return {
      testSuite,
      metrics: relevantMetrics,
      summary: {
        totalQueries,
        totalTime,
        averageTime,
        peakMemory,
        recommendations,
      },
    };
  }

  /**
   * Clear performance metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  private async createPerformanceUsers(
    count: number,
    pattern: string,
  ): Promise<any[]> {
    const batchSize = Math.min(count, 1000);

    return BatchCreator.createLargeBatch(
      this.userFactory,
      count,
      batchSize,
      async (batch, progress) => {
        console.log(`User creation progress: ${(progress * 100).toFixed(1)}%`);
      },
    );
  }

  private async createPerformanceDocuments(
    count: number,
    pattern: string,
  ): Promise<any[]> {
    const batchSize = Math.min(count, 500); // Smaller batches for documents

    return BatchCreator.createLargeBatch(
      this.ragFactory,
      count,
      batchSize,
      async (batch, progress) => {
        console.log(
          `Document creation progress: ${(progress * 100).toFixed(1)}%`,
        );
      },
    );
  }

  private async createPerformanceChats(
    count: number,
    pattern: string,
  ): Promise<any[]> {
    const batchSize = Math.min(count, 1000);

    return BatchCreator.createLargeBatch(
      this.chatFactory,
      count,
      batchSize,
      async (batch, progress) => {
        console.log(`Chat creation progress: ${(progress * 100).toFixed(1)}%`);
      },
    );
  }

  private async createPerformanceRelationships(dataset: any): Promise<any> {
    // Create relationships between existing data
    const users = dataset.users || [];
    const documents = dataset.documents || [];
    const chats = dataset.chats || [];

    // Assign documents to random users
    documents.forEach((doc: any) => {
      if (users.length > 0) {
        const randomUser = faker.helpers.arrayElement(users);
        doc.document.uploadedBy = randomUser.user.id;
      }
    });

    // Assign chats to random users
    chats.forEach((chat: any) => {
      if (users.length > 0) {
        const randomUser = faker.helpers.arrayElement(users);
        chat.chat.userId = randomUser.user.id;
      }
    });

    return {
      userDocumentAssignments: documents.length,
      userChatAssignments: chats.length,
    };
  }

  private getScaleConfig(scale: PerformanceDataOptions['scale']) {
    const configs = {
      small: {
        users: 100,
        documents: 50,
        chats: 200,
        chunksPerDoc: 5,
      },
      medium: {
        users: 1000,
        documents: 500,
        chats: 2000,
        chunksPerDoc: 10,
      },
      large: {
        users: 10000,
        documents: 5000,
        chats: 20000,
        chunksPerDoc: 20,
      },
      xlarge: {
        users: 100000,
        documents: 50000,
        chats: 200000,
        chunksPerDoc: 50,
      },
    };

    return configs[scale || 'medium'];
  }

  private getTotalRowCount(dataset: any): number {
    let count = 0;

    if (dataset.users) {
      count += dataset.users.length;
      // Count related sessions and accounts
      dataset.users.forEach((user: any) => {
        count += user.sessions?.length || 0;
        count += user.accounts?.length || 0;
      });
    }

    if (dataset.documents) {
      dataset.documents.forEach((doc: any) => {
        count += 1; // document
        count += 1; // content
        count += doc.chunks?.length || 0;
        count += doc.embeddings?.length || 0;
      });
    }

    if (dataset.chats) {
      dataset.chats.forEach((chat: any) => {
        count += 1; // chat
        count += chat.messages?.length || 0;
        count += chat.votes?.length || 0;
        count += chat.streams?.length || 0;
      });
    }

    return count;
  }

  private generateSearchableContent(): string {
    const topics = [
      'artificial intelligence and machine learning',
      'database optimization and performance',
      'web development and user experience',
      'cloud computing and infrastructure',
      'cybersecurity and data protection',
      'mobile application development',
    ];

    const selectedTopics = faker.helpers.arrayElements(topics, {
      min: 2,
      max: 4,
    });

    return selectedTopics
      .map((topic) => {
        return `# ${topic.toUpperCase()}\n\n${faker.lorem.paragraphs(5)}\n\n## Key Concepts\n\n${Array.from(
          { length: 5 },
          () => `- ${faker.lorem.sentence()}`,
        ).join('\n')}`;
      })
      .join('\n\n');
  }

  private generateSearchableChunkContent(): string {
    const concepts = [
      'API design patterns',
      'database indexing strategies',
      'user authentication flows',
      'performance optimization techniques',
      'error handling best practices',
      'testing methodologies',
    ];

    const concept = faker.helpers.arrayElement(concepts);
    return `This section covers ${concept}. ${faker.lorem.paragraphs(2)}`;
  }

  private generateSearchQuery(): string {
    const queries = [
      'API authentication methods',
      'database performance optimization',
      'error handling strategies',
      'user experience best practices',
      'security implementation guide',
      'testing automation setup',
    ];

    return faker.helpers.arrayElement(queries);
  }

  private generateSearchFilters(): Record<string, any> {
    return {
      dateRange: {
        start: faker.date.past().toISOString(),
        end: faker.date.recent().toISOString(),
      },
      documentType: faker.helpers.arrayElement(['pdf', 'docx', 'txt']),
      tags: faker.helpers.arrayElements(
        ['technical', 'guide', 'tutorial', 'reference'],
        { min: 1, max: 3 },
      ),
    };
  }
}

// Export factory instance
export const performanceFactory = new PerformanceFactory();
