import type { InferSelectModel } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  foreignKey,
  boolean,
  index,
  uniqueIndex,
  integer,
  jsonb,
} from 'drizzle-orm/pg-core';

export const user = pgTable(
  'User',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    email: varchar('email', { length: 64 }),
    password: varchar('password', { length: 64 }),
    emailVerified: boolean('emailVerified').notNull().default(false),
    image: text('image'),
    name: text('name'),
    type: varchar('type', { length: 20 }).notNull().default('regular'),
    isAnonymous: boolean('isAnonymous').notNull().default(false),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex('user_email_idx').on(table.email),
    typeIdx: index('user_type_idx').on(table.type),
    createdAtIdx: index('user_created_at_idx').on(table.createdAt),
  }),
);

export const session = pgTable(
  'Session',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    expiresAt: timestamp('expiresAt').notNull(),
    ipAddress: varchar('ipAddress', { length: 45 }),
    userAgent: text('userAgent'),
    csrfToken: varchar('csrfToken', { length: 64 }),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('session_user_id_idx').on(table.userId),
    tokenIdx: uniqueIndex('session_token_idx').on(table.token),
    expiresAtIdx: index('session_expires_at_idx').on(table.expiresAt),
  }),
);

export const account = pgTable('Account', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: varchar('accountId', { length: 255 }).notNull(),
  providerId: varchar('providerId', { length: 50 }).notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: varchar('password', { length: 255 }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;
export type Session = InferSelectModel<typeof session>;
export type Account = InferSelectModel<typeof account>;

export const chat = pgTable(
  'Chat',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    visibility: varchar('visibility', { enum: ['public', 'private'] })
      .notNull()
      .default('private'),
  },
  (table) => ({
    userIdIdx: index('chat_user_id_idx').on(table.userId),
    createdAtIdx: index('chat_created_at_idx').on(table.createdAt),
    visibilityIdx: index('chat_visibility_idx').on(table.visibility),
    userVisibilityIdx: index('chat_user_visibility_idx').on(
      table.userId,
      table.visibility,
    ),
  }),
);

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable(
  'Message_v2',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    role: varchar('role').notNull(),
    parts: json('parts').notNull(),
    attachments: json('attachments').notNull(),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    chatIdIdx: index('message_chat_id_idx').on(table.chatId),
    roleIdx: index('message_role_idx').on(table.role),
    createdAtIdx: index('message_created_at_idx').on(table.createdAt),
    chatCreatedIdx: index('message_chat_created_idx').on(
      table.chatId,
      table.createdAt,
    ),
  }),
);

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  'Vote',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  'Vote_v2',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: varchar('text', { enum: ['text', 'code', 'image', 'sheet'] })
      .notNull()
      .default('text'),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  'Suggestion',
  {
    id: uuid('id').notNull().defaultRandom(),
    documentId: uuid('documentId').notNull(),
    documentCreatedAt: timestamp('documentCreatedAt').notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: boolean('isResolved').notNull().default(false),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  'Stream',
  {
    id: uuid('id').notNull().defaultRandom(),
    chatId: uuid('chatId').notNull(),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  }),
);

export type Stream = InferSelectModel<typeof stream>;

// RAG Document Management Tables
export const ragDocument = pgTable(
  'RAGDocument',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    fileName: text('fileName').notNull(),
    originalName: text('originalName').notNull(),
    filePath: text('filePath').notNull(),
    mimeType: text('mimeType').notNull(),
    fileSize: text('fileSize').notNull(),
    status: varchar('status', {
      enum: [
        'uploaded',
        'processing',
        'text_extracted',
        'chunked',
        'embedded',
        'processed',
        'error',
      ],
    })
      .notNull()
      .default('uploaded'),
    uploadedBy: uuid('uploadedBy')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('rag_document_status_idx').on(table.status),
    uploadedByIdx: index('rag_document_uploaded_by_idx').on(table.uploadedBy),
    createdAtIdx: index('rag_document_created_at_idx').on(table.createdAt),
    userStatusIdx: index('rag_document_user_status_idx').on(
      table.uploadedBy,
      table.status,
    ),
    fileNameIdx: index('rag_document_file_name_idx').on(table.fileName),
  }),
);

export type RAGDocument = InferSelectModel<typeof ragDocument>;

export const documentContent = pgTable(
  'DocumentContent',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    documentId: uuid('documentId')
      .notNull()
      .references(() => ragDocument.id, { onDelete: 'cascade' }),
    textFilePath: text('textFilePath'),
    extractedText: text('extractedText'),
    pageCount: text('pageCount'),
    charCount: text('charCount'),
    metadata: json('metadata'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    documentIdIdx: uniqueIndex('document_content_document_id_idx').on(
      table.documentId,
    ),
  }),
);

export type DocumentContent = InferSelectModel<typeof documentContent>;

export const documentChunk = pgTable(
  'DocumentChunk',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    documentId: uuid('documentId')
      .notNull()
      .references(() => ragDocument.id, { onDelete: 'cascade' }),
    chunkIndex: text('chunkIndex').notNull(),
    content: text('content').notNull(),
    metadata: json('metadata'),
    tokenCount: text('tokenCount'),
    // ADE metadata fields for enriched LLM prompts
    elementType: text('element_type'), // e.g., 'paragraph', 'title', 'figure_caption', 'table_text', 'list_item'
    pageNumber: integer('page_number'), // page number where the element appears
    bbox: jsonb('bbox'), // optional bounding box coordinates as [x1, y1, x2, y2]
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    documentIdIdx: index('document_chunk_document_id_idx').on(table.documentId),
    chunkIndexIdx: index('document_chunk_index_idx').on(table.chunkIndex),
    docChunkIdx: index('document_chunk_doc_chunk_idx').on(
      table.documentId,
      table.chunkIndex,
    ),
    // Add indexes for the new ADE metadata fields
    elementTypeIdx: index('document_chunk_element_type_idx').on(table.elementType),
    pageNumberIdx: index('document_chunk_page_number_idx').on(table.pageNumber),
    docPageIdx: index('document_chunk_doc_page_idx').on(
      table.documentId,
      table.pageNumber,
    ),
  }),
);

export type DocumentChunk = InferSelectModel<typeof documentChunk>;

export const documentEmbedding = pgTable(
  'DocumentEmbedding',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chunkId: uuid('chunkId')
      .notNull()
      .references(() => documentChunk.id, { onDelete: 'cascade' }),
    embedding: text('embedding').notNull(), // JSON array of floats
    model: text('model').notNull().default('cohere-embed-v4.0'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    chunkIdIdx: uniqueIndex('document_embedding_chunk_id_idx').on(
      table.chunkId,
    ),
    modelIdx: index('document_embedding_model_idx').on(table.model),
  }),
);

export type DocumentEmbedding = InferSelectModel<typeof documentEmbedding>;

// Define relations for RAG tables
export const ragDocumentRelations = relations(ragDocument, ({ one, many }) => ({
  content: one(documentContent, {
    fields: [ragDocument.id],
    references: [documentContent.documentId],
  }),
  chunks: many(documentChunk),
}));

export const documentContentRelations = relations(
  documentContent,
  ({ one }) => ({
    document: one(ragDocument, {
      fields: [documentContent.documentId],
      references: [ragDocument.id],
    }),
  }),
);

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
  document: one(ragDocument, {
    fields: [documentChunk.documentId],
    references: [ragDocument.id],
  }),
  embedding: one(documentEmbedding, {
    fields: [documentChunk.id],
    references: [documentEmbedding.chunkId],
  }),
}));

export const documentEmbeddingRelations = relations(
  documentEmbedding,
  ({ one }) => ({
    chunk: one(documentChunk, {
      fields: [documentEmbedding.chunkId],
      references: [documentChunk.id],
    }),
  }),
);

// Rate Limiting Tables
export const rateLimitLog = pgTable(
  'RateLimitLog',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('rate_limit_user_id_idx').on(table.userId),
    endpointIdx: index('rate_limit_endpoint_idx').on(table.endpoint),
    createdAtIdx: index('rate_limit_created_at_idx').on(table.createdAt),
    userEndpointIdx: index('rate_limit_user_endpoint_idx').on(
      table.userId,
      table.endpoint,
    ),
    userEndpointTimeIdx: index('rate_limit_user_endpoint_time_idx').on(
      table.userId,
      table.endpoint,
      table.createdAt,
    ),
  }),
);

export type RateLimitLog = InferSelectModel<typeof rateLimitLog>;
