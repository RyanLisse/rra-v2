CREATE TABLE IF NOT EXISTS "DocumentImage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"pageNumber" integer NOT NULL,
	"imagePath" text NOT NULL,
	"imageUrl" text,
	"width" integer,
	"height" integer,
	"fileSize" integer,
	"mimeType" text DEFAULT 'image/png' NOT NULL,
	"extractedBy" varchar DEFAULT 'pdf_conversion' NOT NULL,
	"extractionMetadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "document_embedding_chunk_id_idx";--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" ALTER COLUMN "chunkId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "DocumentChunk" ADD COLUMN "confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "DocumentChunk" ADD COLUMN "ade_element_id" text;--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" ADD COLUMN "documentId" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" ADD COLUMN "imageId" uuid;--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" ADD COLUMN "embeddingType" varchar DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "DocumentEmbedding" ADD COLUMN "dimensions" integer DEFAULT 1024 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentImage" ADD CONSTRAINT "DocumentImage_documentId_RAGDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."RAGDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_image_document_id_idx" ON "DocumentImage" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_image_page_number_idx" ON "DocumentImage" USING btree ("pageNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_image_doc_page_idx" ON "DocumentImage" USING btree ("documentId","pageNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_image_extracted_by_idx" ON "DocumentImage" USING btree ("extractedBy");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_image_created_at_idx" ON "DocumentImage" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_image_doc_page_unique_idx" ON "DocumentImage" USING btree ("documentId","pageNumber","extractedBy");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentEmbedding" ADD CONSTRAINT "DocumentEmbedding_documentId_RAGDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."RAGDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentEmbedding" ADD CONSTRAINT "DocumentEmbedding_imageId_DocumentImage_id_fk" FOREIGN KEY ("imageId") REFERENCES "public"."DocumentImage"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_ade_element_id_idx" ON "DocumentChunk" USING btree ("ade_element_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_confidence_idx" ON "DocumentChunk" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_document_id_idx" ON "DocumentEmbedding" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_image_id_idx" ON "DocumentEmbedding" USING btree ("imageId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_type_idx" ON "DocumentEmbedding" USING btree ("embeddingType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_created_at_idx" ON "DocumentEmbedding" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_doc_type_idx" ON "DocumentEmbedding" USING btree ("documentId","embeddingType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_chunk_type_idx" ON "DocumentEmbedding" USING btree ("chunkId","embeddingType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_image_type_idx" ON "DocumentEmbedding" USING btree ("imageId","embeddingType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_embedding_chunk_id_idx" ON "DocumentEmbedding" USING btree ("chunkId");