Okay, we've laid the groundwork for multimodal processing by converting PDF pages to images and preparing for Landing AI ADE. We've also conceptually updated the embedding generation to handle both text and images.

Now, let's focus on the "R" in RAG for multimodal: **Enhanced Retrieval with Visual Context**. This means modifying our search functionality to consider both text and image similarity.

---

### Slice 10: Multimodal Retrieval (Hybrid Search - Text + Image Similarity)

**What You're Building:**
*   Updating the `/api/documents/search-chunks` (or a new search endpoint) to perform similarity searches for both text queries against text embeddings and potentially image queries (or text queries finding relevant images) against image embeddings.
*   Implementing a basic strategy to combine results from text and image searches (Reciprocal Rank Fusion - RRF is mentioned in PRD, but we can start simpler).
*   Modifying the chat API and frontend to potentially display relevant images alongside text answers, based on the retrieved visual context.

**Tasks:**

1.  **Refine Image Storage & Access (If Necessary)** - Complexity: 1
    *   [ ] Ensure that the `imagePath` stored in `document_images` is accessible by the Next.js server if we plan to serve these images directly through an API endpoint for the frontend.
    *   [ ] For now, we'll assume local paths are fine, but in a production setup, these would ideally be URLs from an object storage.
2.  **Update Search API for Multimodal Queries** - Complexity: 4
    *   [ ] Modify `app/api/documents/search-chunks/route.ts` (or create a new, more general search endpoint like `app/api/search/route.ts`).
    *   **Input:** The API should still take a `query` (text) and `documentId`.
    *   **Logic:**
        1.  **Text Query Embedding:** Embed the user's text query as before using Cohere `embed-v4.0`.
        2.  **Text Chunk Search:** Perform a similarity search against `document_embeddings` where `embeddingType` is 'text', using the text query embedding. Retrieve top K text chunks with their content and metadata.
        3.  **Image Search (Text-to-Image):** Also perform a similarity search against `document_embeddings` where `embeddingType` is 'image', using the *same text query embedding*. This finds images relevant to the textual query. Retrieve top N image embeddings and their associated `document_images` data (like `imagePath`, `pageNumber`).
            *   The PRD mentions "Image similarity with Reciprocal Rank Fusion (RRF)". This implies you might also have image-to-image search later, but for now, text-to-image is a good start.
    *   **Subtask 2.1:** Adapt the search API to perform two separate vector searches: one for text chunks and one for images, both using the text query embedding. - Complexity: 2
    *   **Subtask 2.2:** Ensure Drizzle queries correctly filter by `embeddingType` and join with `document_chunks` or `document_images` respectively. - Complexity: 2
3.  **Basic Result Fusion/Ranking** - Complexity: 3
    *   [ ] You'll now have two lists of results: relevant text chunks and relevant images.
    *   [ ] **Simple Approach for now:**
        *   Keep the top K text chunks.
        *   Keep the top N images.
        *   Return both lists in the API response, perhaps under different keys (e.g., `textResults`, `imageResults`).
    *   [ ] **(Future/Advanced):** Reciprocal Rank Fusion (RRF) would involve assigning ranks to items in each list and then combining these ranks to get a single, re-ranked list of mixed content. This is more complex and can be a follow-up. For now, separate lists are fine.
    *   **Subtask 3.1:** Modify the API response structure to include both text and image results. - Complexity: 1
4.  **Update Chat API to Use Multimodal Context** - Complexity: 3
    *   [ ] In `app/api/chat/route.ts`:
        *   When calling the search service (`retrieveContextAndSources`), it should now receive both text chunks and image information.
        *   **Context for LLM:** The text chunks are used as before to augment the LLM prompt.
        *   **Passing Image Info to Frontend:** The information about relevant images (e.g., their `imagePath` or a URL to access them, `pageNumber`, `documentOriginalName`) needs to be passed along with the LLM's response so the frontend can display them.
        *   This means the `ChatSource` type (defined in Slice 7) might need to be expanded or you'll have a separate array for image sources. Let's try to make `ChatSource` more generic or add a `type` field.
            ```typescript
            // types/index.ts - Updated ChatSource
            export interface ChatSource {
              type: 'text' | 'image';
              id: string; // chunkId or imageId
              documentId: string;
              documentOriginalName: string;
              contentSnippet?: string; // For text chunks
              imagePath?: string;      // For image sources
              pageNumber?: number;     // For image sources (or text chunks if available)
              similarityScore?: number;
            }
            ```
        *   The `retrieveContextAndSources` function will now populate this array with both text and image sources.
        *   The mechanism for sending this array of `ChatSource` objects to the client (e.g., via the `1:jsonData` stream) remains the same as in Slice 7.
5.  **Frontend: Display Relevant Images in Chat** - Complexity: 3
    *   [ ] In your chat message rendering component:
        *   When parsing `message.experimental_streamData` (which now contains an array of `ChatSource` objects):
            *   If a source `type` is 'image', render an `<img>` tag.
            *   The `src` for the image will need to be an API endpoint that can serve the image from its local `imagePath`, or if you've already moved to object storage, it would be the `imageUrl`.
    *   **Create an API Route to Serve Images:** If images are stored locally.
        *   `app/api/images/[...imagePath]/route.ts` (or similar).
        *   This route would take the `imagePath` (url encoded), read the file from the local `uploads` directory, and return it with the correct content type.
        *   **Security:** Be very careful to sanitize and validate the `imagePath` to prevent directory traversal attacks. It should be constrained to your image upload directories.
    *   **Subtask 5.1:** Update the chat message component to differentiate between text and image sources and render `<img>` tags. - Complexity: 2
    *   **Subtask 5.2:** (If local images) Create the secure image serving API endpoint. - Complexity: 2
6.  **Write Tests** - Complexity: 2
    *   [ ] **Backend Search API:** Test that it performs both text and image vector searches and returns structured results.
    *   [ ] **Chat API:** Test that it correctly processes multimodal sources and prepares them for the frontend.
    *   [ ] **Frontend:** Test rendering of image sources.
    *   [ ] **Image Serving API:** Test that it serves images and handles invalid paths.

**Code Example (`app/api/documents/search-chunks/route.ts` - Now Multimodal):**
```typescript
// app/api/documents/search-chunks/route.ts (or new /api/search/route.ts)
// ... (imports: db, tables, eq, sql, embed, cohere)
import { documentImages as documentImagesTable } from '@/lib/db/schema'; // Import new table
// ...
const TOP_K_TEXT_RESULTS = 3;
const TOP_K_IMAGE_RESULTS = 2;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, documentId } = body; // topK can be passed for text/image separately if needed

    if (!query || typeof query !== 'string') /* ... error ... */ ;

    const { embedding: queryEmbedding } = await embed({ /* ... embed query ... */ });
    if (!queryEmbedding) /* ... error ... */ ;
    const queryEmbeddingString = `[${queryEmbedding.join(',')}]`;
    const distanceMetric = sql`embedding <=> ${queryEmbeddingString}::vector`;

    // 1. Search for Text Chunks
    const textResults = await db.select({
      id: documentChunksTable.id,
      content: documentChunksTable.content,
      chunkIndex: documentChunksTable.chunkIndex,
      documentId: documentChunksTable.documentId,
      similarityScore: sql<number>`1 - (${distanceMetric})`
    })
    .from(documentChunksTable)
    .innerJoin(documentEmbeddingsTable, eq(documentChunksTable.id, documentEmbeddingsTable.chunkId))
    .where(sql`${documentEmbeddingsTable.embeddingType} = 'text' ${documentId ? sql`AND ${documentChunksTable.documentId} = ${documentId}` : sql``}`)
    .orderBy(distanceMetric)
    .limit(TOP_K_TEXT_RESULTS);

    // 2. Search for Relevant Images (Text-to-Image)
    const imageResults = await db.select({
      id: documentImagesTable.id, // Image ID
      imagePath: documentImagesTable.imagePath,
      pageNumber: documentImagesTable.pageNumber,
      documentId: documentImagesTable.documentId,
      similarityScore: sql<number>`1 - (${distanceMetric})`
    })
    .from(documentImagesTable)
    .innerJoin(documentEmbeddingsTable, eq(documentImagesTable.id, documentEmbeddingsTable.imageId))
    .where(sql`${documentEmbeddingsTable.embeddingType} = 'image' ${documentId ? sql`AND ${documentImagesTable.documentId} = ${documentId}` : sql``}`)
    .orderBy(distanceMetric)
    .limit(TOP_K_IMAGE_RESULTS);

    // Join with documents table to get originalName for both text and image results if not already done
    // (This part can be complex with multiple result types; might need separate queries or careful joins)
    // For simplicity here, assume documentOriginalName is fetched separately or added in the Chat API.

    return NextResponse.json({
      textResults: textResults,
      imageResults: imageResults,
    }, { status: 200 });

  } catch (error: any) { /* ... error handling ... */ }
}
```

**Code Example (`retrieveContextAndSources` in `app/api/chat/route.ts` update):**
```typescript
// In app/api/chat/route.ts
// ...
// async function retrieveContextAndSources(query: string, documentId?: string): Promise<{ contextText: string, sources: ChatSource[] }> {
  // ... (fetch call to the search API)
  // const searchResult = await response.json(); // Expects { textResults: [], imageResults: [] }

  // const sources: ChatSource[] = [];
  // const docNamesCache = new Map<string, string>(); // Cache for document names

  // Helper to get doc name (to avoid N+1 if not joined in search)
  // async function getDocName(docId: string) { /* ... query DB ... */ return "doc_name"; }

  // Process text results
  // for (const textRes of (searchResult.textResults || [])) {
  //   const docName = docNamesCache.get(textRes.documentId) || await getDocName(textRes.documentId);
  //   docNamesCache.set(textRes.documentId, docName);
  //   sources.push({
  //     type: 'text',
  //     id: textRes.id, // chunkId
  //     documentId: textRes.documentId,
  //     documentOriginalName: docName,
  //     contentSnippet: textRes.content.substring(0, 200) + "...",
  //     similarityScore: textRes.similarityScore,
  //   });
  // }

  // Process image results
  // for (const imgRes of (searchResult.imageResults || [])) {
  //   const docName = docNamesCache.get(imgRes.documentId) || await getDocName(imgRes.documentId);
  //   docNamesCache.set(imgRes.documentId, docName);
  //   sources.push({
  //     type: 'image',
  //     id: imgRes.id, // imageId
  //     documentId: imgRes.documentId,
  //     documentOriginalName: docName,
  //     imagePath: imgRes.imagePath, // Path for server-side access
  //     // Construct a URL for client-side access:
  //     // imageUrl: `/api/images/${encodeURIComponent(imgRes.imagePath)}`, // If serving locally
  //     pageNumber: imgRes.pageNumber,
  //     similarityScore: imgRes.similarityScore,
  //   });
  // }

  // const contextText = (searchResult.textResults || []).map((r: any) => r.content).join("\n---\n");
  // return { contextText, sources };
// }
// The above needs to be adapted carefully. Fetching doc names inside the loop is inefficient.
// Best if search-chunks API can return documentOriginalName directly by joining.
```

**Code Example (API Route to Serve Images - `app/api/images/[...imagePathParts]/route.ts`):**
```typescript
// app/api/images/[...imagePathParts]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import mime from 'mime-types'; // bun add mime-types

const UPLOAD_BASE_DIR = path.resolve(process.cwd(), 'uploads'); // Your actual base upload directory

export async function GET(
  req: NextRequest,
  { params }: { params: { imagePathParts: string[] } }
) {
  if (!params.imagePathParts || params.imagePathParts.length === 0) {
    return NextResponse.json({ error: 'Image path is required' }, { status: 400 });
  }

  // Reconstruct the path carefully. This assumes imagePathParts does not contain '..' etc.
  // The path received here is relative to the 'uploads' directory,
  // e.g., if imagePath in DB is 'documentId/images/page_1.png',
  // then imagePathParts might be ['documentId', 'images', 'page_1.png']
  const relativeImagePath = path.join(...params.imagePathParts);

  // **CRITICAL SECURITY**: Normalize and ensure path is within UPLOAD_BASE_DIR
  const absoluteImagePath = path.normalize(path.join(UPLOAD_BASE_DIR, relativeImagePath));

  if (!absoluteImagePath.startsWith(UPLOAD_BASE_DIR)) {
    console.warn(`Attempted directory traversal: ${relativeImagePath}`);
    return NextResponse.json({ error: 'Invalid image path (traversal attempt)' }, { status: 403 });
  }

  // A more robust check to prevent '..' even after normalization if UPLOAD_BASE_DIR is a symlink, etc.
  if (relativeImagePath.includes('..')) {
      console.warn(`Attempted directory traversal with '..': ${relativeImagePath}`);
      return NextResponse.json({ error: 'Invalid image path (contains ..)' }, { status: 403 });
  }


  try {
    const imageBuffer = await fs.readFile(absoluteImagePath);
    const contentType = mime.lookup(absoluteImagePath) || 'application/octet-stream';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: { 'Content-Type': contentType },
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    console.error(`Error serving image ${absoluteImagePath}:`, error);
    return NextResponse.json({ error: 'Failed to serve image' }, { status: 500 });
  }
}
```

**Frontend Chat Message Component Update:**
*   In the component rendering messages, when iterating through `sources`:
    ```typescript
    // if (source.type === 'image' && source.imagePath) {
    //   // Construct the URL based on how your image serving API is set up.
    //   // If imagePath stored in DB is like 'doc123/images/page_1.png'
    //   // And your API route is /api/images/[...imagePathParts]
    //   const imageUrl = `/api/images/${source.imagePath}`; // Ensure imagePath is URL-safe or encode components
    //   return <img src={imageUrl} alt={`Source Image from ${source.documentOriginalName} page ${source.pageNumber}`} style={{ maxWidth: '200px', maxHeight: '200px', display: 'block' }} />;
    // }
    ```

**Ready to Merge Checklist:**
*   [ ] Search API (`/api/documents/search-chunks`) performs separate vector searches for text and images using the text query embedding.
*   [ ] Search API returns structured results for both text chunks and relevant images.
*   [ ] `ChatSource` type updated for multimodal sources.
*   [ ] Chat API (`/api/chat/route.ts`) incorporates both text and image sources, passing them to the frontend via `experimental_streamData`.
*   [ ] (If local images) Secure API endpoint for serving images is implemented and working.
*   [ ] Frontend chat message component renders `<img>` tags for image sources, fetching from the image serving API.
*   [ ] Basic error handling is in place for all new components.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: Chat can now retrieve and display relevant images alongside text sources based on the user's query.

**Quick Research (5-10 minutes):**
*   **PGVector multiple distance searches in one query:** While possible with subqueries or CTEs, separate queries are often simpler to manage and debug initially.
*   **Reciprocal Rank Fusion (RRF):** Understand the basic algorithm for future implementation. (Score = sum(1 / (k + rank_i)) where k is a constant).
*   **Securely serving static files in Next.js API routes:** Best practices for path validation.
*   **`mime-types` library for Node.js.**

**Need to Go Deeper?**
*   **Research Prompt:** *"I need to perform two separate vector similarity searches in PostgreSQL/PGVector (one for text, one for images, using the same query vector) and then combine their results in my Node.js backend using Drizzle ORM. Show how to structure these Drizzle queries and how to merge the results into a single list or structured object for the API response."*
*   **Research Prompt:** *"Explain how to create a secure Next.js API route to serve images from the local filesystem. What are the key security vulnerabilities (like directory traversal) and how can I prevent them using path normalization and validation in Node.js?"*

**Questions for Senior Dev:**
*   [ ] For the initial multimodal search, is using the text query embedding to find relevant images (text-to-image search) a good starting point? (Yes, it's a common and effective approach).
*   [ ] The current result "fusion" is just returning separate lists. What's a good, simple next step towards something like RRF if we want a single ranked list later?
*   [ ] The image serving API is crucial for security. Are the path validation steps shown sufficient for now?
*   [ ] How should the UI handle cases where many images are retrieved as relevant? (e.g., a carousel, a grid, only top 1-2).

---

This slice brings in the "visual" aspect to retrieval, which is a significant step towards the full vision of the PRD. Users will now start to see images from their documents appearing as relevant context!