import { faker } from '@faker-js/faker';
import { BaseFactory } from './base-factory';
import type {
  FactoryOptions,
  ChatInsert,
  MessageInsert,
  VoteInsert,
  StreamInsert,
  CompleteChat,
} from './types';

/**
 * Chat factory for creating test chat data
 */
export class ChatFactory extends BaseFactory<ChatInsert> {
  create(options?: FactoryOptions): ChatInsert {
    const realistic = options?.realistic ?? true;
    const baseTime = new Date();

    const chat: ChatInsert = {
      id: this.generateId(),
      createdAt: this.generateTimestamp(
        baseTime,
        -faker.number.int({ min: 1, max: 30 * 24 * 60 }),
      ),
      title: realistic
        ? this.generateRealisticChatTitle()
        : `Test Chat ${faker.string.alphanumeric(8)}`,
      userId: options?.overrides?.userId || this.generateId(),
      visibility: faker.helpers.weightedArrayElement([
        { weight: 85, value: 'private' },
        { weight: 15, value: 'public' },
      ]),
    };

    return this.applyOverrides(chat, options?.overrides);
  }

  /**
   * Create public chat
   */
  createPublic(options?: FactoryOptions): ChatInsert {
    return this.create({
      ...options,
      overrides: {
        visibility: 'public',
        title: this.generatePublicChatTitle(),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create recent chat
   */
  createRecent(options?: FactoryOptions): ChatInsert {
    const now = new Date();
    return this.create({
      ...options,
      overrides: {
        createdAt: this.generateTimestamp(
          now,
          -faker.number.int({ min: 0, max: 24 * 60 }),
        ), // Within last 24 hours
        ...options?.overrides,
      },
    });
  }

  /**
   * Create old chat
   */
  createOld(options?: FactoryOptions): ChatInsert {
    const now = new Date();
    return this.create({
      ...options,
      overrides: {
        createdAt: this.generateTimestamp(
          now,
          -faker.number.int({ min: 30 * 24 * 60, max: 365 * 24 * 60 }),
        ), // 30+ days old
        ...options?.overrides,
      },
    });
  }

  private generateRealisticChatTitle(): string {
    const patterns = [
      () => `How to ${faker.hacker.verb()} ${faker.hacker.noun()}`,
      () =>
        `${faker.helpers.arrayElement(['Help with', 'Question about', 'Issue with'])} ${faker.company.buzzPhrase()}`,
      () =>
        `${faker.helpers.arrayElement(['Building', 'Creating', 'Developing'])} ${faker.hacker.phrase()}`,
      () =>
        `${faker.helpers.arrayElement(['Debug', 'Fix', 'Solve'])} ${faker.hacker.abbreviation()} ${faker.helpers.arrayElement(['error', 'issue', 'problem'])}`,
      () =>
        `${faker.helpers.arrayElement(['Explain', 'Understand', 'Learn'])} ${faker.hacker.noun()}`,
    ];

    return faker.helpers.arrayElement(patterns)();
  }

  private generatePublicChatTitle(): string {
    const publicPatterns = [
      'Community Discussion: Best Practices',
      'Open Q&A Session',
      'Weekly Tech Talk',
      'Tutorial: Getting Started',
      'Public Workshop',
      'FAQ Discussion',
    ];

    return faker.helpers.arrayElement(publicPatterns);
  }
}

/**
 * Message factory for creating test message data
 */
export class MessageFactory extends BaseFactory<MessageInsert> {
  create(options?: FactoryOptions): MessageInsert {
    const realistic = options?.realistic ?? true;
    const role = faker.helpers.weightedArrayElement([
      { weight: 50, value: 'user' },
      { weight: 45, value: 'assistant' },
      { weight: 5, value: 'system' },
    ]);

    const message: MessageInsert = {
      id: this.generateId(),
      chatId: options?.overrides?.chatId || this.generateId(),
      role,
      parts: this.generateMessageParts(role, realistic),
      attachments: this.generateAttachments(realistic),
      createdAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 0, max: 60 }),
      ),
    };

    return this.applyOverrides(message, options?.overrides);
  }

  /**
   * Create user message
   */
  createUserMessage(options?: FactoryOptions): MessageInsert {
    return this.create({
      ...options,
      overrides: {
        role: 'user',
        parts: this.generateUserMessageParts(options?.realistic ?? true),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create assistant message
   */
  createAssistantMessage(options?: FactoryOptions): MessageInsert {
    return this.create({
      ...options,
      overrides: {
        role: 'assistant',
        parts: this.generateAssistantMessageParts(options?.realistic ?? true),
        ...options?.overrides,
      },
    });
  }

  /**
   * Create message with code
   */
  createCodeMessage(options?: FactoryOptions): MessageInsert {
    const language = faker.helpers.arrayElement([
      'javascript',
      'python',
      'typescript',
      'sql',
      'bash',
    ]);
    const code = this.generateCodeSnippet(language);

    return this.create({
      ...options,
      overrides: {
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: `Here's a ${language} example:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nThis code demonstrates...`,
          },
        ],
        ...options?.overrides,
      },
    });
  }

  /**
   * Create message with attachments
   */
  createMessageWithAttachments(options?: FactoryOptions): MessageInsert {
    return this.create({
      ...options,
      overrides: {
        attachments: this.generateRealisticAttachments(),
        ...options?.overrides,
      },
    });
  }

  private generateMessageParts(role: string, realistic: boolean): any[] {
    if (!realistic) {
      return [{ type: 'text', text: 'Test message content' }];
    }

    switch (role) {
      case 'user':
        return this.generateUserMessageParts(realistic);
      case 'assistant':
        return this.generateAssistantMessageParts(realistic);
      case 'system':
        return [
          { type: 'text', text: 'System message: Chat session initialized' },
        ];
      default:
        return [{ type: 'text', text: faker.lorem.sentence() }];
    }
  }

  private generateUserMessageParts(realistic: boolean): any[] {
    if (!realistic) {
      return [{ type: 'text', text: 'Test user message' }];
    }

    const patterns = [
      () => [{ type: 'text', text: this.generateContent('chat') }],
      () => [
        {
          type: 'text',
          text: `Can you help me with ${faker.hacker.noun()}? I'm trying to ${faker.hacker.verb()} ${faker.hacker.adjective()} ${faker.hacker.noun()}.`,
        },
      ],
      () => [
        {
          type: 'text',
          text: `I have a question about ${faker.company.buzzPhrase()}. ${faker.lorem.sentence()}`,
        },
      ],
    ];

    return faker.helpers.arrayElement(patterns)();
  }

  private generateAssistantMessageParts(realistic: boolean): any[] {
    if (!realistic) {
      return [{ type: 'text', text: 'Test assistant response' }];
    }

    const hasCode = faker.datatype.boolean(0.3);
    const parts: any[] = [];

    // Main response
    parts.push({
      type: 'text',
      text: `I'd be happy to help you with that. ${faker.lorem.paragraphs(faker.number.int({ min: 1, max: 3 }), '\n\n')}`,
    });

    // Sometimes include code
    if (hasCode) {
      const language = faker.helpers.arrayElement([
        'javascript',
        'python',
        'sql',
      ]);
      parts.push({
        type: 'code',
        language,
        code: this.generateCodeSnippet(language),
      });
    }

    return parts;
  }

  private generateCodeSnippet(language: string): string {
    const snippets = {
      javascript: `function ${faker.hacker.verb()}${faker.helpers.arrayElement(['Data', 'Info', 'Result'])}() {
  const ${faker.hacker.noun()} = ${JSON.stringify({ key: faker.hacker.noun(), value: faker.number.int() })};
  return ${faker.hacker.noun()}.${faker.hacker.verb()}();
}`,
      python: `def ${faker.hacker.verb()}_${faker.hacker.noun()}():
    ${faker.hacker.noun()} = "${faker.hacker.phrase()}"
    return ${faker.hacker.noun()}.${faker.hacker.verb()}()`,
      sql: `SELECT ${faker.hacker.noun()}, ${faker.hacker.verb()}_${faker.hacker.noun()}
FROM ${faker.hacker.noun()}_table
WHERE ${faker.hacker.adjective()} = '${faker.hacker.noun()}';`,
      typescript: `interface ${faker.helpers.arrayElement(['User', 'Data', 'Config'])} {
  ${faker.hacker.noun()}: string;
  ${faker.hacker.verb()}${faker.helpers.arrayElement(['At', 'By', 'Time'])}: Date;
}`,
    };

    return (
      snippets[language as keyof typeof snippets] ||
      'console.log("Hello, World!");'
    );
  }

  private generateAttachments(realistic: boolean): any[] {
    if (!realistic || !faker.datatype.boolean(0.2)) {
      return [];
    }

    return this.generateRealisticAttachments();
  }

  private generateRealisticAttachments(): any[] {
    const attachmentTypes = ['image', 'document', 'url'];
    const type = faker.helpers.arrayElement(attachmentTypes);

    switch (type) {
      case 'image':
        return [
          {
            type: 'image',
            url: faker.image.url(),
            name: `${faker.system.fileName()}.${faker.helpers.arrayElement(['jpg', 'png', 'gif'])}`,
            size: this.generateFileSize('small'),
          },
        ];

      case 'document':
        return [
          {
            type: 'document',
            url: faker.internet.url(),
            name: `${faker.system.fileName()}.${faker.helpers.arrayElement(['pdf', 'docx', 'txt'])}`,
            size: this.generateFileSize('medium'),
          },
        ];

      case 'url':
        return [
          {
            type: 'url',
            url: faker.internet.url(),
            title: faker.company.catchPhrase(),
            description: faker.lorem.sentence(),
          },
        ];

      default:
        return [];
    }
  }
}

/**
 * Vote factory for creating test vote data
 */
export class VoteFactory extends BaseFactory<VoteInsert> {
  create(options?: FactoryOptions): VoteInsert {
    const vote: VoteInsert = {
      chatId: options?.overrides?.chatId || this.generateId(),
      messageId: options?.overrides?.messageId || this.generateId(),
      isUpvoted: faker.datatype.boolean(0.7), // More upvotes than downvotes
    };

    return this.applyOverrides(vote, options?.overrides);
  }

  /**
   * Create upvote
   */
  createUpvote(options?: FactoryOptions): VoteInsert {
    return this.create({
      ...options,
      overrides: {
        isUpvoted: true,
        ...options?.overrides,
      },
    });
  }

  /**
   * Create downvote
   */
  createDownvote(options?: FactoryOptions): VoteInsert {
    return this.create({
      ...options,
      overrides: {
        isUpvoted: false,
        ...options?.overrides,
      },
    });
  }
}

/**
 * Stream factory for creating test stream data
 */
export class StreamFactory extends BaseFactory<StreamInsert> {
  create(options?: FactoryOptions): StreamInsert {
    const stream: StreamInsert = {
      id: this.generateId(),
      chatId: options?.overrides?.chatId || this.generateId(),
      createdAt: this.generateTimestamp(
        new Date(),
        -faker.number.int({ min: 0, max: 60 }),
      ),
    };

    return this.applyOverrides(stream, options?.overrides);
  }
}

/**
 * Complete chat factory that creates chat with all related data
 */
export class CompleteChatFactory extends BaseFactory<CompleteChat> {
  private chatFactory = new ChatFactory(this.seed);
  private messageFactory = new MessageFactory(this.seed);
  private voteFactory = new VoteFactory(this.seed);
  private streamFactory = new StreamFactory(this.seed);

  create(options?: FactoryOptions): CompleteChat {
    const chat = this.chatFactory.create(options);

    // Generate realistic conversation
    const messageCount = faker.number.int({ min: 2, max: 20 });
    const messages = this.generateConversation(chat.id!, messageCount);

    // Generate votes for some messages
    const votes = this.generateVotesForMessages(chat.id!, messages);

    // Generate streams
    const streamCount = faker.number.int({ min: 0, max: 3 });
    const streams = this.streamFactory.createBatch({
      count: streamCount,
      overrides: { chatId: chat.id! },
    });

    const result: CompleteChat = {
      chat,
      messages,
      votes,
      streams,
    };

    return this.applyOverrides(result, options?.overrides);
  }

  /**
   * Create simple chat with minimal messages
   */
  createSimple(options?: FactoryOptions): CompleteChat {
    const chat = this.chatFactory.create(options);

    const messages = [
      this.messageFactory.createUserMessage({ overrides: { chatId: chat.id } }),
      this.messageFactory.createAssistantMessage({
        overrides: { chatId: chat.id! },
      }),
    ];

    return {
      chat,
      messages,
      votes: [],
      streams: [],
    };
  }

  /**
   * Create public chat
   */
  createPublic(options?: FactoryOptions): CompleteChat {
    const chat = this.chatFactory.createPublic(options);
    
    const messages = [
      this.messageFactory.createUserMessage({ overrides: { chatId: chat.id } }),
      this.messageFactory.createAssistantMessage({
        overrides: { chatId: chat.id! },
      }),
    ];

    return {
      chat,
      messages,
      votes: [],
      streams: [],
    };
  }

  /**
   * Create complex chat with code, attachments, and votes
   */
  createComplex(options?: FactoryOptions): CompleteChat {
    const chat = this.chatFactory.create(options);

    const messages = [
      this.messageFactory.createUserMessage({ overrides: { chatId: chat.id } }),
      this.messageFactory.createCodeMessage({ overrides: { chatId: chat.id } }),
      this.messageFactory.createMessageWithAttachments({
        overrides: { chatId: chat.id! },
      }),
      this.messageFactory.createAssistantMessage({
        overrides: { chatId: chat.id! },
      }),
    ];

    const votes = messages.map((msg) =>
      this.voteFactory.create({
        overrides: {
          chatId: chat.id,
          messageId: msg.id,
        },
      }),
    );

    const streams = this.streamFactory.createBatch({
      count: 2,
      overrides: { chatId: chat.id! },
    });

    return {
      chat,
      messages,
      votes,
      streams,
    };
  }

  private generateConversation(
    chatId: string,
    messageCount: number,
  ): MessageInsert[] {
    const messages: MessageInsert[] = [];
    let currentTime = new Date();

    for (let i = 0; i < messageCount; i++) {
      const isUserMessage = i % 2 === 0; // Alternate between user and assistant
      const role = isUserMessage ? 'user' : 'assistant';

      const message = this.messageFactory.create({
        overrides: {
          chatId,
          role,
          createdAt: currentTime,
        },
      });

      messages.push(message);

      // Next message is a few minutes later
      currentTime = this.generateTimestamp(
        currentTime,
        faker.number.int({ min: 1, max: 10 }),
      );
    }

    return messages;
  }

  private generateVotesForMessages(
    chatId: string,
    messages: MessageInsert[],
  ): VoteInsert[] {
    const votes: VoteInsert[] = [];

    // Only vote on assistant messages, and only sometimes
    const assistantMessages = messages.filter((m) => m.role === 'assistant');

    for (const message of assistantMessages) {
      if (faker.datatype.boolean(0.4)) {
        // 40% chance of vote
        votes.push(
          this.voteFactory.create({
            overrides: {
              chatId,
              messageId: message.id,
            },
          }),
        );
      }
    }

    return votes;
  }
}

// Export factory instances
export const chatFactory = new ChatFactory();
export const messageFactory = new MessageFactory();
export const voteFactory = new VoteFactory();
export const streamFactory = new StreamFactory();
export const completeChatFactory = new CompleteChatFactory();
