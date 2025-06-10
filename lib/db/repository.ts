/**
 * Database Repository Pattern
 *
 * Provides an abstraction layer over direct database access to reduce coupling
 * and improve testability. Each repository handles a specific domain entity.
 */

import { db } from '@/lib/db';
import { eq, and, asc, desc, isNull } from 'drizzle-orm';
import type {
  User,
  Chat,
  DBMessage,
  Document,
  DocumentChunk,
} from '@/lib/db/schema';
import { user, chat, message, document, documentChunk } from '@/lib/db/schema';

/**
 * Base repository interface
 */
interface BaseRepository<T> {
  findById(id: string): Promise<T | null>;
  findMany(options?: { limit?: number; offset?: number }): Promise<T[]>;
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

/**
 * User Repository
 */
export class UserRepository implements BaseRepository<User> {
  async findById(id: string): Promise<User | null> {
    const result = await db.select().from(user).where(eq(user.id, id)).limit(1);
    return result[0] || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await db
      .select()
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    return result[0] || null;
  }

  async findMany(options?: { limit?: number; offset?: number }): Promise<
    User[]
  > {
    const query = db.select().from(user);

    if (options?.limit) query.limit(options.limit);
    if (options?.offset) query.offset(options.offset);

    return await query;
  }

  async create(
    data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<User> {
    const [newUser] = await db.insert(user).values(data).returning();
    return newUser;
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    const [updatedUser] = await db
      .update(user)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    return updatedUser;
  }

  async delete(id: string): Promise<void> {
    await db.delete(user).where(eq(user.id, id));
  }
}

/**
 * Chat Repository
 */
export class ChatRepository implements BaseRepository<Chat> {
  async findById(id: string): Promise<Chat | null> {
    const result = await db.select().from(chat).where(eq(chat.id, id)).limit(1);
    return result[0] || null;
  }

  async findByUserId(
    userId: string,
    options?: { limit?: number },
  ): Promise<Chat[]> {
    const query = db
      .select()
      .from(chat)
      .where(eq(chat.userId, userId))
      .orderBy(desc(chat.createdAt));

    if (options?.limit) query.limit(options.limit);

    return await query;
  }

  async findMany(options?: { limit?: number; offset?: number }): Promise<
    Chat[]
  > {
    const query = db.select().from(chat).orderBy(desc(chat.createdAt));

    if (options?.limit) query.limit(options.limit);
    if (options?.offset) query.offset(options.offset);

    return await query;
  }

  async create(data: Omit<Chat, 'id' | 'createdAt'>): Promise<Chat> {
    const [newChat] = await db
      .insert(chat)
      .values({
        ...data,
        createdAt: new Date(),
      })
      .returning();
    return newChat;
  }

  async update(id: string, data: Partial<Chat>): Promise<Chat> {
    const [updatedChat] = await db
      .update(chat)
      .set(data)
      .where(eq(chat.id, id))
      .returning();
    return updatedChat;
  }

  async delete(id: string): Promise<void> {
    await db.delete(chat).where(eq(chat.id, id));
  }

  async deleteByUserId(userId: string): Promise<void> {
    await db.delete(chat).where(eq(chat.userId, userId));
  }
}

/**
 * Message Repository
 */
export class MessageRepository implements BaseRepository<DBMessage> {
  async findById(id: string): Promise<DBMessage | null> {
    const result = await db
      .select()
      .from(message)
      .where(eq(message.id, id))
      .limit(1);
    return result[0] || null;
  }

  async findByChatId(
    chatId: string,
    options?: { limit?: number },
  ): Promise<DBMessage[]> {
    const query = db
      .select()
      .from(message)
      .where(eq(message.chatId, chatId))
      .orderBy(asc(message.createdAt));

    if (options?.limit) query.limit(options.limit);

    return await query;
  }

  async findMany(options?: { limit?: number; offset?: number }): Promise<
    DBMessage[]
  > {
    const query = db.select().from(message).orderBy(desc(message.createdAt));

    if (options?.limit) query.limit(options.limit);
    if (options?.offset) query.offset(options.offset);

    return await query;
  }

  async create(data: Omit<DBMessage, 'id' | 'createdAt'>): Promise<DBMessage> {
    const [newMessage] = await db
      .insert(message)
      .values({
        ...data,
        createdAt: new Date(),
      })
      .returning();
    return newMessage;
  }

  async update(id: string, data: Partial<DBMessage>): Promise<DBMessage> {
    const [updatedMessage] = await db
      .update(message)
      .set(data)
      .where(eq(message.id, id))
      .returning();
    return updatedMessage;
  }

  async delete(id: string): Promise<void> {
    await db.delete(message).where(eq(message.id, id));
  }

  async deleteByChatId(chatId: string): Promise<void> {
    await db.delete(message).where(eq(message.chatId, chatId));
  }
}

/**
 * Document Repository
 */
export class DocumentRepository implements BaseRepository<Document> {
  async findById(id: string): Promise<Document | null> {
    const result = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .limit(1);
    return result[0] || null;
  }

  async findByUserId(
    userId: string,
    options?: { limit?: number },
  ): Promise<Document[]> {
    const query = db
      .select()
      .from(document)
      .where(eq(document.userId, userId))
      .orderBy(desc(document.createdAt));

    if (options?.limit) query.limit(options.limit);

    return await query;
  }

  async findMany(options?: { limit?: number; offset?: number }): Promise<
    Document[]
  > {
    const query = db.select().from(document).orderBy(desc(document.createdAt));

    if (options?.limit) query.limit(options.limit);
    if (options?.offset) query.offset(options.offset);

    return await query;
  }

  async create(data: Omit<Document, 'id' | 'createdAt'>): Promise<Document> {
    const [newDocument] = await db
      .insert(document)
      .values({
        ...data,
        createdAt: new Date(),
      })
      .returning();
    return newDocument;
  }

  async update(id: string, data: Partial<Document>): Promise<Document> {
    const [updatedDocument] = await db
      .update(document)
      .set(data)
      .where(eq(document.id, id))
      .returning();
    return updatedDocument;
  }

  async delete(id: string): Promise<void> {
    await db.delete(document).where(eq(document.id, id));
  }
}

/**
 * Document Chunk Repository
 */
export class DocumentChunkRepository implements BaseRepository<DocumentChunk> {
  async findById(id: string): Promise<DocumentChunk | null> {
    const result = await db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.id, id))
      .limit(1);
    return result[0] || null;
  }

  async findByDocumentId(
    documentId: string,
    options?: { limit?: number },
  ): Promise<DocumentChunk[]> {
    const query = db
      .select()
      .from(documentChunk)
      .where(eq(documentChunk.documentId, documentId))
      .orderBy(asc(documentChunk.pageNumber), asc(documentChunk.chunkIndex));

    if (options?.limit) query.limit(options.limit);

    return await query;
  }

  async findByElementType(
    documentId: string,
    elementType: string | null,
  ): Promise<DocumentChunk[]> {
    const whereConditions = [eq(documentChunk.documentId, documentId)];

    if (elementType === null) {
      whereConditions.push(isNull(documentChunk.elementType));
    } else {
      whereConditions.push(eq(documentChunk.elementType, elementType));
    }

    return await db
      .select()
      .from(documentChunk)
      .where(and(...whereConditions))
      .orderBy(asc(documentChunk.pageNumber), asc(documentChunk.chunkIndex));
  }

  async findMany(options?: { limit?: number; offset?: number }): Promise<
    DocumentChunk[]
  > {
    const query = db.select().from(documentChunk);

    if (options?.limit) query.limit(options.limit);
    if (options?.offset) query.offset(options.offset);

    return await query;
  }

  async create(
    data: Omit<DocumentChunk, 'id' | 'createdAt'>,
  ): Promise<DocumentChunk> {
    const [newChunk] = await db
      .insert(documentChunk)
      .values({
        ...data,
        createdAt: new Date(),
      })
      .returning();
    return newChunk;
  }

  async update(
    id: string,
    data: Partial<DocumentChunk>,
  ): Promise<DocumentChunk> {
    const [updatedChunk] = await db
      .update(documentChunk)
      .set(data)
      .where(eq(documentChunk.id, id))
      .returning();
    return updatedChunk;
  }

  async delete(id: string): Promise<void> {
    await db.delete(documentChunk).where(eq(documentChunk.id, id));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await db
      .delete(documentChunk)
      .where(eq(documentChunk.documentId, documentId));
  }
}

/**
 * Repository factory and registry
 */
export class RepositoryRegistry {
  private static instance: RepositoryRegistry;
  private repositories: Map<string, any> = new Map();

  private constructor() {
    // Initialize repositories
    this.repositories.set('user', new UserRepository());
    this.repositories.set('chat', new ChatRepository());
    this.repositories.set('message', new MessageRepository());
    this.repositories.set('document', new DocumentRepository());
    this.repositories.set('documentChunk', new DocumentChunkRepository());
  }

  public static getInstance(): RepositoryRegistry {
    if (!RepositoryRegistry.instance) {
      RepositoryRegistry.instance = new RepositoryRegistry();
    }
    return RepositoryRegistry.instance;
  }

  public getRepository<T>(name: string): T {
    const repository = this.repositories.get(name);
    if (!repository) {
      throw new Error(`Repository ${name} not found`);
    }
    return repository as T;
  }

  public registerRepository(name: string, repository: any): void {
    this.repositories.set(name, repository);
  }
}

// Export repository instances for convenience
export const userRepository = new UserRepository();
export const chatRepository = new ChatRepository();
export const messageRepository = new MessageRepository();
export const documentRepository = new DocumentRepository();
export const documentChunkRepository = new DocumentChunkRepository();

// Export registry for dependency injection
export const repositoryRegistry = RepositoryRegistry.getInstance();
