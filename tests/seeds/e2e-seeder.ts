import { BaseSeeder } from './base-seeder';
import { completeUserFactory } from '../factories/user-factory';
import { completeChatFactory } from '../factories/chat-factory';
import { completeRAGDocumentFactory } from '../factories/rag-factory';
import { relationshipFactory } from '../factories/relationship-factory';
import * as schema from '@/lib/db/schema';
import type { SeederResult } from '../factories/types';

/**
 * E2E test seeder - creates realistic data for end-to-end testing
 */
export class E2ESeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🎭 Starting E2E test seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};
    const errors: Error[] = [];

    try {
      // Clean and migrate if requested
      if (this.config.clean) {
        await this.cleanDatabase();
        await this.runMigrations();
      }

      // Create realistic test scenarios
      await this.createRealisticUsers(rowsCreated);
      await this.createRealisticChats(rowsCreated);
      await this.createRealisticDocuments(rowsCreated);
      await this.createTestScenarios(rowsCreated);

      // Verify the data
      const verification = await this.verifyDatabaseState();
      if (!verification.valid) {
        verification.issues.forEach((issue) => {
          errors.push(new Error(issue));
        });
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ E2E seeding completed in ${executionTime}ms`);

      return this.generateResult(
        true,
        rowsCreated,
        errors.length > 0 ? errors : undefined,
      );
    } catch (error) {
      console.error('❌ E2E seeding failed:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create realistic users with proper authentication data
   */
  private async createRealisticUsers(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const userCount = this.getUserCount();

    console.log(`Creating ${userCount} realistic users...`);

    // Create a mix of user types
    const adminCount = Math.max(1, Math.floor(userCount * 0.1)); // 10% admins
    const premiumCount = Math.floor(userCount * 0.2); // 20% premium
    const regularCount = userCount - adminCount - premiumCount;

    const users = [];

    // Create admin users
    for (let i = 0; i < adminCount; i++) {
      const adminUser = completeUserFactory.createActiveUser({
        overrides: {
          user: {
            type: 'admin',
            emailVerified: true,
            name: `Admin User ${i + 1}`,
            email: `admin${i + 1}@example.com`,
          },
        },
        realistic: true,
      });
      users.push(adminUser);
    }

    // Create premium users
    for (let i = 0; i < premiumCount; i++) {
      const premiumUser = completeUserFactory.createActiveUser({
        overrides: {
          user: {
            type: 'premium',
            emailVerified: true,
            name: `Premium User ${i + 1}`,
            email: `premium${i + 1}@example.com`,
          },
        },
        realistic: true,
      });
      users.push(premiumUser);
    }

    // Create regular users
    for (let i = 0; i < regularCount; i++) {
      const regularUser = completeUserFactory.create({
        overrides: {
          user: {
            type: 'regular',
            email: `user${i + 1}@example.com`,
          },
        },
        realistic: true,
      });
      users.push(regularUser);
    }

    // Insert users
    const userData = users.map((u) => u.user);
    await this.batchInsert(schema.user, userData);
    rowsCreated.users = userData.length;

    // Insert sessions
    const sessionData = users.flatMap((u) => u.sessions);
    await this.batchInsert(schema.session, sessionData);
    rowsCreated.sessions = sessionData.length;

    // Insert accounts (OAuth)
    const accountData = users.flatMap((u) => u.accounts);
    if (accountData.length > 0) {
      await this.batchInsert(schema.account, accountData);
      rowsCreated.accounts = accountData.length;
    }

    console.log(
      `✓ Created ${userData.length} users (${adminCount} admin, ${premiumCount} premium, ${regularCount} regular)`,
    );
  }

  /**
   * Create realistic chat conversations
   */
  private async createRealisticChats(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    // Get existing users
    const users = await this.db
      .select({ id: schema.user.id })
      .from(schema.user);
    if (users.length === 0) return;

    const chatCount = Math.min(users.length * 2, 50); // 2 chats per user, max 50

    console.log(`Creating ${chatCount} realistic chats...`);

    const chats = [];
    const messages = [];
    const votes = [];
    const streams = [];

    for (let i = 0; i < chatCount; i++) {
      const user = users[i % users.length];
      const isPublic = Math.random() < 0.3; // 30% public chats

      const completeChat = isPublic
        ? completeChatFactory.createComplex({
            overrides: {
              chat: {
                userId: user.id,
                visibility: 'public',
              },
            },
            realistic: true,
          })
        : completeChatFactory.create({
            overrides: {
              chat: {
                userId: user.id,
                visibility: 'private',
              },
            },
            realistic: true,
          });

      chats.push(completeChat.chat);
      messages.push(...completeChat.messages);
      votes.push(...completeChat.votes);
      streams.push(...completeChat.streams);
    }

    // Insert data
    await this.batchInsert(schema.chat, chats);
    rowsCreated.chats = chats.length;

    await this.batchInsert(schema.message, messages);
    rowsCreated.messages = messages.length;

    if (votes.length > 0) {
      await this.batchInsert(schema.vote, votes);
      rowsCreated.votes = votes.length;
    }

    if (streams.length > 0) {
      await this.batchInsert(schema.stream, streams);
      rowsCreated.streams = streams.length;
    }

    console.log(
      `✓ Created ${chats.length} chats with ${messages.length} messages`,
    );
  }

  /**
   * Create realistic RAG documents with full processing pipeline
   */
  private async createRealisticDocuments(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    // Get existing users
    const users = await this.db
      .select({ id: schema.user.id })
      .from(schema.user);
    if (users.length === 0) return;

    const docCount = this.getDocumentCount();

    console.log(`Creating ${docCount} realistic documents...`);

    const documents = [];
    const contents = [];
    const chunks = [];
    const embeddings = [];

    for (let i = 0; i < docCount; i++) {
      const user = users[i % users.length];

      const completeDoc = completeRAGDocumentFactory.create({
        overrides: {
          document: {
            uploadedBy: user.id,
            status: 'processed', // Make documents ready for testing
          },
        },
        realistic: true,
      });

      documents.push(completeDoc.document);
      contents.push(completeDoc.content);
      chunks.push(...completeDoc.chunks);
      embeddings.push(...completeDoc.embeddings);
    }

    // Insert data
    await this.batchInsert(schema.ragDocument, documents);
    rowsCreated.ragDocuments = documents.length;

    await this.batchInsert(schema.documentContent, contents);
    rowsCreated.documentContent = contents.length;

    await this.batchInsert(schema.documentChunk, chunks);
    rowsCreated.documentChunks = chunks.length;

    await this.batchInsert(schema.documentEmbedding, embeddings);
    rowsCreated.documentEmbeddings = embeddings.length;

    console.log(
      `✓ Created ${documents.length} documents with ${chunks.length} chunks and ${embeddings.length} embeddings`,
    );
  }

  /**
   * Create specific test scenarios
   */
  private async createTestScenarios(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const scenarios = this.config.scenarios || [];

    if (scenarios.includes('collaboration')) {
      await this.createCollaborationScenario(rowsCreated);
    }

    if (scenarios.includes('customer-support')) {
      await this.createCustomerSupportScenario(rowsCreated);
    }

    if (scenarios.includes('research')) {
      await this.createResearchScenario(rowsCreated);
    }
  }

  /**
   * Create collaboration scenario data
   */
  private async createCollaborationScenario(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    console.log('Creating collaboration scenario...');

    const scenario = relationshipFactory.createCollaborativeWorkspace();
    const data = await scenario.setup();

    // The data is already created in memory, we just need to track it
    console.log(
      `✓ Created collaboration scenario with ${data.users.length} team members`,
    );
  }

  /**
   * Create customer support scenario data
   */
  private async createCustomerSupportScenario(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    console.log('Creating customer support scenario...');

    const scenario = relationshipFactory.createCustomerSupportScenario();
    const data = await scenario.setup();

    console.log(
      `✓ Created support scenario with ${data.agents.length} agents and ${data.customers.length} customers`,
    );
  }

  /**
   * Create research scenario data
   */
  private async createResearchScenario(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    console.log('Creating research scenario...');

    const scenario = relationshipFactory.createResearchScenario();
    const data = await scenario.setup();

    console.log(
      `✓ Created research scenario with ${data.researchPapers.length} papers`,
    );
  }

  /**
   * Get user count based on test size
   */
  private getUserCount(): number {
    switch (this.config.size) {
      case 'minimal':
        return 5;
      case 'standard':
        return 20;
      case 'large':
        return 50;
      default:
        return 15;
    }
  }

  /**
   * Get document count based on test size
   */
  private getDocumentCount(): number {
    switch (this.config.size) {
      case 'minimal':
        return 3;
      case 'standard':
        return 15;
      case 'large':
        return 30;
      default:
        return 10;
    }
  }
}

/**
 * Browser test seeder - creates data specifically for browser automation
 */
export class BrowserTestSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🌐 Starting browser test seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};

    try {
      // Always clean for browser tests
      await this.cleanDatabase();
      await this.runMigrations();

      // Create predictable test users for browser automation
      await this.createBrowserTestUsers(rowsCreated);
      await this.createBrowserTestContent(rowsCreated);

      const executionTime = Date.now() - startTime;
      console.log(`✅ Browser test seeding completed in ${executionTime}ms`);

      return this.generateResult(true, rowsCreated);
    } catch (error) {
      console.error('❌ Browser test seeding failed:', error);
      const errors = [
        error instanceof Error ? error : new Error(String(error)),
      ];
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create predictable users for browser testing
   */
  private async createBrowserTestUsers(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const testUsers = [
      {
        email: 'admin@test.com',
        password: 'admin123',
        name: 'Test Admin',
        type: 'admin',
        emailVerified: true,
      },
      {
        email: 'user@test.com',
        password: 'user123',
        name: 'Test User',
        type: 'regular',
        emailVerified: true,
      },
      {
        email: 'premium@test.com',
        password: 'premium123',
        name: 'Premium User',
        type: 'premium',
        emailVerified: true,
      },
    ];

    const users = testUsers.map((userData) =>
      completeUserFactory.create({
        overrides: { user: userData },
        realistic: false, // Use predictable data
      }),
    );

    // Insert users and sessions
    const userData = users.map((u) => u.user);
    await this.batchInsert(schema.user, userData);
    rowsCreated.users = userData.length;

    const sessionData = users.flatMap((u) => u.sessions);
    await this.batchInsert(schema.session, sessionData);
    rowsCreated.sessions = sessionData.length;

    console.log(
      `✓ Created ${userData.length} predictable test users for browser testing`,
    );
  }

  /**
   * Create predictable content for browser testing
   */
  private async createBrowserTestContent(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const users = await this.db.select().from(schema.user);
    const testUser = users.find((u) => u.email === 'user@test.com');

    if (!testUser) return;

    // Create a predictable chat for UI testing
    const testChat = completeChatFactory.createSimple({
      overrides: {
        chat: {
          userId: testUser.id,
          title: 'Browser Test Chat',
          visibility: 'private',
        },
      },
    });

    await this.batchInsert(schema.chat, [testChat.chat]);
    await this.batchInsert(schema.message, testChat.messages);
    rowsCreated.chats = 1;
    rowsCreated.messages = testChat.messages.length;

    // Create a test document
    const testDocument = completeRAGDocumentFactory.createMinimal({
      overrides: {
        document: {
          uploadedBy: testUser.id,
          fileName: 'browser-test.pdf',
          originalName: 'Browser Test Document.pdf',
          status: 'processed',
        },
      },
    });

    await this.batchInsert(schema.ragDocument, [testDocument.document]);
    await this.batchInsert(schema.documentContent, [testDocument.content]);
    await this.batchInsert(schema.documentChunk, testDocument.chunks);
    await this.batchInsert(schema.documentEmbedding, testDocument.embeddings);

    rowsCreated.ragDocuments = 1;
    rowsCreated.documentContent = 1;
    rowsCreated.documentChunks = testDocument.chunks.length;
    rowsCreated.documentEmbeddings = testDocument.embeddings.length;

    console.log('✓ Created predictable test content for browser automation');
  }
}
