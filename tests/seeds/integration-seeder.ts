import { BaseSeeder } from './base-seeder';
import { relationshipFactory } from '../factories/relationship-factory';
import { completeUserFactory } from '../factories/user-factory';
import { completeRAGDocumentFactory } from '../factories/rag-factory';
import { completeChatFactory } from '../factories/chat-factory';
import * as schema from '@/lib/db/schema';
import type { SeederResult } from '../factories/types';

/**
 * Integration test seeder - creates realistic data for integration testing
 */
export class IntegrationSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🔗 Starting integration test seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};
    const errors: Error[] = [];

    try {
      // Clean and migrate if requested
      if (this.config.clean) {
        await this.cleanDatabase();
        await this.runMigrations();
      }

      // Create integration test scenarios
      await this.createUserWorkflows(rowsCreated);
      await this.createRAGPipeline(rowsCreated);
      await this.createChatFlows(rowsCreated);
      await this.createAPITestData(rowsCreated);

      // Verify the data
      const verification = await this.verifyDatabaseState();
      if (!verification.valid) {
        verification.issues.forEach((issue) => {
          errors.push(new Error(issue));
        });
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ Integration seeding completed in ${executionTime}ms`);

      return this.generateResult(
        true,
        rowsCreated,
        errors.length > 0 ? errors : undefined,
      );
    } catch (error) {
      console.error('❌ Integration seeding failed:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create user workflows for integration testing
   */
  private async createUserWorkflows(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    console.log('Creating user workflows...');

    // Create different user types for testing authentication flows
    const workflows = [
      // New user registration flow
      {
        user: completeUserFactory.create({
          overrides: {
            user: {
              email: 'newuser@integration.test',
              emailVerified: false,
              type: 'regular',
              isAnonymous: false,
            },
          },
        }),
        scenario: 'registration',
      },
      // OAuth user flow
      {
        user: completeUserFactory.create({
          overrides: {
            user: {
              email: 'oauth@integration.test',
              emailVerified: true,
              type: 'regular',
            },
          },
        }),
        scenario: 'oauth',
      },
      // Premium user upgrade flow
      {
        user: completeUserFactory.create({
          overrides: {
            user: {
              email: 'premium@integration.test',
              emailVerified: true,
              type: 'premium',
            },
          },
        }),
        scenario: 'premium',
      },
      // Admin user flow
      {
        user: completeUserFactory.createActiveUser({
          overrides: {
            user: {
              email: 'admin@integration.test',
              emailVerified: true,
              type: 'admin',
            },
          },
        }),
        scenario: 'admin',
      },
      // Anonymous user flow
      {
        user: completeUserFactory.create({
          overrides: {
            user: {
              email: null,
              emailVerified: false,
              type: 'regular',
              isAnonymous: true,
              name: 'Anonymous User',
            },
          },
        }),
        scenario: 'anonymous',
      },
    ];

    // Insert user data
    const users = workflows.map((w) => w.user.user);
    await this.batchInsert(schema.user, users);
    rowsCreated.users = users.length;

    // Insert sessions
    const sessions = workflows.flatMap((w) => w.user.sessions);
    await this.batchInsert(schema.session, sessions);
    rowsCreated.sessions = sessions.length;

    // Insert accounts (OAuth accounts for some users)
    const accounts = workflows
      .filter((w) => w.scenario === 'oauth' || w.scenario === 'premium')
      .flatMap((w) => w.user.accounts);

    if (accounts.length > 0) {
      await this.batchInsert(schema.account, accounts);
      rowsCreated.accounts = accounts.length;
    }

    console.log(`✓ Created ${users.length} user workflows`);
  }

  /**
   * Create RAG pipeline test data
   */
  private async createRAGPipeline(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    console.log('Creating RAG pipeline test data...');

    // Get existing users
    const users = await this.db
      .select({ id: schema.user.id })
      .from(schema.user);
    if (users.length === 0) return;

    // Create documents in different stages of processing
    const documentStages = [
      { status: 'uploaded', count: 2 },
      { status: 'processing', count: 1 },
      { status: 'text_extracted', count: 2 },
      { status: 'chunked', count: 2 },
      { status: 'embedded', count: 1 },
      { status: 'processed', count: 5 },
      { status: 'error', count: 1 },
    ];

    const documents = [];
    const contents = [];
    const chunks = [];
    const embeddings = [];

    for (const stage of documentStages) {
      for (let i = 0; i < stage.count; i++) {
        const user = users[i % users.length];
        const completeDoc = completeRAGDocumentFactory.create({
          overrides: {
            document: {
              uploadedBy: user.id,
              status: stage.status,
              fileName: `integration-${stage.status}-${i + 1}.pdf`,
              originalName: `Integration Test ${stage.status} ${i + 1}.pdf`,
            },
          },
          realistic: true,
        });

        documents.push(completeDoc.document);

        // Only create content/chunks/embeddings for processed stages
        if (
          ['text_extracted', 'chunked', 'embedded', 'processed'].includes(
            stage.status,
          )
        ) {
          contents.push(completeDoc.content);

          if (['chunked', 'embedded', 'processed'].includes(stage.status)) {
            chunks.push(...completeDoc.chunks);

            if (['embedded', 'processed'].includes(stage.status)) {
              embeddings.push(...completeDoc.embeddings);
            }
          }
        }
      }
    }

    // Insert data
    await this.batchInsert(schema.ragDocument, documents);
    rowsCreated.ragDocuments = documents.length;

    if (contents.length > 0) {
      await this.batchInsert(schema.documentContent, contents);
      rowsCreated.documentContent = contents.length;
    }

    if (chunks.length > 0) {
      await this.batchInsert(schema.documentChunk, chunks);
      rowsCreated.documentChunks = chunks.length;
    }

    if (embeddings.length > 0) {
      await this.batchInsert(schema.documentEmbedding, embeddings);
      rowsCreated.documentEmbeddings = embeddings.length;
    }

    console.log(
      `✓ Created ${documents.length} documents in various processing stages`,
    );
  }

  /**
   * Create chat flows for testing
   */
  private async createChatFlows(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    console.log('Creating chat flows...');

    // Get existing users
    const users = await this.db.select().from(schema.user);
    if (users.length === 0) return;

    // Create different types of chat scenarios
    const chatScenarios = [
      // Simple Q&A chat
      {
        type: 'simple',
        user:
          users.find((u) => u.email === 'newuser@integration.test') || users[0],
        count: 2,
      },
      // Complex chat with artifacts
      {
        type: 'complex',
        user:
          users.find((u) => u.email === 'premium@integration.test') || users[1],
        count: 1,
      },
      // Public collaborative chat
      {
        type: 'public',
        user:
          users.find((u) => u.email === 'admin@integration.test') || users[2],
        count: 1,
      },
      // Anonymous user chat
      {
        type: 'anonymous',
        user: users.find((u) => u.isAnonymous) || users[3],
        count: 1,
      },
    ];

    const chats = [];
    const messages = [];
    const votes = [];
    const streams = [];

    for (const scenario of chatScenarios) {
      for (let i = 0; i < scenario.count; i++) {
        let completeChat;

        switch (scenario.type) {
          case 'simple':
            completeChat = completeChatFactory.createSimple({
              overrides: {
                chat: {
                  userId: scenario.user.id,
                  title: `Integration Test Simple Chat ${i + 1}`,
                  visibility: 'private',
                },
              },
            });
            break;

          case 'complex':
            completeChat = completeChatFactory.createComplex({
              overrides: {
                chat: {
                  userId: scenario.user.id,
                  title: `Integration Test Complex Chat ${i + 1}`,
                  visibility: 'private',
                },
              },
            });
            break;

          case 'public':
            completeChat = completeChatFactory.createComplex({
              overrides: {
                chat: {
                  userId: scenario.user.id,
                  title: `Integration Test Public Chat ${i + 1}`,
                  visibility: 'public',
                },
              },
            });
            break;

          case 'anonymous':
            completeChat = completeChatFactory.createSimple({
              overrides: {
                chat: {
                  userId: scenario.user.id,
                  title: `Integration Test Anonymous Chat ${i + 1}`,
                  visibility: 'private',
                },
              },
            });
            break;

          default:
            continue;
        }

        chats.push(completeChat.chat);
        messages.push(...completeChat.messages);
        votes.push(...completeChat.votes);
        streams.push(...completeChat.streams);
      }
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
      `✓ Created ${chats.length} chat flows with ${messages.length} messages`,
    );
  }

  /**
   * Create API-specific test data
   */
  private async createAPITestData(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    console.log('Creating API test data...');

    // Get existing users and documents for artifact creation
    const users = await this.db.select().from(schema.user);
    const ragDocs = await this.db.select().from(schema.ragDocument).limit(3);

    if (users.length === 0) return;

    // Create artifact documents for API testing
    const artifactDocuments = [];
    const suggestions = [];

    for (let i = 0; i < 5; i++) {
      const user = users[i % users.length];

      // Text artifact
      const textDoc = {
        id: `integration-text-${i + 1}`,
        createdAt: new Date(),
        title: `Integration Test Text Document ${i + 1}`,
        content: `# Test Document ${i + 1}\n\nThis is integration test content for API testing.\n\n## Features\n- Text editing\n- Markdown support\n- Real-time collaboration`,
        kind: 'text',
        userId: user.id,
      };
      artifactDocuments.push(textDoc);

      // Code artifact
      const codeDoc = {
        id: `integration-code-${i + 1}`,
        createdAt: new Date(),
        title: `Integration Test Code ${i + 1}`,
        content: `function integrationTest${i + 1}() {\n  console.log('Integration test ${i + 1}');\n  return true;\n}`,
        kind: 'code',
        userId: user.id,
      };
      artifactDocuments.push(codeDoc);

      // Create suggestions for the documents
      if (i < 3) {
        const suggestion = {
          id: `integration-suggestion-${i + 1}`,
          documentId: textDoc.id,
          documentCreatedAt: textDoc.createdAt,
          originalText: 'This is integration test content',
          suggestedText: 'This is comprehensive integration test content',
          description: 'Improve description clarity',
          isResolved: i % 2 === 0, // Alternate resolved/unresolved
          userId: user.id,
          createdAt: new Date(),
        };
        suggestions.push(suggestion);
      }
    }

    // Insert artifact documents
    await this.batchInsert(schema.document, artifactDocuments);
    rowsCreated.documents = artifactDocuments.length;

    // Insert suggestions
    if (suggestions.length > 0) {
      await this.batchInsert(schema.suggestion, suggestions);
      rowsCreated.suggestions = suggestions.length;
    }

    console.log(
      `✓ Created ${artifactDocuments.length} artifact documents and ${suggestions.length} suggestions`,
    );
  }
}

/**
 * API integration seeder - creates data specifically for API testing
 */
export class APIIntegrationSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🔌 Starting API integration seeding...');

    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};

    try {
      // Always clean for API tests
      await this.cleanDatabase();
      await this.runMigrations();

      // Create API-specific test data
      await this.createAPIUsers(rowsCreated);
      await this.createAPIDocuments(rowsCreated);
      await this.createAPIChats(rowsCreated);

      const executionTime = Date.now() - startTime;
      console.log(`✅ API integration seeding completed in ${executionTime}ms`);

      return this.generateResult(true, rowsCreated);
    } catch (error) {
      console.error('❌ API integration seeding failed:', error);
      const errors = [
        error instanceof Error ? error : new Error(String(error)),
      ];
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create users for API testing
   */
  private async createAPIUsers(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    // Create predictable users for API testing
    const apiUsers = [
      {
        email: 'api.admin@test.com',
        name: 'API Admin',
        type: 'admin',
        emailVerified: true,
      },
      {
        email: 'api.user@test.com',
        name: 'API User',
        type: 'regular',
        emailVerified: true,
      },
      {
        email: 'api.premium@test.com',
        name: 'API Premium',
        type: 'premium',
        emailVerified: true,
      },
    ];

    const users = apiUsers.map((userData) =>
      completeUserFactory.create({
        overrides: { user: userData },
        realistic: false, // Predictable data for APIs
      }),
    );

    // Insert users and sessions
    const userData = users.map((u) => u.user);
    await this.batchInsert(schema.user, userData);
    rowsCreated.users = userData.length;

    const sessionData = users.flatMap((u) => u.sessions);
    await this.batchInsert(schema.session, sessionData);
    rowsCreated.sessions = sessionData.length;

    console.log(`✓ Created ${userData.length} API users`);
  }

  /**
   * Create documents for API testing
   */
  private async createAPIDocuments(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const users = await this.db.select().from(schema.user);
    const apiUser = users.find((u) => u.email === 'api.user@test.com');

    if (!apiUser) return;

    // Create documents for API endpoint testing
    const testDocument = completeRAGDocumentFactory.createMinimal({
      overrides: {
        document: {
          uploadedBy: apiUser.id,
          fileName: 'api-test.pdf',
          originalName: 'API Test Document.pdf',
          status: 'processed',
        },
        content: {
          extractedText: 'This is API test content for integration testing.',
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

    console.log('✓ Created API test documents');
  }

  /**
   * Create chats for API testing
   */
  private async createAPIChats(
    rowsCreated: Record<string, number>,
  ): Promise<void> {
    const users = await this.db.select().from(schema.user);
    const apiUser = users.find((u) => u.email === 'api.user@test.com');

    if (!apiUser) return;

    // Create predictable chat for API testing
    const testChat = completeChatFactory.createSimple({
      overrides: {
        chat: {
          userId: apiUser.id,
          title: 'API Test Chat',
          visibility: 'private',
        },
      },
    });

    await this.batchInsert(schema.chat, [testChat.chat]);
    await this.batchInsert(schema.message, testChat.messages);

    rowsCreated.chats = 1;
    rowsCreated.messages = testChat.messages.length;

    console.log('✓ Created API test chat');
  }
}
