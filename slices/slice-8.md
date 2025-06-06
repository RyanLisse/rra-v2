Okay, we've made the backend document processing much more robust with Inngest. Now, let's turn our attention to a key feature from the PRD: **Multimodal Document Processing**, specifically integrating **Landing AI Agentic Document Extraction (ADE)** and handling images within PDFs.

This slice will focus on:
1.  Converting PDF pages to images.
2.  (Conceptually) Integrating Landing AI ADE by preparing for its input/output (actual API calls to Landing AI might be mocked or simplified if direct access/setup is complex for a junior dev in one slice).
3.  Storing extracted images and associating them with document chunks.
4.  Preparing for multimodal embeddings (text + images) using Cohere `embed-v4.0`.

This is a large and potentially complex area. We'll break it down. The actual call to Landing AI ADE might be simplified to focus on the data flow and storage aspects first.

---

### Slice 9: PDF to Image Conversion & Preparing for Landing AI ADE

**What You're Building:**
*   A new Inngest step/function to convert PDF pages into images.
*   Database schema updates to store these images (`document_images`) and link them to document pages/chunks.
*   (Conceptual) Adapting the Inngest workflow to include a step for Landing AI ADE, focusing on what data it would consume and produce.
*   Storing these extracted images (e.g., locally for now, paths in DB).

**Tasks:**

1.  **Install PDF-to-Image Library** - Complexity: 1
    *   [ ] We'll use a library like `pdf-to-img` or `pdf2pic`. `pdf-to-img` is often simpler.
        *   `bun add pdf-to-img` (Check its dependencies, it might require system libraries like `ghostscript` or `poppler-utils` to be installed on the server/dev machine).
        *   **Alternative/If `pdf-to-img` has issues:** `pdf2pic` is another option, also often relying on Ghostscript.
        *   **Note for Junior Dev:** Installing system dependencies can sometimes be tricky. Ensure your development environment (and later, production) has these. If using Docker, add them to your Dockerfile.
2.  **Update Database Schema for Images** - Complexity: 2
    *   [ ] In `lib/db/schema.ts`, define a new table:
        *   `document_images`: `id` (uuid, pk), `documentId` (uuid, fk to `documents.id`), `pageNumber` (integer), `imagePath` (text, path to the saved image file), `imageUrl` (text, optional, if serving from object storage later), `width` (integer, optional), `height` (integer, optional), `extractedBy` (text, e.g., "pdf_conversion", "landing_ai_ade"), `createdAt`.
    *   [ ] Consider if/how images relate to `document_chunks`. A chunk might span text that is visually near an image on a certain page. For now, linking images primarily to `documentId` and `pageNumber` is a good start.
    *   [ ] Generate and run the new migration: `bun run db:generate`, `bun run db:migrate`.
3.  **Create Inngest Function/Step for PDF-to-Image Conversion** - Complexity: 4
    *   [ ] This can be a new Inngest function triggered after `event/document.uploaded`, or a new step within the `extractTextFn` (or a refactored initial processing function). Let's make it a new function for clarity, triggered by `event/document.uploaded`.
    *   **New Event:** `event/document.pdf.pages.converted`
    *   **New Inngest Function:** `convertPdfToImagesFn` in `lib/inngest/functions/document-processing.ts`.
        *   Receives `event.data` of type `DocumentUploadedPayload`.
        *   Updates document status to "processing_images".
        *   Uses the chosen PDF-to-image library to convert each page of the PDF (from `filePath`) into an image (e.g., PNG or JPEG).
        *   Saves these images to a designated local directory (e.g., `uploads/documentId/images/page_1.png`).
        *   For each saved image, insert a record into the `document_images` table.
        *   On success, sends an `event/document.pdf.pages.converted` event containing `documentId` and an array of `{ pageNumber, imagePath }`.
        *   Handles errors and updates document status to "error_image_conversion".
    *   **Subtask 3.1:** Basic Inngest function structure, event trigger. - Complexity: 1
    *   **Subtask 3.2:** Implement PDF-to-image conversion logic using the library. This might involve iterating through pages. - Complexity: 2
    *   **Subtask 3.3:** Save images to disk and records to `document_images` DB table. - Complexity: 2
    *   **Subtask 3.4:** Emit success/failure events and update document status. - Complexity: 1
4.  **Conceptual Landing AI ADE Integration Step** - Complexity: 2 (Conceptual)
    *   [ ] Define a new Inngest function (e.g., `processWithADEFn`) in `lib/inngest/functions/document-processing.ts`.
    *   [ ] This function would be triggered by `event/document.pdf.pages.converted`.
    *   [ ] **Input:** It would receive `documentId` and the list of `imagePaths` (and the original `pdfPath`).
    *   [ ] **Logic (Simulated/Mocked for now):**
        *   Update document status to "processing_ade".
        *   *(Actual Landing AI Call - Future)*: This is where you would make an API call to Landing AI ADE with the PDF and/or images.
        *   *(Simulated Output)*: Landing AI ADE typically returns structured data: text chunks, tables, figures, their bounding boxes, and relationships.
        *   For this slice, we can simulate this by perhaps:
            *   Taking the previously extracted raw text (from `textFilePath` via `document_contents` table).
            *   Using the `document_images` records.
            *   Creating some *mock* structured output that resembles what ADE might provide (e.g., a few text chunks with dummy page numbers and bounding boxes, and identifying some images as "figures").
    *   [ ] **Output Event:** On "success" (even if mocked), it would send a new event, e.g., `event/document.ade.processed`, with `documentId` and the path to this (mocked) structured data, or the data itself if small.
    *   [ ] This function will be a placeholder for the actual Landing AI integration but helps define the workflow.
5.  **Adapt Text Extraction and Embedding Workflow** - Complexity: 3
    *   [ ] The existing `extractTextFn` might now be triggered by `event/document.ade.processed` if ADE provides superior text. Or, it could run in parallel/before ADE if ADE is only for visual elements.
        *   **Decision:** For now, let's assume ADE will provide the primary text chunks. So, `extractTextFn` (our current one using `pdf-parse`) might become a fallback or be removed if ADE's text is sufficient.
        *   Alternatively, `extractTextFn` (using `pdf-parse`) runs first for basic text. Then `convertPdfToImagesFn`. Then `processWithADEFn` which might *refine* text or add visual elements. Then `generateEmbeddingsFn` uses the *best available* text (from ADE or `pdf-parse`) and also considers images for multimodal embeddings.
    *   **Refined Workflow Order:**
        1.  `event/document.uploaded` -> `convertPdfToImagesFn` (generates page images, stores them)
        2.  `event/document.pdf.pages.converted` -> `processWithADEFn` (simulated: uses images, original PDF. Outputs structured data including text chunks and identified visual elements)
        3.  `event/document.ade.processed` -> `generateEmbeddingsFn` (this function will now need to be significantly updated).
    *   **Update `generateEmbeddingsFn`:**
        *   Triggered by `event/document.ade.processed`.
        *   Input: `documentId`, and the (mocked) structured data from ADE (which includes text chunks and references to images/figures).
        *   **Multimodal Embedding Logic:**
            *   For each text chunk from ADE, generate a text embedding.
            *   For each important image identified by ADE (or all page images if ADE step is minimal), generate an image embedding using Cohere `embed-v4.0`'s image embedding capability.
                ```typescript
                // Example for image embedding with @ai-sdk/cohere
                // import { embed } from 'ai';
                // import { cohere } from '@ai-sdk/cohere';
                // const imageBase64 = await fs.readFile(imagePath, 'base64');
                // const { embedding: imageEmbedding } = await embed({
                //   model: cohere.embedding("embed-v4.0", { dimensions: 1024, inputType: 'image' }), // Ensure inputType is correct
                //   value: { type: 'image', data: `data:image/png;base64,${imageBase64}` } // Or however cohere SDK expects image data
                // });
                ```
            *   Store text chunks in `document_chunks` as before.
            *   Store their text embeddings in `document_embeddings`.
            *   Store image embeddings also in `document_embeddings`, but with a reference to the `document_images.id` instead of a `chunkId` (or add a `imageId` FK to `document_embeddings` and make `chunkId` nullable).
                *   **Schema Change Needed for `document_embeddings`:** Add `imageId: uuid().references(() => documentImages.id)` (nullable) and make `chunkId` nullable. Add a `embeddingType: text('embedding_type').notNull().default('text')` ('text' or 'image').
                *   Remember to create and run a migration for this schema change.
6.  **Modify Document Statuses** - Complexity: 1
    *   [ ] Add new statuses to your `documents` table enum/type: "processing_images", "awaiting_ade", "processing_ade", "ade_processed", "error_image_conversion", "error_ade".
7.  **Testing** - Complexity: 3
    *   [ ] Test PDF-to-image conversion locally with a sample PDF. Check image output and DB records.
    *   [ ] Test the Inngest workflow flow in the dev server, observing events and (mocked) ADE step.
    *   [ ] Unit test the image embedding part of `generateEmbeddingsFn` (mocking Cohere).

**Code Example (`lib/db/schema.ts` additions/modifications):**
```typescript
// lib/db/schema.ts
// ... (existing imports and tables)

export const documentImages = pgTable('document_images', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  pageNumber: integer('page_number').notNull(),
  imagePath: text('image_path').notNull(), // Local path to the saved image
  imageUrl: text('image_url'), // For later cloud storage access
  // width: integer('width'),
  // height: integer('height'),
  // extractedBy: text('extracted_by').default('pdf_conversion'), // e.g., pdf_conversion, landing_ai
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Modify document_embeddings table for multimodal
export const documentEmbeddings = pgTable('document_embeddings', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }), // Good to have direct doc link
  chunkId: uuid('chunk_id').references(() => documentChunks.id, { onDelete: 'cascade' }), // Nullable for image embeddings
  imageId: uuid('image_id').references(() => documentImages.id, { onDelete: 'cascade' }), // Nullable for text embeddings
  embeddingType: text('embedding_type').notNull().default('text'), // 'text' or 'image'
  embedding: vectorType('embedding').notNull(), // vectorType defined in Slice 5
  modelName: text('model_name').notNull().default('embed-v4.0'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Add a constraint to ensure either chunkId or imageId is present
  // CHECK ((chunk_id IS NOT NULL AND image_id IS NULL) OR (chunk_id IS NULL AND image_id IS NOT NULL))
  // This might need to be added via raw SQL in a migration.
});
// Remember to update relations if needed and re-generate/run migrations.
// ... add documentImages to the default export ...
export default {
    // ... other tables
    documentImages, // New
    // ... other relations
};
```
**Important:** After schema changes, run `bun run db:generate` and `bun run db:migrate`. You might need to manually add the `CHECK` constraint in the SQL migration file if Drizzle doesn't support it directly in the schema definition.

**Code Example (New Inngest function `convertPdfToImagesFn` - partial):**
```typescript
// lib/inngest/functions/document-processing.ts
// ... (imports: pdfToImage library, path, fs, db, documentImages table, etc.)
import { convert } from 'pdf-to-img'; // Example, API might differ
// ...
const EVENT_PDF_PAGES_CONVERTED = 'event/document.pdf.pages.converted';

export const convertPdfToImagesFn = inngest.createFunction(
  { id: 'convert-pdf-to-images', name: 'Convert PDF Pages to Images' },
  { event: EVENT_DOCUMENT_UPLOADED }, // Assuming this is the trigger
  async ({ event, step }) => {
    const { documentId, filePath, originalName } = event.data as DocumentUploadedPayload;
    const outputImagePaths: { pageNumber: number, imagePath: string }[] = [];

    await step.run('update-status-processing-images', async () => {
      await db.update(documentsTable).set({ status: 'processing_images', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
    });

    try {
      // Create a directory for this document's images
      const imageOutputDir = path.join(process.cwd(), 'uploads', documentId, 'images');
      await fs.mkdir(imageOutputDir, { recursive: true });

      // pdf-to-img often returns an array of buffers or requires a loop
      // This is a simplified representation. Check the library's specific API.
      // Example: const pages = await pdf.numPages(filePath);
      // for (let i = 1; i <= pages; i++) { ... }
      const doc = await convert(filePath, { output_dir: imageOutputDir, output_name_pattern: "page_{page}" });
      // `doc` might be an array of { name, path, pageNum } or similar

      for (const pageImage of doc) { // Assuming `doc` is iterable and gives page info
        const pageNumber = pageImage.pageNum; // Or derived from name
        const imagePathOnDisk = pageImage.path; // Full path returned by library

        await step.run(`save-image-record-page-${pageNumber}`, async () => {
          await db.insert(documentImages).values({
            documentId,
            pageNumber,
            imagePath: imagePathOnDisk, // Store the path where the image is saved
          });
        });
        outputImagePaths.push({ pageNumber, imagePath: imagePathOnDisk });
      }

      if (outputImagePaths.length === 0) throw new Error('No images were converted.');

      await step.sendEvent('send-pdf-pages-converted-event', {
        name: EVENT_PDF_PAGES_CONVERTED,
        data: { documentId, imagePaths: outputImagePaths },
      });
      await db.update(documentsTable).set({ status: 'awaiting_ade', updatedAt: new Date() }).where(eq(documentsTable.id, documentId)); // Next status

      return { success: true, message: `${outputImagePaths.length} pages converted to images for ${originalName}` };
    } catch (error: any) {
      // ... (error handling, update status to error_image_conversion, send failure event)
      console.error(`Error converting PDF to images for ${documentId}:`, error);
      await db.update(documentsTable).set({ status: 'error_image_conversion', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
      // Send failure event
      throw error;
    }
  }
);
// Add this function to app/api/inngest/route.ts
```

**Code Example (Conceptual `processWithADEFn` - partial):**
```typescript
// lib/inngest/functions/document-processing.ts
// ...
const EVENT_ADE_PROCESSED = 'event/document.ade.processed';
type PdfPagesConvertedPayload = { documentId: string; imagePaths: { pageNumber: number; imagePath: string }[] };

export const processWithADEFn = inngest.createFunction(
  { id: 'process-document-with-ade', name: 'Process Document with Landing AI ADE (Simulated)' },
  { event: EVENT_PDF_PAGES_CONVERTED },
  async ({ event, step }) => {
    const { documentId, imagePaths } = event.data as PdfPagesConvertedPayload;

    await step.run('update-status-processing-ade', async () => {
      await db.update(documentsTable).set({ status: 'processing_ade', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
    });

    // ** SIMULATED ADE PROCESSING **
    const mockAdeOutput = await step.run('simulate-landing-ai-ade', async () => {
      // In a real scenario: call Landing AI ADE API with PDF/imagePaths
      // For now, retrieve basic text if available, or just acknowledge images.
      const contentRecord = await db.query.documentContents.findFirst({ where: eq(documentContentsTable.documentId, documentId) });
      let textFromFile = "Mock ADE text: No prior text found.";
      if (contentRecord?.textFilePath) {
        try {
            textFromFile = await fs.readFile(contentRecord.textFilePath, 'utf-8');
        } catch { /* ignore if not found */ }
      }

      // Simulate ADE identifying some text chunks and associating them with images/pages
      const simulatedTextChunks = [
        { text: textFromFile.substring(0, 500), pageNumber: 1, type: 'paragraph' },
        // ... more chunks
      ];
      const simulatedFigures = imagePaths.slice(0,1).map(img => ({ imageId: null, imagePath: img.imagePath, pageNumber: img.pageNumber, caption: "Mock Figure Caption" })); // Link to actual imageId later

      // This structure needs to be well-defined for the embedding step.
      return { documentId, textChunks: simulatedTextChunks, figures: simulatedFigures, images: imagePaths };
    });

    await step.sendEvent('send-ade-processed-event', {
      name: EVENT_ADE_PROCESSED,
      data: { documentId, adeData: mockAdeOutput }, // Send the (mocked) structured data
    });
    await db.update(documentsTable).set({ status: 'ade_processed', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));

    return { success: true, message: `ADE processing (simulated) complete for ${documentId}` };
    // Error handling omitted for brevity but should be similar to other functions
  }
);
// Add this function to app/api/inngest/route.ts
```

**Updating `generateEmbeddingsFn` Trigger and Input:**
*   Change its trigger: `{ event: EVENT_ADE_PROCESSED }`.
*   Its `event.data` will now be `{ documentId, adeData: { textChunks: ..., figures: ..., images: ... } }`.
*   The logic inside will iterate `adeData.textChunks` for text embeddings and `adeData.figures` (or `adeData.images`) for image embeddings, saving them to the modified `document_embeddings` table.

**Ready to Merge Checklist:**
*   [ ] PDF-to-image library installed, and system dependencies (if any) are noted/handled.
*   [ ] `document_images` table created and migrated. `document_embeddings` table modified for multimodal and migrated.
*   [ ] Inngest function `convertPdfToImagesFn` converts PDF pages to images, saves them locally, and stores records in `document_images`.
*   [ ] (Conceptual) `processWithADEFn` is set up, simulating ADE output structure.
*   [ ] `generateEmbeddingsFn` is refactored to:
    *   Trigger from ADE processing event.
    *   Handle (mocked) structured data from ADE.
    *   Generate and store both text and image embeddings in the modified `document_embeddings` table.
*   [ ] Document statuses are updated throughout the new workflow steps.
*   [ ] Tested the new Inngest workflow flow with a sample PDF.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **`pdf-to-img` or `pdf2pic` library:** Check their GitHub for API usage, dependencies, and examples.
*   **Landing AI ADE documentation (if available/browsable):** Understand its typical input (PDF, images) and output (JSON with text, tables, figures, coordinates).
*   **Cohere `embed-v4.0` for image embedding:** Confirm the exact API for passing image data (e.g., base64 string, buffer) via `@ai-sdk/cohere`. The PRD shows `value: { type: "image", data: imageBase64 }`.
*   **Storing binary data (images) vs. paths:** For now, paths are fine. Cloud object storage is the next step for scalability.

**Need to Go Deeper?**
*   **Research Prompt:** *"I need to convert PDF pages to images in a Node.js/Bun backend using [chosen library, e.g., `pdf-to-img`]. What are common system dependencies (like Ghostscript or Poppler), and how do I install them on a typical Linux server or in a Docker container? Show a code example for converting all pages of a PDF and saving them."*
*   **Research Prompt:** *"Explain how to generate multimodal embeddings (text and image) using Cohere's `embed-v4.0` model with the `@ai-sdk/cohere` package. Show examples for embedding a piece of text and embedding an image (from a file path or buffer). How should I structure my database table to store these different types of embeddings and link them back to the original document content?"*

**Questions for Senior Dev:**
*   [ ] What are the implications of storing many images on the local filesystem of the server? (Disk space, backup, scaling). Should we prioritize moving to object storage sooner? (PRD indicates it, good to discuss timing).
*   [ ] The Landing AI ADE step is currently mocked. What's a good strategy for fully integrating it later? (API keys, handling its async nature if it's a long process, parsing its specific JSON output).
*   [ ] How should the `document_embeddings` table effectively link to *either* a text chunk or an image? (The current nullable FKs + `embeddingType` is one way. Any alternatives?)
*   [ ] What image format (PNG, JPEG) and resolution are optimal for ADE and for later display/embedding?

---

This is a very ambitious slice that lays crucial groundwork for the visual document understanding capabilities. Getting the data flow and storage right, even with a mocked ADE step, is key. The next step would logically be to integrate the actual Landing AI ADE calls or enhance the retrieval and chat to use these new image embeddings.