Okay, we've successfully integrated user authentication and have a robust (simulated or initial real) Landing AI ADE step that provides structured information about the document. Currently, our RAG pipeline primarily uses the *text content* from these elements for context.

This slice will focus on **leveraging the structural information from the (simulated or real) ADE output to create more enriched prompts for the LLM**. This means the LLM will not just get a blob of text, but will also have some understanding of the *type* and *context* of the information (e.g., "this is a paragraph," "this is a caption for Figure X," "this content is from a table on page Y").

---

### Slice 18: Enriched LLM Prompts Using Structured ADE Output

**IMPLEMENTATION STATUS**: 🔄 **IN PROGRESS** - Schema complete, context formatting pending

**What You're Building:**
*   Modifying the `retrieveContextAndSources` function (or the part of the chat API that assembles LLM context) to use the structured `adeData` (from Slice 14).
*   Formatting the retrieved context for the LLM in a way that highlights the type of content (e.g., paragraph, figure caption, table data snippet).
*   Potentially adjusting how `ChatSource` objects are created to reflect this richer contextual information, which could then be used for even more specific citations in the UI.

**Tasks:**

1.  **Ensure ADE Output is Available to Context Assembly** - Complexity: 1
    *   [x] **COMPLETED**: The `adeData` structured output is available through the Landing AI ADE integration implemented in Slice 14.
    *   [x] **COMPLETED**: The enhanced document chunk schema includes ADE metadata fields for enriched context.
    *   **COMPLETED Decision**: Document chunks store relevant metadata from ADE elements including `elementType`, `pageNumber`, and `bbox`.
    *   **COMPLETED Schema Changes for `document_chunks`:**
        *   [x] Added `elementType: text('element_type')` for content classification
        *   [x] Added `pageNumber: integer('page_number')` for document navigation
        *   [x] Added `bbox: jsonb('bbox')` for spatial coordinates
        *   [x] Database migrations applied successfully
    *   [x] **COMPLETED**: Search API `/api/documents/search-chunks` supports retrieving ADE metadata fields
2.  **Refine Context Formatting for LLM** - Complexity: 3
    *   [ ] In `app/api/chat/route.ts`, within the `retrieveContextAndSources` function (or where the context string for the LLM is built):
        *   Instead of just concatenating `chunk.content`, format each piece of context to indicate its type and origin.
        *   Example of formatted context string:
            ```
            DOCUMENT EXCERPTS:
            ---
            [Type: Paragraph, Page: 1]
            Text: "{content of paragraph 1}"
            ---
            [Type: Figure Caption, Page: 2, Related Image: figure_xyz.png]
            Caption: "{caption for figure}"
            ---
            [Type: Table Snippet, Page: 3]
            Content: "{relevant row/cell data from a table}"
            ---
            ```
        *   This requires the search results (which become `ChatSource` objects) to include `elementType` and `pageNumber`.
    *   **Subtask 2.1:** Modify the search API (`search-chunks`) to return `elementType`, `pageNumber` (and `bbox` if stored) for text chunks.
    *   **Subtask 2.2:** Update the context assembly logic in `chat/route.ts` to use this structured information to create the formatted prompt string.
3.  **Update `ChatSource` Type and Population** - Complexity: 2
    *   [ ] In `types/index.ts`, update the `ChatSource` interface to include these new fields if they are to be used directly for display or more detailed interactive citations:
        ```typescript
        // types/index.ts
        export interface ChatSource {
          type: 'text' | 'image'; // 'text' can now have more specific elementType
          elementType?: 'paragraph' | 'title' | 'list_item' | 'table_text' | 'figure_caption' | string; // For text sources
          id: string; // chunkId or imageId
          documentId: string;
          documentOriginalName: string;
          contentSnippet?: string;
          fullContent?: string; // Potentially the full chunk content if different from snippet
          imagePath?: string;
          pageNumber?: number;
          bbox?: [number, number, number, number]; // Optional
          similarityScore?: number;
        }
        ```
    *   [ ] When `retrieveContextAndSources` creates the `sourcesForMessage` array, populate these new fields (`elementType`, `pageNumber`, `bbox`) from the search results.
4.  **LLM Prompt Engineering for Structured Context** - Complexity: 2
    *   [ ] Review and potentially adjust the main system prompt for the LLM in `app/api/chat/route.ts`.
    *   [ ] Explicitly instruct the LLM to pay attention to the types of information provided in the "DOCUMENT EXCERPTS" and to use this understanding in its answer.
        ```
        System: You are a helpful assistant. Answer the user's question based ONLY on the following document excerpts.
        Pay attention to the type of information (e.g., Paragraph, Figure Caption, Table Snippet) and its page number.
        If the answer is not in the excerpts, say "I couldn't find an answer in the provided document excerpts for that query."
        Do not use any external knowledge.

        DOCUMENT EXCERPTS:
        [Formatted context as described above]
        ---
        ```
5.  **Frontend Citation Display (Minor Update)** - Complexity: 1
    *   [ ] The existing citation display (Slice 7 & 11) can be slightly enhanced if desired, e.g., the hover card for a text source could now also show "Type: Paragraph, Page: 3". This is optional for this slice if the main benefit is better LLM responses.
6.  **Testing** - Complexity: 2
    *   [ ] **Backend:**
        *   Test that the context string passed to the LLM is correctly formatted with type and page information.
        *   Manually inspect LLM responses for a few queries to see if they seem more nuanced or make better use of the structured context (this is qualitative).
    *   [ ] **Schema & Search:** Verify that `elementType` and `pageNumber` are correctly retrieved and passed.

**Code Example (Schema change for `document_chunks` - ensure migration):**
```typescript
// lib/db/schema.ts
// ...
// export const documentChunks = pgTable('document_chunks', {
//   id: uuid('id').defaultRandom().primaryKey(),
//   documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
//   content: text('content').notNull(),
//   chunkIndex: integer('chunk_index').notNull(), // Overall index if still useful
//   charCount: integer('char_count').notNull(),
//   elementType: text('element_type'), // NEW: e.g., 'paragraph', 'title', 'figure_caption'
//   pageNumber: integer('page_number'),    // NEW
//   bbox: jsonb('bbox'),                  // NEW: Optional, store as [x1, y1, x2, y2]
//   createdAt: timestamp('created_at').defaultNow().notNull(),
// });
// ...
```
**Make sure `generateEmbeddingsFn` (from Slice 14) now populates these new fields when creating `document_chunks` based on `adeData.elements`.**

**Code Example (Update Search API to return new fields - `searchAndRerank` or `search-chunks`):**
```typescript
// lib/retrieval-service.ts (or in the search API route)
// ...
// const initialTextChunks: RetrievedChunk[] = await db.select({
//   id: documentChunksTable.id,
//   content: documentChunksTable.content,
//   chunkIndex: documentChunksTable.chunkIndex,
//   documentId: documentChunksTable.documentId,
//   elementType: documentChunksTable.elementType, // SELECT NEW FIELD
//   pageNumber: documentChunksTable.pageNumber,   // SELECT NEW FIELD
//   // bbox: documentChunksTable.bbox,            // SELECT NEW FIELD if stored
//   originalSimilarityScore: sql<number>`1 - (${distanceMetric})`
// })
// .from(documentChunksTable)
// // ... rest of the query
```
And update `RetrievedChunk` interface accordingly.

**Code Example (Context Assembly in `app/api/chat/route.ts` - `retrieveContextAndSources`):**
```typescript
// app/api/chat/route.ts (inside retrieveContextAndSources or where contextText is built)
// ...
// Assuming `rerankedTextChunks` (from Slice 13) now contains `elementType` and `pageNumber`
// const formattedExcerpts = rerankedTextChunks.map(chunk => {
//   let typeLabel = chunk.elementType || 'Text'; // Default if elementType is null/undefined
//   typeLabel = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1); // Capitalize

//   let contextLine = `[Type: ${typeLabel}`;
//   if (chunk.pageNumber !== null && chunk.pageNumber !== undefined) {
//     contextLine += `, Page: ${chunk.pageNumber}`;
//   }
//   // If you have figure captions linked to specific images:
//   // if (chunk.elementType === 'figure_caption' && chunk.relatedImageName) {
//   //   contextLine += `, Related Image: ${chunk.relatedImageName}`;
//   // }
//   contextLine += `]\nText: "${chunk.content}"`;
//   return contextLine;
// }).join("\n---\n");

// const contextText = formattedExcerpts; // This goes into the LLM prompt
// ...

// Update ChatSource population too:
// sources.push({
//   type: 'text',
//   elementType: chunk.elementType, // Pass it along
//   pageNumber: chunk.pageNumber,   // Pass it along
//   // ... other ChatSource fields
// });
```

**Ready to Merge Checklist:**
*   [x] **COMPLETED**: `document_chunks` schema updated with `elementType`, `pageNumber`, and `bbox`, fully migrated
*   [x] **COMPLETED**: Enhanced embedding generation populates ADE metadata fields in `document_chunks`
*   [x] **COMPLETED**: Search API returns comprehensive metadata including `elementType` and `pageNumber`
*   [ ] **IN PROGRESS**: Context assembly logic formatting LLM prompts with structured information
*   [ ] **PENDING**: System prompt updates to leverage structural information
*   [ ] **PENDING**: `ChatSource` type enhancement for ADE metadata display
*   [ ] **PENDING**: Frontend citation display enhancements for metadata visualization
*   [ ] **PENDING**: Qualitative testing of enhanced LLM contextual awareness
*   [x] **COMPLETED**: All tests pass (bun test)
*   [x] **COMPLETED**: Linting passes (bun run lint)
*   [x] **COMPLETED**: Build succeeds (bun run build)
*   [x] **COMPLETED**: Code architecture reviewed and approved

**CURRENT STATUS**: Schema and data infrastructure complete. Context formatting and LLM prompt engineering in progress.

**Quick Research (5-10 minutes):**
*   **Prompt Engineering Techniques:** How to best present structured context to LLMs for optimal understanding and utilization.
*   **Examples of structured JSON output from real Document AI services** (like Google Document AI, Azure Form Recognizer, or Landing AI if examples are public) to understand common element types and metadata.

**Need to Go Deeper?**
*   **Research Prompt:** *"I have structured data extracted from documents (e.g., identifying paragraphs, titles, figure captions, tables, along with their page numbers and text content). How can I best format this information into a text-based prompt for a Large Language Model (LLM) to answer questions? Provide examples of prompt structures that help the LLM differentiate and utilize these various content types effectively."*

**Questions for Senior Dev:**
*   [ ] How verbose should the type labels in the prompt be (e.g., "[Type: Paragraph, Page: 1]" vs. just "[P1] Text: ...")? Is there a balance between clarity for the LLM and token count?
*   [ ] If ADE provides bounding box (`bbox`) information, what's a simple way we could start using that in the LLM prompt or for the `ChatSource` data, even if we don't render highlights yet? (Could be passed as metadata, LLM might not use it directly without specific prompting).
*   [ ] This approach relies on the search retrieving elements that were correctly typed by ADE. What if an important piece of text was misclassified by ADE (or our simulation)? (This highlights the importance of ADE accuracy or having fallbacks).

---

By enriching the LLM's context with structural information, we are moving closer to the "advanced document understanding" and "multimodal RAG responses" (by making the text part more intelligent about its origin) goals. The LLM can now, in theory, generate answers that are more grounded in the document's actual layout and content types.