import { pgTable, index, uuid, timestamp, jsonb, foreignKey, serial, text, boolean, varchar, json, uniqueIndex, unique, integer, vector, numeric, primaryKey, pgEnum } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const documentStatus = pgEnum("document_status", ['uploaded', 'processing', 'processed', 'error'])
export const messageSender = pgEnum("message_sender", ['user', 'ai', 'system'])



export const chatSessions = pgTable("chat_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb().default({}).notNull(),
},
(table) => {
	return {
		createdAtIdx: index("chat_sessions_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
	}
});

export const chatMessages = pgTable("chat_messages", {
	id: serial().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	content: text().notNull(),
	sender: messageSender().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	metadata: jsonb().default({}).notNull(),
},
(table) => {
	return {
		createdAtIdx: index("chat_messages_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		sessionIdIdx: index("chat_messages_session_id_idx").using("btree", table.sessionId.asc().nullsLast()),
		chatMessagesSessionIdFkey: foreignKey({
			columns: [table.sessionId],
			foreignColumns: [chatSessions.id],
			name: "chat_messages_session_id_fkey"
		}),
	}
});

export const suggestion = pgTable("Suggestion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid().notNull(),
	documentCreatedAt: timestamp({ mode: 'string' }).notNull(),
	originalText: text().notNull(),
	suggestedText: text().notNull(),
	description: text(),
	isResolved: boolean().default(false).notNull(),
	userId: uuid().notNull(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
},
(table) => {
	return {
		suggestionUserIdUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Suggestion_userId_User_id_fk"
		}),
		suggestionDocumentIdDocumentCreatedAtDocumentIdCreatedAtF: foreignKey({
			columns: [table.documentId, table.documentCreatedAt],
			foreignColumns: [document.createdAt, document.id],
			name: "Suggestion_documentId_documentCreatedAt_Document_id_createdAt_f"
		}),
	}
});

export const message = pgTable("Message", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chatId: uuid().notNull(),
	role: varchar().notNull(),
	content: json().notNull(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
},
(table) => {
	return {
		messageChatIdChatIdFk: foreignKey({
			columns: [table.chatId],
			foreignColumns: [chat.id],
			name: "Message_chatId_Chat_id_fk"
		}),
	}
});

export const chat = pgTable("Chat", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
	userId: uuid().notNull(),
	title: text().notNull(),
	visibility: varchar().default('private').notNull(),
},
(table) => {
	return {
		chatCreatedAtIdx: index("chat_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		chatUserIdIdx: index("chat_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		chatUserVisibilityIdx: index("chat_user_visibility_idx").using("btree", table.userId.asc().nullsLast(), table.visibility.asc().nullsLast()),
		chatVisibilityIdx: index("chat_visibility_idx").using("btree", table.visibility.asc().nullsLast()),
		chatUserIdUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Chat_userId_User_id_fk"
		}),
	}
});

export const messageV2 = pgTable("Message_v2", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chatId: uuid().notNull(),
	role: varchar().notNull(),
	parts: json().notNull(),
	attachments: json().notNull(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
},
(table) => {
	return {
		messageChatCreatedIdx: index("message_chat_created_idx").using("btree", table.chatId.asc().nullsLast(), table.createdAt.asc().nullsLast()),
		messageChatIdIdx: index("message_chat_id_idx").using("btree", table.chatId.asc().nullsLast()),
		messageCreatedAtIdx: index("message_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		messageRoleIdx: index("message_role_idx").using("btree", table.role.asc().nullsLast()),
		messageV2ChatIdChatIdFk: foreignKey({
			columns: [table.chatId],
			foreignColumns: [chat.id],
			name: "Message_v2_chatId_Chat_id_fk"
		}),
	}
});

export const stream = pgTable("Stream", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chatId: uuid().notNull(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
},
(table) => {
	return {
		streamChatIdChatIdFk: foreignKey({
			columns: [table.chatId],
			foreignColumns: [chat.id],
			name: "Stream_chatId_Chat_id_fk"
		}),
	}
});

export const account = pgTable("Account", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid().notNull(),
	accountId: varchar({ length: 255 }).notNull(),
	providerId: varchar({ length: 50 }).notNull(),
	accessToken: text(),
	refreshToken: text(),
	idToken: text(),
	accessTokenExpiresAt: timestamp({ mode: 'string' }),
	refreshTokenExpiresAt: timestamp({ mode: 'string' }),
	scope: text(),
	password: varchar({ length: 255 }),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		accountUserIdUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Account_userId_User_id_fk"
		}).onDelete("cascade"),
	}
});

export const session = pgTable("Session", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid().notNull(),
	token: varchar({ length: 255 }).notNull(),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	ipAddress: varchar({ length: 45 }),
	userAgent: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	csrfToken: varchar({ length: 64 }),
},
(table) => {
	return {
		sessionExpiresAtIdx: index("session_expires_at_idx").using("btree", table.expiresAt.asc().nullsLast()),
		sessionTokenIdx: uniqueIndex("session_token_idx").using("btree", table.token.asc().nullsLast()),
		sessionUserIdIdx: index("session_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		sessionUserIdUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Session_userId_User_id_fk"
		}).onDelete("cascade"),
		sessionTokenUnique: unique("Session_token_unique").on(table.token),
	}
});

export const documentImages = pgTable("document_images", {
	id: serial().primaryKey().notNull(),
	documentId: varchar("document_id").notNull(),
	chunkId: integer("chunk_id"),
	imageUrl: text("image_url").notNull(),
	imageType: varchar("image_type", { length: 20 }).default('png').notNull(),
	pageNumber: integer("page_number"),
	positionMetadata: jsonb("position_metadata").default({}),
	extractionMetadata: jsonb("extraction_metadata").default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
},
(table) => {
	return {
		chunkIdIdx: index("document_images_chunk_id_idx").using("btree", table.chunkId.asc().nullsLast()),
		documentIdIdx: index("document_images_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
		pageNumberIdx: index("document_images_page_number_idx").using("btree", table.pageNumber.asc().nullsLast()),
		documentImagesChunkIdFkey: foreignKey({
			columns: [table.chunkId],
			foreignColumns: [documentChunks.id],
			name: "document_images_chunk_id_fkey"
		}).onDelete("cascade"),
	}
});

export const documentEmbeddings = pgTable("document_embeddings", {
	id: serial().primaryKey().notNull(),
	documentId: varchar("document_id", { length: 255 }).notNull(),
	elementId: varchar("element_id", { length: 255 }).notNull(),
	filename: varchar({ length: 255 }).notNull(),
	text: text().notNull(),
	embedding: vector({ dimensions: 1536 }).notNull(),
	metadata: jsonb(),
	embeddingModel: varchar("embedding_model", { length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	contentType: varchar("content_type", { length: 20 }).default('text'),
	imageUrl: text("image_url"),
	multimodalMetadata: jsonb("multimodal_metadata").default({}),
},
(table) => {
	return {
		contentTypeIdx: index("document_embeddings_content_type_idx").using("btree", table.contentType.asc().nullsLast()),
		documentIdIdx: index("document_embeddings_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
		embeddingIdx: index("document_embeddings_embedding_idx").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "100"}),
		filenameIdx: index("document_embeddings_filename_idx").using("btree", table.filename.asc().nullsLast()),
		documentEmbeddingsElementIdKey: unique("document_embeddings_element_id_key").on(table.elementId),
	}
});

export const documentChunks = pgTable("document_chunks", {
	id: serial().primaryKey().notNull(),
	documentId: integer("document_id").notNull(),
	content: text().notNull(),
	pageNumber: integer("page_number"),
	chunkIndex: integer("chunk_index").notNull(),
	metadata: jsonb().default({}).notNull(),
	hasImages: boolean("has_images").default(false),
	imageCount: integer("image_count").default(0),
},
(table) => {
	return {
		documentIdIdx: index("document_chunks_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
		pageNumberIdx: index("document_chunks_page_number_idx").using("btree", table.pageNumber.asc().nullsLast()),
		documentChunksDocumentIdFkey: foreignKey({
			columns: [table.documentId],
			foreignColumns: [documents.id],
			name: "document_chunks_document_id_fkey"
		}),
	}
});

export const documents = pgTable("documents", {
	id: serial().primaryKey().notNull(),
	sessionId: uuid("session_id").notNull(),
	filename: text().notNull(),
	mimeType: text("mime_type").notNull(),
	status: documentStatus().default('uploaded').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	processedAt: timestamp("processed_at", { withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}).notNull(),
	imagesExtracted: boolean("images_extracted").default(false),
	multimodalProcessed: boolean("multimodal_processed").default(false),
},
(table) => {
	return {
		createdAtIdx: index("documents_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		sessionIdIdx: index("documents_session_id_idx").using("btree", table.sessionId.asc().nullsLast()),
		statusIdx: index("documents_status_idx").using("btree", table.status.asc().nullsLast()),
		documentsSessionIdFkey: foreignKey({
			columns: [table.sessionId],
			foreignColumns: [chatSessions.id],
			name: "documents_session_id_fkey"
		}),
	}
});

export const ragDocument = pgTable("RAGDocument", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fileName: text().notNull(),
	originalName: text().notNull(),
	filePath: text().notNull(),
	mimeType: text().notNull(),
	fileSize: text().notNull(),
	status: varchar().default('uploaded').notNull(),
	uploadedBy: uuid().notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		ragDocumentCreatedAtIdx: index("rag_document_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		ragDocumentFileNameIdx: index("rag_document_file_name_idx").using("btree", table.fileName.asc().nullsLast()),
		ragDocumentStatusIdx: index("rag_document_status_idx").using("btree", table.status.asc().nullsLast()),
		ragDocumentUploadedByIdx: index("rag_document_uploaded_by_idx").using("btree", table.uploadedBy.asc().nullsLast()),
		ragDocumentUserStatusIdx: index("rag_document_user_status_idx").using("btree", table.uploadedBy.asc().nullsLast(), table.status.asc().nullsLast()),
		ragDocumentUploadedByUserIdFk: foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [user.id],
			name: "RAGDocument_uploadedBy_User_id_fk"
		}),
	}
});

export const documentContent = pgTable("DocumentContent", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid().notNull(),
	textFilePath: text(),
	extractedText: text(),
	pageCount: text(),
	charCount: text(),
	metadata: json(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		documentContentDocumentIdIdx: uniqueIndex("document_content_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
		documentContentDocumentIdRagDocumentIdFk: foreignKey({
			columns: [table.documentId],
			foreignColumns: [ragDocument.id],
			name: "DocumentContent_documentId_RAGDocument_id_fk"
		}).onDelete("cascade"),
	}
});

export const user = pgTable("User", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: varchar({ length: 64 }),
	password: varchar({ length: 64 }),
	emailVerified: boolean().default(false).notNull(),
	image: text(),
	name: text(),
	type: varchar({ length: 20 }).default('regular').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	isAnonymous: boolean().default(false).notNull(),
},
(table) => {
	return {
		userCreatedAtIdx: index("user_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		userEmailIdx: uniqueIndex("user_email_idx").using("btree", table.email.asc().nullsLast()),
		userTypeIdx: index("user_type_idx").using("btree", table.type.asc().nullsLast()),
	}
});

export const rateLimitLog = pgTable("RateLimitLog", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid().notNull(),
	endpoint: text().notNull(),
	ipAddress: text(),
	userAgent: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		rateLimitCreatedAtIdx: index("rate_limit_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		rateLimitEndpointIdx: index("rate_limit_endpoint_idx").using("btree", table.endpoint.asc().nullsLast()),
		rateLimitUserEndpointIdx: index("rate_limit_user_endpoint_idx").using("btree", table.userId.asc().nullsLast(), table.endpoint.asc().nullsLast()),
		rateLimitUserEndpointTimeIdx: index("rate_limit_user_endpoint_time_idx").using("btree", table.userId.asc().nullsLast(), table.endpoint.asc().nullsLast(), table.createdAt.asc().nullsLast()),
		rateLimitUserIdIdx: index("rate_limit_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		rateLimitLogUserIdUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "RateLimitLog_userId_User_id_fk"
		}).onDelete("cascade"),
	}
});

export const documentChunk = pgTable("DocumentChunk", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid().notNull(),
	chunkIndex: text().notNull(),
	content: text().notNull(),
	metadata: json(),
	tokenCount: text(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	elementType: text("element_type"),
	pageNumber: integer("page_number"),
	bbox: jsonb(),
	confidence: numeric({ precision: 3, scale:  2 }),
	adeElementId: text("ade_element_id"),
},
(table) => {
	return {
		documentChunkAdeElementIdIdx: index("document_chunk_ade_element_id_idx").using("btree", table.adeElementId.asc().nullsLast()),
		documentChunkConfidenceIdx: index("document_chunk_confidence_idx").using("btree", table.confidence.asc().nullsLast()),
		documentChunkDocChunkIdx: index("document_chunk_doc_chunk_idx").using("btree", table.documentId.asc().nullsLast(), table.chunkIndex.asc().nullsLast()),
		documentChunkDocPageIdx: index("document_chunk_doc_page_idx").using("btree", table.documentId.asc().nullsLast(), table.pageNumber.asc().nullsLast()),
		documentChunkDocumentIdIdx: index("document_chunk_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
		documentChunkElementTypeIdx: index("document_chunk_element_type_idx").using("btree", table.elementType.asc().nullsLast()),
		documentChunkIndexIdx: index("document_chunk_index_idx").using("btree", table.chunkIndex.asc().nullsLast()),
		documentChunkPageNumberIdx: index("document_chunk_page_number_idx").using("btree", table.pageNumber.asc().nullsLast()),
		documentChunkDocumentIdRagDocumentIdFk: foreignKey({
			columns: [table.documentId],
			foreignColumns: [ragDocument.id],
			name: "DocumentChunk_documentId_RAGDocument_id_fk"
		}).onDelete("cascade"),
	}
});

export const documentEmbedding = pgTable("DocumentEmbedding", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	chunkId: uuid(),
	embedding: text().notNull(),
	model: text().default('cohere-embed-v4.0').notNull(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	documentId: uuid().notNull(),
	imageId: uuid(),
	embeddingType: varchar().default('text').notNull(),
	dimensions: integer().default(1024).notNull(),
},
(table) => {
	return {
		documentEmbeddingChunkIdIdx: index("document_embedding_chunk_id_idx").using("btree", table.chunkId.asc().nullsLast()),
		documentEmbeddingChunkTypeIdx: index("document_embedding_chunk_type_idx").using("btree", table.chunkId.asc().nullsLast(), table.embeddingType.asc().nullsLast()),
		documentEmbeddingCreatedAtIdx: index("document_embedding_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		documentEmbeddingDocTypeIdx: index("document_embedding_doc_type_idx").using("btree", table.documentId.asc().nullsLast(), table.embeddingType.asc().nullsLast()),
		documentEmbeddingDocumentIdIdx: index("document_embedding_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
		documentEmbeddingImageIdIdx: index("document_embedding_image_id_idx").using("btree", table.imageId.asc().nullsLast()),
		documentEmbeddingImageTypeIdx: index("document_embedding_image_type_idx").using("btree", table.imageId.asc().nullsLast(), table.embeddingType.asc().nullsLast()),
		documentEmbeddingModelIdx: index("document_embedding_model_idx").using("btree", table.model.asc().nullsLast()),
		documentEmbeddingTypeIdx: index("document_embedding_type_idx").using("btree", table.embeddingType.asc().nullsLast()),
		documentEmbeddingChunkIdDocumentChunkIdFk: foreignKey({
			columns: [table.chunkId],
			foreignColumns: [documentChunk.id],
			name: "DocumentEmbedding_chunkId_DocumentChunk_id_fk"
		}).onDelete("cascade"),
		documentEmbeddingDocumentIdRagDocumentIdFk: foreignKey({
			columns: [table.documentId],
			foreignColumns: [ragDocument.id],
			name: "DocumentEmbedding_documentId_RAGDocument_id_fk"
		}).onDelete("cascade"),
		documentEmbeddingImageIdDocumentImageIdFk: foreignKey({
			columns: [table.imageId],
			foreignColumns: [documentImage.id],
			name: "DocumentEmbedding_imageId_DocumentImage_id_fk"
		}).onDelete("cascade"),
	}
});

export const documentImage = pgTable("DocumentImage", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	documentId: uuid().notNull(),
	pageNumber: integer().notNull(),
	imagePath: text().notNull(),
	imageUrl: text(),
	width: integer(),
	height: integer(),
	fileSize: integer(),
	mimeType: text().default('image/png').notNull(),
	extractedBy: varchar().default('pdf_conversion').notNull(),
	extractionMetadata: jsonb(),
	createdAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		documentImageCreatedAtIdx: index("document_image_created_at_idx").using("btree", table.createdAt.asc().nullsLast()),
		documentImageDocPageIdx: index("document_image_doc_page_idx").using("btree", table.documentId.asc().nullsLast(), table.pageNumber.asc().nullsLast()),
		documentImageDocPageUniqueIdx: uniqueIndex("document_image_doc_page_unique_idx").using("btree", table.documentId.asc().nullsLast(), table.pageNumber.asc().nullsLast(), table.extractedBy.asc().nullsLast()),
		documentImageDocumentIdIdx: index("document_image_document_id_idx").using("btree", table.documentId.asc().nullsLast()),
		documentImageExtractedByIdx: index("document_image_extracted_by_idx").using("btree", table.extractedBy.asc().nullsLast()),
		documentImagePageNumberIdx: index("document_image_page_number_idx").using("btree", table.pageNumber.asc().nullsLast()),
		documentImageDocumentIdRagDocumentIdFk: foreignKey({
			columns: [table.documentId],
			foreignColumns: [ragDocument.id],
			name: "DocumentImage_documentId_RAGDocument_id_fk"
		}).onDelete("cascade"),
	}
});

export const vote = pgTable("Vote", {
	chatId: uuid().notNull(),
	messageId: uuid().notNull(),
	isUpvoted: boolean().notNull(),
},
(table) => {
	return {
		voteChatIdChatIdFk: foreignKey({
			columns: [table.chatId],
			foreignColumns: [chat.id],
			name: "Vote_chatId_Chat_id_fk"
		}),
		voteMessageIdMessageIdFk: foreignKey({
			columns: [table.messageId],
			foreignColumns: [message.id],
			name: "Vote_messageId_Message_id_fk"
		}),
		voteChatIdMessageIdPk: primaryKey({ columns: [table.chatId, table.messageId], name: "Vote_chatId_messageId_pk"}),
	}
});

export const voteV2 = pgTable("Vote_v2", {
	chatId: uuid().notNull(),
	messageId: uuid().notNull(),
	isUpvoted: boolean().notNull(),
},
(table) => {
	return {
		voteV2ChatIdChatIdFk: foreignKey({
			columns: [table.chatId],
			foreignColumns: [chat.id],
			name: "Vote_v2_chatId_Chat_id_fk"
		}),
		voteV2MessageIdMessageV2IdFk: foreignKey({
			columns: [table.messageId],
			foreignColumns: [messageV2.id],
			name: "Vote_v2_messageId_Message_v2_id_fk"
		}),
		voteV2ChatIdMessageIdPk: primaryKey({ columns: [table.chatId, table.messageId], name: "Vote_v2_chatId_messageId_pk"}),
	}
});

export const document = pgTable("Document", {
	id: uuid().defaultRandom().notNull(),
	createdAt: timestamp({ mode: 'string' }).notNull(),
	title: text().notNull(),
	content: text(),
	userId: uuid().notNull(),
	text: varchar().default('text').notNull(),
},
(table) => {
	return {
		documentUserIdUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "Document_userId_User_id_fk"
		}),
		documentIdCreatedAtPk: primaryKey({ columns: [table.id, table.createdAt], name: "Document_id_createdAt_pk"}),
	}
});