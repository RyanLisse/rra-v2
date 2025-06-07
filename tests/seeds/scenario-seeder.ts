import { BaseSeeder } from './base-seeder';
import { relationshipFactory } from '../factories/relationship-factory';
import { performanceFactory } from '../factories/performance-factory';
import * as schema from '@/lib/db/schema';
import type { SeederResult, TestScenario } from '../factories/types';

/**
 * Scenario seeder - creates specific test scenarios
 */
export class ScenarioSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🎬 Starting scenario seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};
    const errors: Error[] = [];

    try {
      // Clean and migrate if requested
      if (this.config.clean) {
        await this.cleanDatabase();
        await this.runMigrations();
      }

      // Create scenarios based on configuration
      await this.createConfiguredScenarios(rowsCreated);

      // Verify the data
      const verification = await this.verifyDatabaseState();
      if (!verification.valid) {
        verification.issues.forEach((issue) => {
          errors.push(new Error(issue));
        });
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ Scenario seeding completed in ${executionTime}ms`);

      return this.generateResult(
        true,
        rowsCreated,
        errors.length > 0 ? errors : undefined,
      );
    } catch (error) {
      console.error('❌ Scenario seeding failed:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create scenarios based on configuration
   */
  private async createConfiguredScenarios(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scenarios = this.config.scenarios || [];

    if (scenarios.length === 0) {
      console.log(
        'No specific scenarios requested, creating default scenario...',
      );
      await this.createDefaultScenario(rowsCreated);
      return;
    }

    for (const scenarioName of scenarios) {
      console.log(`📋 Creating scenario: ${scenarioName}`);

      try {
        await this.createScenario(scenarioName, rowsCreated);
        console.log(`  ✓ Scenario ${scenarioName} completed`);
      } catch (error) {
        console.error(`  ❌ Scenario ${scenarioName} failed:`, error);
        throw error;
      }
    }
  }

  /**
   * Create a specific scenario
   */
  private async createScenario(
    scenarioName: string,
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scenarioMethods: Record<string, () => Promise<TestScenario>> = {
      'collaborative-workspace': () =>
        relationshipFactory.createCollaborativeWorkspace(),
      'customer-support': () =>
        relationshipFactory.createCustomerSupportScenario(),
      research: () => relationshipFactory.createResearchScenario(),
      'e-learning': () => relationshipFactory.createELearningScenario(),
      'baseline-load': () => this.createBaselineLoadScenario(),
      'memory-stress': () => this.createMemoryStressScenario(),
      'vector-search': () => this.createVectorSearchScenario(),
      'chat-volume': () => this.createChatVolumeScenario(),
      'document-processing': () => this.createDocumentProcessingScenario(),
      'user-onboarding': () => this.createUserOnboardingScenario(),
      'admin-dashboard': () => this.createAdminDashboardScenario(),
      'multi-tenant': () => this.createMultiTenantScenario(),
    };

    const scenarioCreator = scenarioMethods[scenarioName];
    if (!scenarioCreator) {
      throw new Error(
        `Unknown scenario: ${scenarioName}. Available scenarios: ${Object.keys(scenarioMethods).join(', ')}`,
      );
    }

    const scenario = await scenarioCreator();
    const data = await scenario.setup();

    await this.insertScenarioData(data, rowsCreated);
  }

  /**
   * Create default scenario
   */
  private async createDefaultScenario(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scenario = relationshipFactory.createCollaborativeWorkspace();
    const data = await scenario.setup();
    await this.insertScenarioData(data, rowsCreated);
  }

  /**
   * Insert scenario data into database
   */
  private async insertScenarioData(
    data: any,
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    // Handle different data structures based on scenario type

    if (data.users) {
      await this.insertUsers(data.users, rowsCreated);
    }

    if (
      data.sharedDocuments ||
      data.documents ||
      data.researchPapers ||
      data.courseMaterials ||
      data.knowledgeBase
    ) {
      const documents =
        data.sharedDocuments ||
        data.documents ||
        data.researchPapers ||
        data.courseMaterials ||
        data.knowledgeBase;
      await this.insertDocuments(documents, rowsCreated);
    }

    if (
      data.projectChat ||
      data.chats ||
      data.discussions ||
      data.studyGroups ||
      data.qaSessions ||
      data.supportChats
    ) {
      const chats = [
        ...(data.projectChat ? [data.projectChat] : []),
        ...(data.chats || []),
        ...(data.discussions || []),
        ...(data.studyGroups || []),
        ...(data.qaSessions || []),
        ...(data.supportChats || []),
      ];
      await this.insertChats(chats, rowsCreated);
    }

    // Handle performance scenario data
    if (data.dataset) {
      await this.insertPerformanceDataset(data.dataset, rowsCreated);
    }

    // Handle specific scenario data
    if (data.researchers) {
      await this.insertUsers(data.researchers, rowsCreated);
    }

    if (data.instructors) {
      await this.insertUsers(data.instructors, rowsCreated);
    }

    if (data.students) {
      await this.insertUsers(data.students, rowsCreated);
    }

    if (data.agents) {
      await this.insertUsers(data.agents, rowsCreated);
    }

    if (data.customers) {
      await this.insertUsers(data.customers, rowsCreated);
    }
  }

  /**
   * Insert users from scenario data
   */
  private async insertUsers(
    users: any[],
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    if (!users || users.length === 0) return;

    const userData = users.map((u) => u.user || u);
    const sessionData = users.flatMap((u) => u.sessions || []);
    const accountData = users.flatMap((u) => u.accounts || []);

    await this.batchInsert(schema.user, userData);
    rowsCreated.users = (rowsCreated.users || 0) + userData.length;

    if (sessionData.length > 0) {
      await this.batchInsert(schema.session, sessionData);
      rowsCreated.sessions = (rowsCreated.sessions || 0) + sessionData.length;
    }

    if (accountData.length > 0) {
      await this.batchInsert(schema.account, accountData);
      rowsCreated.accounts = (rowsCreated.accounts || 0) + accountData.length;
    }
  }

  /**
   * Insert documents from scenario data
   */
  private async insertDocuments(
    documents: any[],
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    if (!documents || documents.length === 0) return;

    const docData = documents.map((d) => d.document || d);
    const contentData = documents.map((d) => d.content).filter(Boolean);
    const chunkData = documents.flatMap((d) => d.chunks || []);
    const embeddingData = documents.flatMap((d) => d.embeddings || []);

    await this.batchInsert(schema.ragDocument, docData);
    rowsCreated.ragDocuments = (rowsCreated.ragDocuments || 0) + docData.length;

    if (contentData.length > 0) {
      await this.batchInsert(schema.documentContent, contentData);
      rowsCreated.documentContent =
        (rowsCreated.documentContent || 0) + contentData.length;
    }

    if (chunkData.length > 0) {
      await this.batchInsert(schema.documentChunk, chunkData);
      rowsCreated.documentChunks =
        (rowsCreated.documentChunks || 0) + chunkData.length;
    }

    if (embeddingData.length > 0) {
      await this.batchInsert(schema.documentEmbedding, embeddingData);
      rowsCreated.documentEmbeddings =
        (rowsCreated.documentEmbeddings || 0) + embeddingData.length;
    }
  }

  /**
   * Insert chats from scenario data
   */
  private async insertChats(
    chats: any[],
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    if (!chats || chats.length === 0) return;

    const chatData = chats.map((c) => c.chat || c);
    const messageData = chats.flatMap((c) => c.messages || []);
    const voteData = chats.flatMap((c) => c.votes || []);
    const streamData = chats.flatMap((c) => c.streams || []);

    await this.batchInsert(schema.chat, chatData);
    rowsCreated.chats = (rowsCreated.chats || 0) + chatData.length;

    if (messageData.length > 0) {
      await this.batchInsert(schema.message, messageData);
      rowsCreated.messages = (rowsCreated.messages || 0) + messageData.length;
    }

    if (voteData.length > 0) {
      await this.batchInsert(schema.vote, voteData);
      rowsCreated.votes = (rowsCreated.votes || 0) + voteData.length;
    }

    if (streamData.length > 0) {
      await this.batchInsert(schema.stream, streamData);
      rowsCreated.streams = (rowsCreated.streams || 0) + streamData.length;
    }
  }

  /**
   * Insert performance dataset
   */
  private async insertPerformanceDataset(
    dataset: any,
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    if (dataset.users) {
      await this.insertUsers(dataset.users, rowsCreated);
    }

    if (dataset.documents) {
      await this.insertDocuments(dataset.documents, rowsCreated);
    }

    if (dataset.chats) {
      await this.insertChats(dataset.chats, rowsCreated);
    }
  }

  // Performance scenario creators
  private async createBaselineLoadScenario(): Promise<TestScenario> {
    const scenarios = performanceFactory.createLoadTestingScenarios();
    return scenarios.find((s) => s.name === 'baseline-load') || scenarios[0];
  }

  private async createMemoryStressScenario(): Promise<TestScenario> {
    const scenarios = performanceFactory.createStressTestingScenarios();
    return scenarios.find((s) => s.name === 'memory-stress') || scenarios[0];
  }

  private async createVectorSearchScenario(): Promise<TestScenario> {
    const scenarios = performanceFactory.createSearchPerformanceScenarios();
    return (
      scenarios.find((s) => s.name === 'vector-search-performance') ||
      scenarios[0]
    );
  }

  // Custom scenario creators
  private async createChatVolumeScenario(): Promise<TestScenario> {
    return {
      name: 'chat-volume',
      description: 'High volume chat message testing',
      setup: async () => {
        const dataset = await performanceFactory.createPerformanceDataset(
          'medium',
          {
            scenarios: ['chats'],
            patterns: 'random',
          },
        );
        return dataset;
      },
      data: { scenario: 'chat-volume' },
    };
  }

  private async createDocumentProcessingScenario(): Promise<TestScenario> {
    return {
      name: 'document-processing',
      description: 'Document processing pipeline testing',
      setup: async () => {
        const dataset = await performanceFactory.createPerformanceDataset(
          'medium',
          {
            scenarios: ['documents'],
            patterns: 'sequential',
          },
        );
        return dataset;
      },
      data: { scenario: 'document-processing' },
    };
  }

  private async createUserOnboardingScenario(): Promise<TestScenario> {
    return {
      name: 'user-onboarding',
      description: 'New user onboarding flow',
      setup: async () => {
        const users = relationshipFactory.createUserNetwork(10, {
          withRelations: false,
        });

        // Mark users as new (recent creation)
        users.forEach((user) => {
          user.user.createdAt = new Date();
          user.user.emailVerified = false;
        });

        return { users };
      },
      data: { scenario: 'user-onboarding' },
    };
  }

  private async createAdminDashboardScenario(): Promise<TestScenario> {
    return {
      name: 'admin-dashboard',
      description: 'Admin dashboard with comprehensive data',
      setup: async () => {
        const adminUsers = Array.from({ length: 3 }, () =>
          relationshipFactory.userFactory.createAdmin(),
        );

        const regularUsers = Array.from({ length: 50 }, () =>
          relationshipFactory.userFactory.create(),
        );

        const documents = Array.from({ length: 100 }, () =>
          relationshipFactory.ragFactory.create(),
        );

        const chats = Array.from({ length: 200 }, () =>
          relationshipFactory.chatFactory.create(),
        );

        return {
          adminUsers,
          regularUsers,
          documents,
          chats,
        };
      },
      data: { scenario: 'admin-dashboard' },
    };
  }

  private async createMultiTenantScenario(): Promise<TestScenario> {
    return {
      name: 'multi-tenant',
      description: 'Multi-tenant data isolation testing',
      setup: async () => {
        const tenants = Array.from({ length: 5 }, (_, i) => {
          const tenantId = `tenant-${i + 1}`;

          const tenantUsers = Array.from({ length: 10 }, () =>
            relationshipFactory.userFactory.create({
              overrides: {
                name: `${tenantId} User`,
                // In a real multi-tenant system, you'd have tenant isolation
              },
            }),
          );

          const tenantDocuments = Array.from({ length: 20 }, () =>
            relationshipFactory.ragFactory.create({
              overrides: {
                document: {
                  fileName: `${tenantId}-document.pdf`,
                },
              },
            }),
          );

          return {
            tenantId,
            users: tenantUsers,
            documents: tenantDocuments,
          };
        });

        return { tenants };
      },
      data: { scenario: 'multi-tenant' },
    };
  }
}

/**
 * Custom scenario seeder - allows creating specific custom scenarios
 */
export class CustomScenarioSeeder extends BaseSeeder {
  private customScenarios: Map<string, () => Promise<TestScenario>> = new Map();

  /**
   * Register a custom scenario
   */
  registerScenario(name: string, creator: () => Promise<TestScenario>): void {
    this.customScenarios.set(name, creator);
  }

  /**
   * Seed with custom scenarios
   */
  async seed(): Promise<SeederResult> {
    console.log('🎨 Starting custom scenario seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};

    try {
      if (this.config.clean) {
        await this.cleanDatabase();
        await this.runMigrations();
      }

      const scenarios = this.config.scenarios || [];

      for (const scenarioName of scenarios) {
        const creator = this.customScenarios.get(scenarioName);
        if (!creator) {
          console.warn(`Custom scenario not found: ${scenarioName}`);
          continue;
        }

        console.log(`🎭 Creating custom scenario: ${scenarioName}`);
        const scenario = await creator();
        const data = await scenario.setup();

        // Use ScenarioSeeder's insertion logic
        const scenarioSeeder = new ScenarioSeeder(this.config);
        await (scenarioSeeder as any).insertScenarioData(data, rowsCreated);

        console.log(`✓ Custom scenario ${scenarioName} completed`);
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ Custom scenario seeding completed in ${executionTime}ms`);

      return this.generateResult(true, rowsCreated);
    } catch (error) {
      console.error('❌ Custom scenario seeding failed:', error);
      const errors = [
        error instanceof Error ? error : new Error(String(error)),
      ];
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * List available custom scenarios
   */
  listScenarios(): string[] {
    return Array.from(this.customScenarios.keys());
  }
}
