CREATE TABLE IF NOT EXISTS "DocumentChunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"chunkIndex" text NOT NULL,
	"content" text NOT NULL,
	"metadata" json,
	"tokenCount" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "DocumentContent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"textFilePath" text,
	"extractedText" text,
	"pageCount" text,
	"charCount" text,
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "DocumentEmbedding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunkId" uuid NOT NULL,
	"embedding" text NOT NULL,
	"model" text DEFAULT 'cohere-embed-v4.0' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RAGDocument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fileName" text NOT NULL,
	"originalName" text NOT NULL,
	"filePath" text NOT NULL,
	"mimeType" text NOT NULL,
	"fileSize" text NOT NULL,
	"status" varchar DEFAULT 'uploaded' NOT NULL,
	"uploadedBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_RAGDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."RAGDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentContent" ADD CONSTRAINT "DocumentContent_documentId_RAGDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."RAGDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "DocumentEmbedding" ADD CONSTRAINT "DocumentEmbedding_chunkId_DocumentChunk_id_fk" FOREIGN KEY ("chunkId") REFERENCES "public"."DocumentChunk"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RAGDocument" ADD CONSTRAINT "RAGDocument_uploadedBy_User_id_fk" FOREIGN KEY ("uploadedBy") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
