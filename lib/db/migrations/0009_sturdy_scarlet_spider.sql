CREATE INDEX IF NOT EXISTS "chat_user_id_idx" ON "Chat" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_created_at_idx" ON "Chat" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_visibility_idx" ON "Chat" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_user_visibility_idx" ON "Chat" USING btree ("userId","visibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_document_id_idx" ON "DocumentChunk" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_index_idx" ON "DocumentChunk" USING btree ("chunkIndex");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_doc_chunk_idx" ON "DocumentChunk" USING btree ("documentId","chunkIndex");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_content_document_id_idx" ON "DocumentContent" USING btree ("documentId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_embedding_chunk_id_idx" ON "DocumentEmbedding" USING btree ("chunkId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_model_idx" ON "DocumentEmbedding" USING btree ("model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_chat_id_idx" ON "Message_v2" USING btree ("chatId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_role_idx" ON "Message_v2" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_created_at_idx" ON "Message_v2" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_chat_created_idx" ON "Message_v2" USING btree ("chatId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_document_status_idx" ON "RAGDocument" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_document_uploaded_by_idx" ON "RAGDocument" USING btree ("uploadedBy");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_document_created_at_idx" ON "RAGDocument" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_document_user_status_idx" ON "RAGDocument" USING btree ("uploadedBy","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rag_document_file_name_idx" ON "RAGDocument" USING btree ("fileName");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "Session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_idx" ON "Session" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_expires_at_idx" ON "Session" USING btree ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_idx" ON "User" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_type_idx" ON "User" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_created_at_idx" ON "User" USING btree ("createdAt");