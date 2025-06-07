import { BaseSeeder } from './base-seeder';
import { userFactory, sessionFactory } from '../factories/user-factory';
import { chatFactory, messageFactory } from '../factories/chat-factory';
import { ragDocumentFactory, documentContentFactory } from '../factories/rag-factory';
import * as schema from '@/lib/db/schema';
import type { SeederResult } from '../factories/types';

/**
 * Unit test seeder - creates minimal data for unit testing
 */
export class UnitSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🧪 Starting unit test seeding...');
    
    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};
    const errors: Error[] = [];

    try {
      // Clean and migrate if requested
      if (this.config.clean) {
        await this.cleanDatabase();
        await this.runMigrations();
      }

      // Create minimal test data
      await this.createMinimalUsers(rowsCreated);
      await this.createMinimalChats(rowsCreated);
      await this.createMinimalDocuments(rowsCreated);

      // Verify the data
      const verification = await this.verifyDatabaseState();
      if (!verification.valid) {
        verification.issues.forEach(issue => {
          errors.push(new Error(issue));
        });
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ Unit seeding completed in ${executionTime}ms`);

      return this.generateResult(true, rowsCreated, errors.length > 0 ? errors : undefined);

    } catch (error) {
      console.error('❌ Unit seeding failed:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create minimal users for unit testing
   */
  private async createMinimalUsers(rowsCreated: Record<string, number>): Promise<void> {
    const userCount = this.getUserCount();
    
    // Create users
    const users = userFactory.createBatch({ 
      count: userCount,
      realistic: false, // Use simple test data for unit tests
    });
    
    await this.batchInsert(schema.user, users);
    rowsCreated.users = users.length;

    // Create one session per user for authentication testing
    const sessions = users.map(user => 
      sessionFactory.createActive({ 
        overrides: { userId: user.id },
        realistic: false,
      })
    );
    
    await this.batchInsert(schema.session, sessions);
    rowsCreated.sessions = sessions.length;

    console.log(`✓ Created ${users.length} test users with sessions`);
  }

  /**
   * Create minimal chats for unit testing
   */
  private async createMinimalChats(rowsCreated: Record<string, number>): Promise<void> {
    // Get existing users
    const users = await this.db.select({ id: schema.user.id }).from(schema.user);
    if (users.length === 0) return;

    const chatCount = Math.min(users.length, 5); // Max 5 chats for unit tests
    
    // Create simple chats
    const chats = Array.from({ length: chatCount }, (_, index) => 
      chatFactory.create({
        overrides: { 
          userId: users[index % users.length].id,
          title: `Unit Test Chat ${index + 1}`,
        },
        realistic: false,
      })
    );

    await this.batchInsert(schema.chat, chats);
    rowsCreated.chats = chats.length;

    // Create minimal messages (1-2 per chat)
    const messages = chats.flatMap(chat => [
      messageFactory.createUserMessage({
        overrides: { 
          chatId: chat.id,
          parts: [{ type: 'text', text: 'Test user message' }],
        },
      }),
      messageFactory.createAssistantMessage({
        overrides: { 
          chatId: chat.id,
          parts: [{ type: 'text', text: 'Test assistant response' }],
        },
      }),
    ]);

    await this.batchInsert(schema.message, messages);
    rowsCreated.messages = messages.length;

    console.log(`✓ Created ${chats.length} test chats with ${messages.length} messages`);
  }

  /**
   * Create minimal documents for unit testing
   */
  private async createMinimalDocuments(rowsCreated: Record<string, number>): Promise<void> {
    // Get existing users
    const users = await this.db.select({ id: schema.user.id }).from(schema.user);
    if (users.length === 0) return;

    const docCount = Math.min(3, users.length); // Max 3 documents for unit tests

    // Create simple RAG documents
    const documents = Array.from({ length: docCount }, (_, index) =>
      ragDocumentFactory.create({
        overrides: {
          uploadedBy: users[index % users.length].id,
          fileName: `unit-test-${index + 1}.pdf`,
          originalName: `Unit Test Document ${index + 1}.pdf`,
          status: 'processed', // Make them ready for testing
        },
        realistic: false,
      })
    );

    await this.batchInsert(schema.ragDocument, documents);
    rowsCreated.ragDocuments = documents.length;

    // Create document content
    const contents = documents.map(doc =>
      documentContentFactory.create({
        overrides: {
          documentId: doc.id,
          extractedText: `Unit test content for document ${doc.fileName}. This is minimal test content.`,
          pageCount: '1',
          charCount: '100',
        },
        realistic: false,
      })
    );

    await this.batchInsert(schema.documentContent, contents);
    rowsCreated.documentContent = contents.length;

    console.log(`✓ Created ${documents.length} test documents with content`);
  }

  /**
   * Get user count based on test size
   */
  private getUserCount(): number {
    switch (this.config.size) {
      case 'minimal':
        return 2;
      case 'standard':
        return 5;
      case 'large':
        return 10;
      default:
        return 3;
    }
  }
}

/**
 * Isolated unit seeder - creates completely isolated test data
 */
export class IsolatedUnitSeeder extends BaseSeeder {
  async seed(): Promise<SeederResult> {
    console.log('🔒 Starting isolated unit test seeding...');
    
    const startTime = Date.now();
    const rowsCreated: Record<string, number> = {};

    try {
      // Always clean for isolated tests
      await this.cleanDatabase();
      await this.runMigrations();

      // Create completely fresh, isolated data
      await this.createIsolatedTestUser(rowsCreated);

      const executionTime = Date.now() - startTime;
      console.log(`✅ Isolated seeding completed in ${executionTime}ms`);

      return this.generateResult(true, rowsCreated);

    } catch (error) {
      console.error('❌ Isolated seeding failed:', error);
      const errors = [error instanceof Error ? error : new Error(String(error))];
      return this.generateResult(false, rowsCreated, errors);
    }
  }

  /**
   * Create a single isolated test user with minimal data
   */
  private async createIsolatedTestUser(rowsCreated: Record<string, number>): Promise<void> {
    // Create one predictable test user
    const user = userFactory.create({
      overrides: {
        email: 'isolated.test@example.com',
        name: 'Isolated Test User',
        type: 'regular',
        emailVerified: true,
        isAnonymous: false,
      },
      realistic: false,
    });

    await this.batchInsert(schema.user, [user]);
    rowsCreated.users = 1;

    // Create one active session
    const session = sessionFactory.createActive({
      overrides: { userId: user.id },
      realistic: false,
    });

    await this.batchInsert(schema.session, [session]);
    rowsCreated.sessions = 1;

    console.log(`✓ Created isolated test user: ${user.email}`);
  }
}

/**
 * Factory for creating unit seeders
 */
export class UnitSeederFactory {
  static create(isolated: boolean = false): (config: any) => BaseSeeder {
    return (config) => {
      if (isolated) {
        return new IsolatedUnitSeeder(config);
      }
      return new UnitSeeder(config);
    };
  }

  static createQuick(environment: string = 'unit'): UnitSeeder {
    return new UnitSeeder({
      environment: environment as any,
      clean: true,
      size: 'minimal',
    });
  }

  static createIsolated(environment: string = 'unit'): IsolatedUnitSeeder {
    return new IsolatedUnitSeeder({
      environment: environment as any,
      clean: true,
      size: 'minimal',
    });
  }
}