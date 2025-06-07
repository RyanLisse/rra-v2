import { faker } from '@faker-js/faker';
import { BaseFactory } from './base-factory';
import { CompleteUserFactory } from './user-factory';
import { CompleteChatFactory } from './chat-factory';
import { CompleteRAGDocumentFactory } from './rag-factory';
import type {
  FactoryOptions,
  RelationshipOptions,
  CompleteUser,
  CompleteChat,
  CompleteRAGDocument,
  TestScenario,
} from './types';

/**
 * Relationship factory for creating interconnected test data
 */
export class RelationshipFactory extends BaseFactory<any> {
  private userFactory = new CompleteUserFactory(this.seed);
  private chatFactory = new CompleteChatFactory(this.seed);
  private ragFactory = new CompleteRAGDocumentFactory(this.seed);

  create(options?: FactoryOptions): any {
    // This is a complex factory, so we override the create method
    return this.createUserWithAllRelations(options);
  }

  /**
   * Create a complete user with all possible relationships
   */
  createUserWithAllRelations(
    options?: FactoryOptions & RelationshipOptions,
  ): CompleteUser {
    const user = this.userFactory.create(options);

    if (options?.withRelations === false) {
      return user;
    }

    const depth = options?.relationDepth ?? 2;
    const skipRelations = options?.skipRelations ?? [];

    // Create chats for the user
    if (!skipRelations.includes('chats') && depth > 0) {
      const chatCount = faker.number.int({ min: 1, max: 5 });
      user.chats = Array.from({ length: chatCount }, () =>
        this.chatFactory.create({
          overrides: { chat: { userId: user.user.id } },
        }),
      );
    }

    // Create documents for the user
    if (!skipRelations.includes('documents') && depth > 0) {
      const docCount = faker.number.int({ min: 1, max: 3 });
      user.documents = Array.from({ length: docCount }, () =>
        this.ragFactory.create({
          overrides: { document: { uploadedBy: user.user.id } },
        }),
      );
    }

    return user;
  }

  /**
   * Create multiple users with cross-relationships
   */
  createUserNetwork(
    userCount: number = 5,
    options?: FactoryOptions & RelationshipOptions,
  ): CompleteUser[] {
    const users = Array.from({ length: userCount }, () =>
      this.userFactory.create(options),
    );

    if (options?.withRelations === false) {
      return users;
    }

    // Create shared public chats
    const sharedChatCount = faker.number.int({ min: 1, max: 3 });
    const publicChats = Array.from({ length: sharedChatCount }, () => {
      const randomUser = faker.helpers.arrayElement(users);
      return this.chatFactory.createPublic({
        overrides: { chat: { userId: randomUser.user.id } },
      });
    });

    // Distribute shared chats among users
    users.forEach((user, index) => {
      // Each user gets their own private chats
      const privateChatCount = faker.number.int({ min: 1, max: 3 });
      user.chats = Array.from({ length: privateChatCount }, () =>
        this.chatFactory.create({
          overrides: { chat: { userId: user.user.id } },
        }),
      );

      // Add some shared public chats
      const sharedCount = faker.number.int({ min: 0, max: 2 });
      user.chats.push(
        ...faker.helpers.arrayElements(publicChats, {
          min: 0,
          max: sharedCount,
        }),
      );

      // Create documents
      const docCount = faker.number.int({ min: 0, max: 2 });
      user.documents = Array.from({ length: docCount }, () =>
        this.ragFactory.create({
          overrides: { document: { uploadedBy: user.user.id } },
        }),
      );
    });

    return users;
  }

  /**
   * Create a collaborative workspace scenario
   */
  createCollaborativeWorkspace(options?: FactoryOptions): TestScenario {
    const teamSize = faker.number.int({ min: 3, max: 8 });
    const users = this.createUserNetwork(teamSize, { withRelations: true });

    // Create shared documents that multiple users reference
    const sharedDocs = Array.from({ length: 3 }, () => {
      const owner = faker.helpers.arrayElement(users);
      return this.ragFactory.create({
        overrides: {
          document: {
            uploadedBy: owner.user.id,
            fileName: `shared-${faker.company.buzzNoun()}.pdf`,
          },
        },
      });
    });

    // Create project chat where team discusses shared documents
    const projectChat = this.chatFactory.createPublic({
      overrides: {
        chat: {
          userId: users[0].user.id,
          title: `Project ${faker.company.catchPhrase()}`,
        },
      },
    });

    return {
      name: 'collaborative-workspace',
      description:
        'A collaborative workspace with multiple users sharing documents and conversations',
      setup: async () => ({
        users,
        sharedDocuments: sharedDocs,
        projectChat,
      }),
      cleanup: async () => {
        // Cleanup logic would go here
      },
      data: {
        users,
        sharedDocuments: sharedDocs,
        projectChat,
        metrics: {
          teamSize,
          documentsShared: sharedDocs.length,
          totalChats: users.reduce((sum, user) => sum + user.chats.length, 0),
        },
      },
    };
  }

  /**
   * Create a customer support scenario
   */
  createCustomerSupportScenario(options?: FactoryOptions): TestScenario {
    // Create support agents
    const agents = Array.from({ length: 3 }, () =>
      this.userFactory.createActiveUser({
        overrides: {
          user: {
            type: 'admin',
            name: `Agent ${faker.person.firstName()}`,
          },
        },
      }),
    );

    // Create customers
    const customers = Array.from({ length: 10 }, () =>
      this.userFactory.create({
        overrides: { user: { type: 'regular' } },
      }),
    );

    // Create support knowledge base
    const knowledgeBase = Array.from({ length: 5 }, () =>
      this.ragFactory.create({
        overrides: {
          document: {
            uploadedBy: agents[0].user.id,
            originalName: `FAQ - ${faker.helpers.arrayElement([
              'Getting Started',
              'Troubleshooting',
              'Advanced Features',
              'Billing',
              'Account Management',
            ])}.pdf`,
          },
        },
      }),
    );

    // Create support conversations
    const supportChats = customers.map((customer) => {
      const assignedAgent = faker.helpers.arrayElement(agents);
      return this.chatFactory.create({
        overrides: {
          chat: {
            userId: customer.user.id,
            title: `Support Request - ${faker.hacker.phrase()}`,
            visibility: 'private',
          },
        },
      });
    });

    return {
      name: 'customer-support',
      description:
        'Customer support scenario with agents, customers, and knowledge base',
      setup: async () => ({
        agents,
        customers,
        knowledgeBase,
        supportChats,
      }),
      data: {
        agents,
        customers,
        knowledgeBase,
        supportChats,
        metrics: {
          agentCount: agents.length,
          customerCount: customers.length,
          knowledgeBaseSize: knowledgeBase.length,
          activeTickets: supportChats.length,
        },
      },
    };
  }

  /**
   * Create a research and documentation scenario
   */
  createResearchScenario(options?: FactoryOptions): TestScenario {
    // Create researchers
    const researchers = Array.from({ length: 4 }, () =>
      this.userFactory.createActiveUser({
        overrides: {
          user: {
            type: 'premium',
            name: `Dr. ${faker.person.lastName()}`,
          },
        },
      }),
    );

    // Create research documents
    const researchPapers = Array.from({ length: 15 }, () => {
      const author = faker.helpers.arrayElement(researchers);
      return this.ragFactory.create({
        overrides: {
          document: {
            uploadedBy: author.user.id,
            originalName: `${faker.science.chemicalElement().name} Research - ${faker.date.recent().getFullYear()}.pdf`,
          },
          content: {
            metadata: {
              documentType: 'research-paper',
              field: faker.science.unit().name,
              citations: faker.number.int({ min: 10, max: 150 }),
            },
          },
        },
      });
    });

    // Create research discussions
    const discussions = Array.from({ length: 8 }, () => {
      const moderator = faker.helpers.arrayElement(researchers);
      return this.chatFactory.createPublic({
        overrides: {
          chat: {
            userId: moderator.user.id,
            title: `Discussion: ${faker.science.chemicalElement().name} Analysis`,
          },
        },
      });
    });

    return {
      name: 'research-scenario',
      description:
        'Research and documentation scenario with papers and discussions',
      setup: async () => ({
        researchers,
        researchPapers,
        discussions,
      }),
      data: {
        researchers,
        researchPapers,
        discussions,
        metrics: {
          researcherCount: researchers.length,
          paperCount: researchPapers.length,
          discussionCount: discussions.length,
          totalChunks: researchPapers.reduce(
            (sum, paper) => sum + paper.chunks.length,
            0,
          ),
        },
      },
    };
  }

  /**
   * Create an e-learning platform scenario
   */
  createELearningScenario(options?: FactoryOptions): TestScenario {
    // Create instructors
    const instructors = Array.from({ length: 3 }, () =>
      this.userFactory.createActiveUser({
        overrides: {
          user: {
            type: 'premium',
            name: `Prof. ${faker.person.lastName()}`,
          },
        },
      }),
    );

    // Create students
    const students = Array.from({ length: 25 }, () =>
      this.userFactory.create({
        overrides: { user: { type: 'regular' } },
      }),
    );

    // Create course materials
    const courseMaterials = Array.from({ length: 12 }, () => {
      const instructor = faker.helpers.arrayElement(instructors);
      return this.ragFactory.create({
        overrides: {
          document: {
            uploadedBy: instructor.user.id,
            originalName: `Lecture ${faker.number.int({ min: 1, max: 20 })} - ${faker.company.buzzNoun()}.pdf`,
          },
          content: {
            metadata: {
              documentType: 'lecture',
              course: faker.helpers.arrayElement([
                'CS101',
                'MATH201',
                'PHYS301',
              ]),
              week: faker.number.int({ min: 1, max: 16 }),
            },
          },
        },
      });
    });

    // Create study groups
    const studyGroups = Array.from({ length: 5 }, () => {
      const leader = faker.helpers.arrayElement(students);
      return this.chatFactory.createPublic({
        overrides: {
          chat: {
            userId: leader.user.id,
            title: `Study Group - ${faker.helpers.arrayElement(['Midterm Prep', 'Final Review', 'Assignment Help'])}`,
          },
        },
      });
    });

    // Create Q&A sessions
    const qaSessions = instructors.map((instructor) =>
      this.chatFactory.createPublic({
        overrides: {
          chat: {
            userId: instructor.user.id,
            title: `Office Hours - ${faker.date.weekday()}`,
          },
        },
      }),
    );

    return {
      name: 'e-learning-platform',
      description:
        'E-learning platform with instructors, students, and course materials',
      setup: async () => ({
        instructors,
        students,
        courseMaterials,
        studyGroups,
        qaSessions,
      }),
      data: {
        instructors,
        students,
        courseMaterials,
        studyGroups,
        qaSessions,
        metrics: {
          instructorCount: instructors.length,
          studentCount: students.length,
          materialCount: courseMaterials.length,
          studyGroupCount: studyGroups.length,
          qaSessionCount: qaSessions.length,
        },
      },
    };
  }

  /**
   * Create error and edge case scenarios
   */
  createErrorScenarios(options?: FactoryOptions): TestScenario[] {
    return [
      {
        name: 'orphaned-data',
        description: 'Data with missing parent relationships',
        setup: async () => {
          // Create chunks without documents
          const orphanedChunks =
            this.ragFactory.documentChunkFactory.createBatch({
              count: 5,
              overrides: { documentId: faker.string.uuid() }, // Non-existent document ID
            });

          return { orphanedChunks };
        },
        data: { type: 'error-scenario', scenario: 'orphaned-data' },
      },
      {
        name: 'corrupted-embeddings',
        description: 'Documents with invalid embedding data',
        setup: async () => {
          const document = this.ragFactory.create();

          // Create invalid embeddings
          const corruptedEmbeddings = document.chunks.map((chunk) =>
            this.ragFactory.documentEmbeddingFactory.create({
              overrides: {
                chunkId: chunk.id,
                embedding: 'invalid-json-data', // Corrupted embedding
              },
            }),
          );

          return { document, corruptedEmbeddings };
        },
        data: { type: 'error-scenario', scenario: 'corrupted-embeddings' },
      },
      {
        name: 'large-content',
        description: 'Documents with extremely large content',
        setup: async () => {
          const largeDocument = this.ragFactory.createLarge();

          // Create document with content that exceeds normal limits
          const extremeContent = Array.from({ length: 1000 }, () =>
            faker.lorem.paragraphs(10),
          ).join('\n\n');

          largeDocument.content.extractedText = extremeContent;

          return { largeDocument };
        },
        data: { type: 'error-scenario', scenario: 'large-content' },
      },
    ];
  }

  /**
   * Create performance testing scenarios
   */
  createPerformanceScenarios(): TestScenario[] {
    return [
      {
        name: 'high-volume-users',
        description: 'Large number of concurrent users',
        setup: async () => {
          const users = this.createUserNetwork(1000, { withRelations: true });
          return { users };
        },
        data: {
          type: 'performance-scenario',
          scenario: 'high-volume-users',
          scale: 'large',
        },
      },
      {
        name: 'document-processing-load',
        description: 'High volume document processing',
        setup: async () => {
          const documents = Array.from({ length: 500 }, () =>
            this.ragFactory.createLarge(),
          );
          return { documents };
        },
        data: {
          type: 'performance-scenario',
          scenario: 'document-processing-load',
          scale: 'xlarge',
        },
      },
      {
        name: 'chat-message-volume',
        description: 'High volume chat message processing',
        setup: async () => {
          const chats = Array.from({ length: 100 }, () =>
            this.chatFactory.createComplex(),
          );
          return { chats };
        },
        data: {
          type: 'performance-scenario',
          scenario: 'chat-message-volume',
          scale: 'large',
        },
      },
    ];
  }
}

// Export factory instance
export const relationshipFactory = new RelationshipFactory();
