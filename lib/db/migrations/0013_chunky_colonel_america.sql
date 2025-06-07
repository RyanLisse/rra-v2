ALTER TABLE "DocumentChunk" ADD COLUMN "element_type" text;--> statement-breakpoint
ALTER TABLE "DocumentChunk" ADD COLUMN "page_number" integer;--> statement-breakpoint
ALTER TABLE "DocumentChunk" ADD COLUMN "bbox" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_element_type_idx" ON "DocumentChunk" USING btree ("element_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_page_number_idx" ON "DocumentChunk" USING btree ("page_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_chunk_doc_page_idx" ON "DocumentChunk" USING btree ("documentId","page_number");