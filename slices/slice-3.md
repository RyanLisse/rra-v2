Okay, we have our documents tracked in the database, and their raw text extracted. The next critical step in building our RAG pipeline is to process this text into a format suitable for semantic search: **chunking** it and then generating **embeddings** for these chunks.

This slice will focus on:
1.  Defining new database tables for chunks and their embeddings.
2.  Implementing a text chunking strategy.
3.  Using the Cohere `embed-v4.0` model (via the `@ai-sdk/cohere` package) to generate embeddings for these chunks.
4.  Storing the chunks and their embeddings in NeonDB.

This is a significant step, and for very large documents, this process can be time-consuming. For now, we'll implement it as a direct API call. Later slices will address moving this to background jobs using Inngest, as outlined in the PRD.

---

### Slice 5: Text Chunking, Embedding Generation & Storage

**What You're Building:**
*   New Drizzle ORM schemas for `document_chunks` and `document_embeddings` (with PGVector's `vector` type).
*   An API endpoint that takes a `documentId`, reads its extracted text, chunks it, generates embeddings for each chunk using Cohere, and stores this data in the new tables.
*   Updating the document status to reflect this processing.

**Tasks:**

1.  **Update Database Schema for Chunks and Embeddings** - Complexity: 3
    *   [ ] In `lib/db/schema.ts`, define two new tables:
        *   `document_chunks`: `id` (uuid, pk), `documentId` (uuid, fk to `documents.id`), `content` (text, the actual chunk), `chunkIndex` (integer, order of the chunk within the document), `charCount` (integer), `createdAt`.
        *   `document_embeddings`: `id` (uuid, pk), `chunkId` (uuid, fk to `document_chunks.id`), `embedding` (custom Drizzle type for `vector(1024)` - PRD mentions Cohere embed-v4.0 with 1024 dimensions), `modelName` (text, e.g., "embed-v4.0"), `createdAt`.
    *   **Subtask 1.1:** Define the `document_chunks` table schema. - Complexity: 1
    *   **Subtask 1.2:** Define the `document_embeddings` table schema, including how to represent the `vector(1024)` type with Drizzle. This often involves using `customType` from Drizzle. - Complexity: 2
        ```typescript
        // Example for vector type in lib/db/schema.ts
        import { customType } from 'drizzle-orm/pg-core';
        const vector = customType<{ data: number[]; driverData: string }>({
          dataType() {
            return 'vector(1024)'; // Or your chosen dimension
          },
          toDriver(value: number[]): string {
            return `[${value.join(',')}]`;
          },
          fromDriver(value: string): number[] {
            // Assuming value is like '[0.1,0.2,...]'
            return JSON.parse(value);
          },
        });
        // ... in document_embeddings table:
        // embedding: vector('embedding').notNull(),
        ```
    *   [ ] Update relations if necessary.
2.  **Generate and Run New Migration** - Complexity: 1
    *   [ ] Generate the migration: `bun run db:generate`.
    *   [ ] Apply the migration: `bun run db:migrate`. Verify new tables and the `vector` column type in NeonDB.
3.  **Install AI SDK for Cohere** - Complexity: 1
    *   [ ] Install the necessary packages: `bun add ai @ai-sdk/cohere`.
    *   [ ] Ensure your Cohere API key is in `.env.local`: `COHERE_API_KEY="your_cohere_api_key"`.
4.  **Implement Text Chunking Logic** - Complexity: 3
    *   [ ] Create a new utility function, e.g., in `lib/text-processing.ts`.
    *   [ ] Implement a basic recursive character text splitter or a fixed-size chunker with overlap.
        *   Parameters: `text` (string), `chunkSize` (e.g., 1000 characters as a start, PRD mentions 1024 tokens for Embed 4.0), `chunkOverlap` (e.g., 100-200 characters).
    *   [ ] This function should return an array of strings (the chunks).
    *   **Subtask 4.1:** Design the chunking function signature and basic structure. - Complexity: 1
    *   **Subtask 4.2:** Implement the core splitting logic (e.g., splitting by sentences first, then recursively if too long, or a simpler sliding window). - Complexity: 2
5.  **Create API Route for Chunking & Embedding** - Complexity: 4
    *   [ ] Create `app/api/documents/process-embeddings/route.ts`.
    *   [ ] Implement a `POST` handler that expects a `documentId`.
    *   **Subtask 5.1:** API route setup, fetch `documentId`, and retrieve `textFilePath` from `document_contents` table. Read the text file. - Complexity: 2
    *   **Subtask 5.2:** Use the chunking utility to split the text into chunks. - Complexity: 1
    *   **Subtask 5.3:** For the array of text chunks, use `embedMany` from the `ai` SDK with `cohere.embedding("embed-v4.0", { dimensions: 1024 })` to get all embeddings. Handle batching if necessary (though `embedMany` should handle some of this). - Complexity: 2
    *   **Subtask 5.4:** In a database transaction:
        *   Iterate through the chunks and their corresponding embeddings.
        *   For each chunk, insert a record into `document_chunks`.
        *   Get the `id` of the newly inserted chunk.
        *   Insert a record into `document_embeddings` with the `chunkId` and the embedding vector.
        *   Update the `documents` table status to "processing_complete" or "embedded". - Complexity: 3
6.  **Update Frontend (Trigger Processing)** - Complexity: 2
    *   [ ] In `components/file-uploader.tsx`, after successful text extraction for a document, make a new API call to `POST /api/documents/process-embeddings` with the `documentId`.
    *   [ ] Update UI to show status like "Generating embeddings for document...", "Embeddings complete!".
7.  **Error Handling** - Complexity: 2
    *   [ ] Robust error handling in the API for file reading, chunking, Cohere API errors, and database errors.
    *   [ ] Update document status to an error state if any part fails (e.g., "error_embedding").
8.  **Write Tests** - Complexity: 3
    *   [ ] **Unit Tests:** Test the chunking logic thoroughly with various inputs.
    *   [ ] **Backend API:** Mock Cohere API calls and DB interactions. Test the overall flow of reading text, chunking, "embedding" (mocked), and DB storage. Test error states.

**Code Example (`lib/db/schema.ts` additions):**
```typescript
// lib/db/schema.ts
// ... (existing imports and tables)
import { pgTable, uuid, text, timestamp, integer, primaryKey, customType } from 'drizzle-orm/pg-core';

// Custom type for PGVector (ensure your NeonDB has vector extension enabled)
// And you've run `CREATE EXTENSION IF NOT EXISTS vector;`
const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1024)'; // Match Cohere embed-v4.0 dimensions (e.g., 1024)
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // This might need adjustment based on how pgvector returns it via the node-postgres driver
    // It might already be an array, or a string like '{0.1,0.2,...}' or '[0.1,0.2,...]'
    // For now, assuming a stringified array that JSON.parse can handle.
    // If it's {0.1,0.2,...}, you'd need a more robust parser.
    try {
        if (value.startsWith('{') && value.endsWith('}')) {
            // Handle {0.1,0.2,...} format
            return value.substring(1, value.length - 1).split(',').map(Number);
        }
        return JSON.parse(value); // Assumes '[0.1,0.2,...]'
    } catch (e) {
        console.error("Failed to parse vector from DB:", value, e);
        return [];
    }
  },
});

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  charCount: integer('char_count').notNull(),
  // metadata: jsonb('metadata'), // For later, e.g., page numbers
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentEmbeddings = pgTable('document_embeddings', {
  id: uuid('id').defaultRandom().primaryKey(),
  chunkId: uuid('chunk_id').notNull().references(() => documentChunks.id, { onDelete: 'cascade' }),
  embedding: vectorType('embedding').notNull(),
  modelName: text('model_name').notNull().default('embed-v4.0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Update relations
export const documentsRelations = relations(documents, ({ one, many }) => ({ // Changed
  content: one(documentContents, { // This was for the extracted text file info
    fields: [documents.id],
    references: [documentContents.documentId],
  }),
  chunks: many(documentChunks), // New relation
}));

export const documentChunksRelations = relations(documentChunks, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
  embedding: one(documentEmbeddings, { // A chunk has one embedding record
    fields: [documentChunks.id],
    references: [documentEmbeddings.chunkId],
  })
}));

export const documentEmbeddingsRelations = relations(documentEmbeddings, ({ one }) => ({
  chunk: one(documentChunks, {
    fields: [documentEmbeddings.chunkId],
    references: [documentChunks.id],
  }),
}));


// Add new tables and relations to the default export
export default {
    documents,
    documentContents,
    documentChunks, // New
    documentEmbeddings, // New
    documentsRelations,
    documentContentsRelations,
    documentChunksRelations, // New
    documentEmbeddingsRelations // New
};
```

**Code Example (`lib/text-processing.ts` - Basic Chunker):**
```typescript
// lib/text-processing.ts
export interface Chunk {
  content: string;
  charCount: number;
}

export function simpleRecursiveChunker(
  text: string,
  chunkSize: number, // Target size in characters
  chunkOverlap: number
): Chunk[] {
  if (text.length <= chunkSize) {
    return [{ content: text, charCount: text.length }];
  }

  const chunks: Chunk[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunkContent = text.substring(startIndex, endIndex);
    chunks.push({ content: chunkContent, charCount: chunkContent.length });

    if (endIndex === text.length) {
      break; // Last chunk
    }
    startIndex += chunkSize - chunkOverlap;
    if (startIndex >= text.length) break; // Avoid tiny overlaps at the very end
  }
  return chunks;
}
```

**Code Example (`app/api/documents/process-embeddings/route.ts` - Simplified):**
```typescript
// app/api/documents/process-embeddings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  documents as documentsTable,
  documentContents as documentContentsTable,
  documentChunks as documentChunksTable,
  documentEmbeddings as documentEmbeddingsTable
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import { simpleRecursiveChunker, Chunk as TextChunk } from '@/lib/text-processing'; // Your chunker
import { embedMany } from 'ai';
import { cohere } from '@ai-sdk/cohere';

const COHERE_EMBEDDING_MODEL = "embed-v4.0";
const COHERE_EMBEDDING_DIMENSIONS = 1024; // As per PRD & schema
const CHUNK_SIZE = 1000; // Characters, adjust as needed
const CHUNK_OVERLAP = 150; // Characters

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    // 1. Fetch document and its extracted text path
    const docContentRecord = await db.query.documentContents.findFirst({
      where: eq(documentContentsTable.documentId, documentId),
      with: { document: true } // To get original document info
    });

    if (!docContentRecord || !docContentRecord.textFilePath || !docContentRecord.document) {
      await db.update(documentsTable).set({ status: 'error_missing_content', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
      return NextResponse.json({ error: 'Document content or text file path not found' }, { status: 404 });
    }

    const text = await fs.readFile(docContentRecord.textFilePath, 'utf-8');

    // 2. Chunk the text
    const textChunks: TextChunk[] = simpleRecursiveChunker(text, CHUNK_SIZE, CHUNK_OVERLAP);
    if (textChunks.length === 0) {
      await db.update(documentsTable).set({ status: 'error_no_chunks', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
      return NextResponse.json({ error: 'No text chunks generated from document' }, { status: 400 });
    }

    // 3. Generate embeddings
    // Prepare texts for Cohere API (array of strings)
    const chunkContents = textChunks.map(chunk => chunk.content);

    const { embeddings } = await embedMany({
      model: cohere.embedding(COHERE_EMBEDDING_MODEL, { dimensions: COHERE_EMBEDDING_DIMENSIONS }),
      values: chunkContents,
      // maxRetries: 3, // From PRD, good practice
    });

    if (!embeddings || embeddings.length !== textChunks.length) {
      await db.update(documentsTable).set({ status: 'error_embedding_generation', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
      return NextResponse.json({ error: 'Failed to generate embeddings or mismatch in count' }, { status: 500 });
    }

    // 4. Store chunks and embeddings in DB transaction
    await db.transaction(async (tx) => {
      for (let i = 0; i < textChunks.length; i++) {
        const chunkData = textChunks[i];
        const embeddingVector = embeddings[i];

        const [newChunk] = await tx.insert(documentChunksTable).values({
          documentId: documentId,
          content: chunkData.content,
          chunkIndex: i,
          charCount: chunkData.charCount,
        }).returning({ id: documentChunksTable.id });

        await tx.insert(documentEmbeddingsTable).values({
          chunkId: newChunk.id,
          embedding: embeddingVector, // Drizzle custom type will handle conversion
          modelName: COHERE_EMBEDDING_MODEL,
        });
      }
      await tx.update(documentsTable)
        .set({ status: 'processed_embeddings', updatedAt: new Date() })
        .where(eq(documentsTable.id, documentId));
    });

    return NextResponse.json({
      message: `Successfully processed ${textChunks.length} chunks and embeddings for document ${documentId}`,
    }, { status: 200 });

  } catch (error: any) {
    console.error("Error processing embeddings:", error);
    const documentIdFromBody = (await req.clone().json().catch(() => ({}))).documentId; // Try to get docId for status update
    if (documentIdFromBody) {
        try {
            await db.update(documentsTable)
                .set({ status: 'error_processing_embeddings', updatedAt: new Date() })
                .where(eq(documentsTable.id, documentIdFromBody));
        } catch (dbError) {
            console.error("Failed to update document status to error_processing_embeddings:", dbError);
        }
    }
    return NextResponse.json({ error: 'Failed to process embeddings', details: error.message }, { status: 500 });
  }
}
```
**Frontend Update `components/file-uploader.tsx`:**
*   The `handleUpload` (or a subsequent function called after text extraction) will now make a call to `/api/documents/process-embeddings` with the `documentId`.
*   Update UI toasts/messages to reflect "Processing embeddings...", "Embeddings complete for [filename]!".

**Ready to Merge Checklist:**
*   [ ] Database schemas for `document_chunks` and `document_embeddings` created and migrated. `vector(1024)` column type is correctly set up in NeonDB.
*   [ ] Cohere API key configured, `@ai-sdk/cohere` and `ai` packages installed.
*   [ ] Text chunking logic implemented and tested.
*   [ ] API route `/api/documents/process-embeddings` successfully:
    *   Reads extracted text.
    *   Chunks text.
    *   Generates embeddings using Cohere.
    *   Stores chunks and embeddings in their respective tables.
    *   Updates document status.
*   [ ] Frontend triggers this new processing step and updates UI accordingly.
*   [ ] Error handling is in place for API and document status updates.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: Document text is chunked, embeddings generated and stored.

**Quick Research (5-10 minutes):**
*   **Cohere Embed v4.0:** Check documentation for any specific text preparation guidelines or limits. (PRD mentions 128k token context, but individual embedding inputs might be smaller).
*   **`@ai-sdk/cohere` and `embedMany`:** Review usage examples.
*   **Drizzle ORM `customType`:** [https://orm.drizzle.team/docs/custom-types](https://orm.drizzle.team/docs/custom-types) (for the vector type).
*   **PGVector `vector` type syntax:** `vector(dimensions)`.
*   **Text Chunking Strategies:** Search for "recursive text splitter javascript" or "fixed size chunking with overlap javascript" for more advanced ideas if the simple one isn't sufficient.

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm chunking text for a RAG system and generating embeddings with Cohere embed-v4.0. What are best practices for chunk size and overlap? How does the chosen embedding model's context window influence this? Explain considerations for a junior developer trying to optimize retrieval quality based on chunking."*
*   **Research Prompt:** *"How do I correctly define and use a custom `vector` type with Drizzle ORM and PGVector in NeonDB? Show an example of schema definition, data insertion, and potential issues with data type conversion between JavaScript arrays and PostgreSQL vector strings."*

**Questions for Senior Dev:**
*   [ ] Is the `simpleRecursiveChunker` adequate for now, or should we invest in a more sophisticated library/method from the start (e.g., considering sentence boundaries, token-based splitting)?
*   [ ] The PRD mentions `Cohere embed-v4.0 (multimodal)`. This slice only handles text. Is that okay for now, with multimodal coming later? (Yes, this is fine for a vertical slice focused on text first).
*   [ ] How should we handle potential rate limits or batching requirements for the Cohere `embedMany` API for very large documents with thousands of chunks? (`embedMany` should handle some internal batching, but good to confirm limits).
*   [ ] The `fromDriver` for the vector custom type might need refinement based on actual data format from `node-postgres`. What's the best way to test/verify this?

---

With this slice, we'll have the core data for our RAG system: text chunks and their vector embeddings. The next step will be to build the retrieval mechanism – taking a user query, embedding it, and finding the most similar chunks from our database.