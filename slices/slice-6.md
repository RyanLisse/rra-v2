Okay, we've made great progress! The RAG pipeline is functional, and users can see source citations. Now, let's address a critical architectural piece from the PRD: making our document processing pipeline more robust and scalable using **Inngest workflows**.

Currently, text extraction and embedding generation happen in direct API calls triggered by the frontend. This can lead to timeouts for large documents and doesn't offer good retry mechanisms or observability for these background tasks. Inngest will solve this.

---

### Slice 8: Refactor Document Processing into Inngest Workflows

**What You're Building:**
*   Integrating Inngest into the project.
*   Defining Inngest functions for the existing document processing steps: text extraction, and chunking/embedding.
*   Modifying the document upload API to trigger an Inngest workflow instead of performing processing inline.
*   Ensuring document statuses in the database are updated by the Inngest functions.
*   (Optional but recommended) A simple API endpoint for the frontend to query the processing status of a document.

**Tasks:**

1.  **Setup Inngest** - Complexity: 3
    *   [ ] Sign up for a free Inngest Cloud account ([https://www.inngest.com/](https://www.inngest.com/)) or set up the Inngest Dev Server for local development (often preferred for initial dev). The Dev Server runs as a Docker container or a local binary.
    *   [ ] Install Inngest SDK: `bun add inngest @inngest/next`.
    *   [ ] Create `app/api/inngest/route.ts`. This is the HTTP handler that Inngest uses to communicate with your functions.
        ```typescript
        // app/api/inngest/route.ts
        import { serve } from 'inngest/next';
        import { inngest } from '@/lib/inngest/client';
        // Import all your Inngest functions here
        import { extractTextFn, generateEmbeddingsFn } from '@/lib/inngest/functions/document-processing';

        export const { GET, POST, PUT } = serve({
          client: inngest,
          functions: [
            extractTextFn,
            generateEmbeddingsFn,
            // Add other functions as you create them
          ],
        });
        ```
    *   [ ] Create `lib/inngest/client.ts` to initialize the Inngest client.
        ```typescript
        // lib/inngest/client.ts
        import { Inngest } from 'inngest';

        // Create a client to send and receive events
        export const inngest = new Inngest({ id: 'rag-chat-app' });
        // For Inngest Cloud, you'd also configure INNGEST_SIGNING_KEY and INNGEST_EVENT_KEY
        // in your environment variables. For local dev server, this is often not needed.
        ```
    *   [ ] Add Inngest related environment variables to `.env.local` if using Inngest Cloud (e.g., `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`). For the local dev server, you might only need `INNGEST_DEV=true`.
    *   [ ] Update `.gitignore` to include `.inngest` if you run the dev server with local storage.
2.  **Define Inngest Event Payloads (Types)** - Complexity: 1
    *   [ ] In a new file, e.g., `lib/inngest/types.ts` (or `types/inngest.ts`):
        ```typescript
        // lib/inngest/types.ts
        export type DocumentUploadedPayload = {
          documentId: string;
          filePath: string; // Path to the original PDF
          originalName: string;
        };

        export type DocumentTextExtractedPayload = {
          documentId: string;
          textFilePath: string; // Path to the extracted .txt file
          numPages: number;
        };

        export type DocumentProcessingFailedPayload = {
          documentId: string;
          step: 'text_extraction' | 'embedding_generation';
          error: string;
          originalEventData?: any;
        };
        ```
3.  **Create Inngest Function for Text Extraction** - Complexity: 3
    *   [ ] Create `lib/inngest/functions/document-processing.ts`.
    *   [ ] Define an Inngest function `extractTextFn` triggered by a new event name, e.g., `event/document.uploaded`.
    *   [ ] Move the core logic from the existing `/api/documents/extract-text/route.ts` into this Inngest function.
        *   It will receive `event.data` of type `DocumentUploadedPayload`.
        *   It should update the `documents.status` to "processing_text" at the start and "text_extracted" on success, or "error_text_extraction" on failure.
        *   On success, it will send a new event, e.g., `event/document.text.extracted`, with `DocumentTextExtractedPayload`.
        *   On failure, it can send an `event/document.processing.failed` event.
4.  **Create Inngest Function for Chunking & Embedding** - Complexity: 3
    *   [ ] In `lib/inngest/functions/document-processing.ts`, define `generateEmbeddingsFn` triggered by `event/document.text.extracted`.
    *   [ ] Move the core logic from `/api/documents/process-embeddings/route.ts` here.
        *   It receives `event.data` of type `DocumentTextExtractedPayload`.
        *   Updates `documents.status` to "processing_embeddings", then "processed_embeddings" or "error_embedding".
        *   On failure, it can send an `event/document.processing.failed` event.
5.  **Modify Upload API to Trigger Inngest Workflow** - Complexity: 2
    *   [ ] In `/api/documents/upload/route.ts`:
        *   After successfully saving the PDF and creating the initial `documents` DB record (status "uploaded"):
            *   Use the `inngest` client to `send` an `event/document.uploaded` event.
            *   Payload: `{ documentId: newDocument.id, filePath: filePath, originalName: file.name }`.
        *   The API should now respond much faster to the client, simply acknowledging the upload.
    *   [ ] **Important:** Remove the frontend's sequential calls to `/api/documents/extract-text` and `/api/documents/process-embeddings` from `components/file-uploader.tsx`. The UI will now just show "Upload successful, processing initiated."
6.  **Implement Document Status API (Optional but Recommended)** - Complexity: 2
    *   [ ] Create `app/api/documents/[documentId]/status/route.ts`.
    *   [ ] Implement a `GET` handler that takes `documentId` from the path.
    *   [ ] Query the `documents` table for the given `documentId` and return its `status`, `fileName`, and `updatedAt`.
    *   [ ] The frontend can use this to display a list of uploaded documents and their current processing states (e.g., by polling or on demand).
7.  **Testing with Inngest Dev Server** - Complexity: 2
    *   [ ] Run the Inngest Dev Server: `npx inngest-cli dev -u http://localhost:3000/api/inngest` (or your app's URL).
    *   [ ] Upload a document through your UI.
    *   [ ] Observe the events and function executions in the Inngest Dev Server dashboard (usually `http://localhost:8288`).
    *   [ ] Check your database for status updates on the `documents` table.
8.  **Write Tests**
    *   [ ] **Inngest Functions:** Focus on unit testing the internal logic of each step within your Inngest functions (mocking `fs`, DB calls, Cohere API). Inngest's SDK might offer utilities for testing function handlers. - Complexity: 3
    *   [ ] **Upload API:** Test that it correctly sends the initial event to Inngest. - Complexity: 1

**Code Example (`lib/inngest/client.ts` already shown)**

**Code Example (`lib/inngest/functions/document-processing.ts`):**
```typescript
// lib/inngest/functions/document-processing.ts
import { inngest } from '../client';
import { db } from '@/lib/db';
import { documents as documentsTable, documentContents as documentContentsTable, //... other tables
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import pdf from 'pdf-parse';
import { simpleRecursiveChunker, Chunk as TextChunk } from '@/lib/text-processing';
import { embedMany } from 'ai';
import { cohere } from '@ai-sdk/cohere';
import { DocumentUploadedPayload, DocumentTextExtractedPayload, DocumentProcessingFailedPayload } from '../types';

const COHERE_EMBEDDING_MODEL = "embed-v4.0";
const COHERE_EMBEDDING_DIMENSIONS = 1024;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

// Event Names
const EVENT_DOCUMENT_UPLOADED = 'event/document.uploaded';
const EVENT_DOCUMENT_TEXT_EXTRACTED = 'event/document.text.extracted';
const EVENT_DOCUMENT_PROCESSING_FAILED = 'event/document.processing.failed';

export const extractTextFn = inngest.createFunction(
  { id: 'extract-text-from-pdf', name: 'Extract Text from PDF' },
  { event: EVENT_DOCUMENT_UPLOADED },
  async ({ event, step }) => {
    const { documentId, filePath, originalName } = event.data as DocumentUploadedPayload;

    await step.run('update-status-processing-text', async () => {
      await db.update(documentsTable).set({ status: 'processing_text', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
    });

    try {
      const fileBuffer = await step.run('read-pdf-file', () => fs.readFile(filePath));
      const data = await step.run('parse-pdf-content', () => pdf(fileBuffer));

      const textFilePath = filePath.replace(/\.pdf$/i, `_${documentId.substring(0,8)}.txt`); // Add part of docId for uniqueness
      await step.run('save-extracted-text', () => fs.writeFile(textFilePath, data.text));

      await step.run('update-db-after-extraction', async () => {
        await db.transaction(async (tx) => {
          await tx.insert(documentContentsTable).values({
            documentId: documentId,
            textFilePath: textFilePath,
            pageCount: data.numpages,
            charCount: data.text.length,
          });
          await tx.update(documentsTable).set({ status: 'text_extracted', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
        });
      });

      // Send event for next step
      await step.sendEvent('send-text-extracted-event', {
        name: EVENT_DOCUMENT_TEXT_EXTRACTED,
        data: { documentId, textFilePath, numPages: data.numpages } as DocumentTextExtractedPayload,
      });

      return { success: true, message: `Text extracted for ${originalName}`, textFilePath, numPages: data.numpages };
    } catch (error: any) {
      console.error(`Error in extractTextFn for document ${documentId}:`, error);
      await step.run('update-status-extraction-error', async () => {
        await db.update(documentsTable).set({ status: 'error_text_extraction', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
      });
      await step.sendEvent('send-processing-failed-event', {
        name: EVENT_DOCUMENT_PROCESSING_FAILED,
        data: { documentId, step: 'text_extraction', error: error.message, originalEventData: event.data } as DocumentProcessingFailedPayload,
      });
      throw error; // Inngest will handle retry based on function config
    }
  }
);

export const generateEmbeddingsFn = inngest.createFunction(
  { id: 'generate-document-embeddings', name: 'Generate Document Embeddings' },
  { event: EVENT_DOCUMENT_TEXT_EXTRACTED },
  async ({ event, step }) => {
    const { documentId, textFilePath } = event.data as DocumentTextExtractedPayload;

    await step.run('update-status-processing-embeddings', async () => {
      await db.update(documentsTable).set({ status: 'processing_embeddings', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
    });

    try {
      const text = await step.run('read-extracted-text-file', () => fs.readFile(textFilePath, 'utf-8'));
      const textChunks: TextChunk[] = await step.run('chunk-text-content', () => simpleRecursiveChunker(text, CHUNK_SIZE, CHUNK_OVERLAP));

      if (textChunks.length === 0) {
        throw new Error('No text chunks generated.');
      }

      const chunkContents = textChunks.map(chunk => chunk.content);
      const { embeddings } = await step.run('generate-cohere-embeddings', () =>
        embedMany({
          model: cohere.embedding(COHERE_EMBEDDING_MODEL, { dimensions: COHERE_EMBEDDING_DIMENSIONS }),
          values: chunkContents,
        })
      );

      if (!embeddings || embeddings.length !== textChunks.length) {
        throw new Error('Failed to generate embeddings or mismatch in count.');
      }

      await step.run('store-chunks-and-embeddings', async () => {
        // (Logic from Slice 5's API to store chunks and embeddings in DB transaction)
        // ... ensure you import documentChunksTable, documentEmbeddingsTable ...
        await db.transaction(async (tx) => {
            for (let i = 0; i < textChunks.length; i++) {
                const chunkData = textChunks[i];
                const embeddingVector = embeddings[i];
                const [newChunk] = await tx.insert(documentChunksTable).values({ /* ... */ }).returning({id: documentChunksTable.id});
                await tx.insert(documentEmbeddingsTable).values({ chunkId: newChunk.id, embedding: embeddingVector, /* ... */ });
            }
            await tx.update(documentsTable).set({ status: 'processed_embeddings', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
        });
      });

      return { success: true, message: `Embeddings generated for document ${documentId}`, chunkCount: textChunks.length };
    } catch (error: any) {
      console.error(`Error in generateEmbeddingsFn for document ${documentId}:`, error);
      await step.run('update-status-embedding-error', async () => {
        await db.update(documentsTable).set({ status: 'error_embedding', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
      });
      await step.sendEvent('send-processing-failed-event', {
        name: EVENT_DOCUMENT_PROCESSING_FAILED,
        data: { documentId, step: 'embedding_generation', error: error.message, originalEventData: event.data } as DocumentProcessingFailedPayload,
      });
      throw error;
    }
  }
);
// Remember to import and add these functions to app/api/inngest/route.ts
```

**Code Example (`/api/documents/upload/route.ts` modification):**
```typescript
// app/api/documents/upload/route.ts
// ... (existing imports)
import { inngest } from '@/lib/inngest/client';
import { DocumentUploadedPayload } from '@/lib/inngest/types';

// ...
// Inside the POST handler, after file is saved and initial DB record created:
// const [newDocument] = await db.insert(documentsTable).values({ ... }).returning();

await inngest.send({
  name: 'event/document.uploaded', // Match the event name for extractTextFn
  data: {
    documentId: newDocument.id,
    filePath: filePath, // Path to the saved PDF
    originalName: file.name,
  } as DocumentUploadedPayload,
});

// Adjust response to client
return NextResponse.json({
  message: `${savedFileObjects.length} file(s) acknowledged. Processing initiated.`,
  files: savedFileObjects.map(f => ({ documentId: f.documentId, originalName: f.originalName })),
}, { status: 200 });
// ...
```

**Code Example (`app/api/documents/[documentId]/status/route.ts`):**
```typescript
// app/api/documents/[documentId]/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { documents as documentsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const documentId = params.documentId;

  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    const doc = await db.query.documents.findFirst({
      where: eq(documentsTable.id, documentId),
      columns: {
        id: true,
        originalName: true,
        status: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return NextResponse.json(doc, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching document status:", error);
    return NextResponse.json({ error: 'Failed to fetch document status', details: error.message }, { status: 500 });
  }
}
```

**Frontend Update (`components/file-uploader.tsx`):**
*   The `handleUpload` function will no longer make sequential API calls for text extraction and embedding.
*   It will just make the initial upload call.
*   You might want to add UI to display a list of uploaded documents and poll the new `/api/documents/[documentId]/status` endpoint to show their processing progress.

**Ready to Merge Checklist:**
*   [ ] Inngest client and API route (`/api/inngest`) configured and working with local dev server or Inngest Cloud.
*   [ ] Inngest functions for text extraction and embedding generation implemented, moving logic from old API routes.
*   [ ] Document upload API (`/api/documents/upload`) successfully triggers the `event/document.uploaded` Inngest event.
*   [ ] Inngest functions correctly update document status in the database at each step (start, success, failure).
*   [ ] (If implemented) Document status API (`/api/documents/[documentId]/status`) returns correct status.
*   [ ] Frontend no longer calls old processing APIs directly after upload.
*   [ ] Tested end-to-end: Upload PDF -> Inngest workflow runs -> Document is processed -> Database reflects final status.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **Inngest Next.js Quickstart:** [https://www.inngest.com/docs/quickstarts/nextjs](https://www.inngest.com/docs/quickstarts/nextjs)
*   **Inngest `step.run` and `step.sendEvent`:** [https://www.inngest.com/docs/functions/multi-step-functions](https://www.inngest.com/docs/functions/multi-step-functions)
*   **Inngest Dev Server:** [https://www.inngest.com/docs/developing/dev-server](https://www.inngest.com/docs/developing/dev-server)
*   **Error Handling & Retries in Inngest:** [https://www.inngest.com/docs/functions/error-handling](https://www.inngest.com/docs/functions/error-handling)

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm refactoring a multi-step background process (PDF parsing, API calls, DB updates) into Inngest functions. Explain best practices for idempotency in Inngest steps, how to manage state between steps (using event payloads), and how to configure retries and error handling for each step. Show an example of a two-step Inngest workflow."*

**Questions for Senior Dev:**
*   [ ] What are appropriate retry policies for the Cohere API calls and other potentially fallible steps within the Inngest functions?
*   [ ] For the `filePath` and `textFilePath` passed between Inngest events/steps: these are paths on the server's local filesystem. Is this okay, or should we be moving files to a shared object storage (like S3/R2) early on if our app might scale beyond a single server instance? (PRD mentions "Object Storage" - this slice keeps it local for now, but it's a good point for future scaling).
*   [ ] How should the frontend be notified of processing completion or failure? (Polling the status API is one way; WebSockets or Inngest's own webhook capabilities could be alternatives for real-time updates later).

---

This slice significantly improves the robustness and scalability of your document processing pipeline. It's a major architectural enhancement aligning with the PRD's goals. Next, we can look into multimodal document processing or further enhancing the chat interface.