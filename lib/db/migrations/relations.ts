import { relations } from "drizzle-orm/relations";
import { chatSessions, chatMessages, user, suggestion, document, chat, message, messageV2, stream, account, session, documentChunks, documentImages, documents, ragDocument, documentContent, rateLimitLog, documentChunk, documentEmbedding, documentImage, vote, voteV2 } from "./schema";

export const chatMessagesRelations = relations(chatMessages, ({one}) => ({
	chatSession: one(chatSessions, {
		fields: [chatMessages.sessionId],
		references: [chatSessions.id]
	}),
}));

export const chatSessionsRelations = relations(chatSessions, ({many}) => ({
	chatMessages: many(chatMessages),
	documents: many(documents),
}));

export const suggestionRelations = relations(suggestion, ({one}) => ({
	user: one(user, {
		fields: [suggestion.userId],
		references: [user.id]
	}),
	document: one(document, {
		fields: [suggestion.documentId],
		references: [document.createdAt]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	suggestions: many(suggestion),
	chats: many(chat),
	accounts: many(account),
	sessions: many(session),
	ragDocuments: many(ragDocument),
	rateLimitLogs: many(rateLimitLog),
	documents: many(document),
}));

export const documentRelations = relations(document, ({one, many}) => ({
	suggestions: many(suggestion),
	user: one(user, {
		fields: [document.userId],
		references: [user.id]
	}),
}));

export const messageRelations = relations(message, ({one, many}) => ({
	chat: one(chat, {
		fields: [message.chatId],
		references: [chat.id]
	}),
	votes: many(vote),
}));

export const chatRelations = relations(chat, ({one, many}) => ({
	messages: many(message),
	user: one(user, {
		fields: [chat.userId],
		references: [user.id]
	}),
	messageV2s: many(messageV2),
	streams: many(stream),
	votes: many(vote),
	voteV2s: many(voteV2),
}));

export const messageV2Relations = relations(messageV2, ({one, many}) => ({
	chat: one(chat, {
		fields: [messageV2.chatId],
		references: [chat.id]
	}),
	voteV2s: many(voteV2),
}));

export const streamRelations = relations(stream, ({one}) => ({
	chat: one(chat, {
		fields: [stream.chatId],
		references: [chat.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const documentImagesRelations = relations(documentImages, ({one}) => ({
	documentChunk: one(documentChunks, {
		fields: [documentImages.chunkId],
		references: [documentChunks.id]
	}),
}));

export const documentChunksRelations = relations(documentChunks, ({one, many}) => ({
	documentImages: many(documentImages),
	document: one(documents, {
		fields: [documentChunks.documentId],
		references: [documents.id]
	}),
}));

export const documentsRelations = relations(documents, ({one, many}) => ({
	documentChunks: many(documentChunks),
	chatSession: one(chatSessions, {
		fields: [documents.sessionId],
		references: [chatSessions.id]
	}),
}));

export const ragDocumentRelations = relations(ragDocument, ({one, many}) => ({
	user: one(user, {
		fields: [ragDocument.uploadedBy],
		references: [user.id]
	}),
	documentContents: many(documentContent),
	documentChunks: many(documentChunk),
	documentEmbeddings: many(documentEmbedding),
	documentImages: many(documentImage),
}));

export const documentContentRelations = relations(documentContent, ({one}) => ({
	ragDocument: one(ragDocument, {
		fields: [documentContent.documentId],
		references: [ragDocument.id]
	}),
}));

export const rateLimitLogRelations = relations(rateLimitLog, ({one}) => ({
	user: one(user, {
		fields: [rateLimitLog.userId],
		references: [user.id]
	}),
}));

export const documentChunkRelations = relations(documentChunk, ({one, many}) => ({
	ragDocument: one(ragDocument, {
		fields: [documentChunk.documentId],
		references: [ragDocument.id]
	}),
	documentEmbeddings: many(documentEmbedding),
}));

export const documentEmbeddingRelations = relations(documentEmbedding, ({one}) => ({
	documentChunk: one(documentChunk, {
		fields: [documentEmbedding.chunkId],
		references: [documentChunk.id]
	}),
	ragDocument: one(ragDocument, {
		fields: [documentEmbedding.documentId],
		references: [ragDocument.id]
	}),
	documentImage: one(documentImage, {
		fields: [documentEmbedding.imageId],
		references: [documentImage.id]
	}),
}));

export const documentImageRelations = relations(documentImage, ({one, many}) => ({
	documentEmbeddings: many(documentEmbedding),
	ragDocument: one(ragDocument, {
		fields: [documentImage.documentId],
		references: [ragDocument.id]
	}),
}));

export const voteRelations = relations(vote, ({one}) => ({
	chat: one(chat, {
		fields: [vote.chatId],
		references: [chat.id]
	}),
	message: one(message, {
		fields: [vote.messageId],
		references: [message.id]
	}),
}));

export const voteV2Relations = relations(voteV2, ({one}) => ({
	chat: one(chat, {
		fields: [voteV2.chatId],
		references: [chat.id]
	}),
	messageV2: one(messageV2, {
		fields: [voteV2.messageId],
		references: [messageV2.id]
	}),
}));