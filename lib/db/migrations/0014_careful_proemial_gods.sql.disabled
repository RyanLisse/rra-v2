ALTER TABLE "DocumentEmbedding" DROP CONSTRAINT IF EXISTS "DocumentEmbedding_imageId_DocumentImage_id_fk";
--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" DROP CONSTRAINT IF EXISTS "DocumentEmbedding_documentId_RAGDocument_id_fk";
--> statement-breakpoint
DROP TABLE IF EXISTS "DocumentImage";--> statement-breakpoint
DROP INDEX IF EXISTS "document_chunk_ade_element_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_chunk_confidence_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_document_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_image_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_doc_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_chunk_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_image_type_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_chunk_id_idx";--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" ALTER COLUMN "chunkId" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_embedding_chunk_id_idx" ON "DocumentEmbedding" USING btree ("chunkId");--> statement-breakpoint
ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS "confidence";--> statement-breakpoint
ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS "ade_element_id";--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" DROP COLUMN IF EXISTS "documentId";--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" DROP COLUMN IF EXISTS "imageId";--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" DROP COLUMN IF EXISTS "embeddingType";--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" DROP COLUMN IF EXISTS "dimensions";