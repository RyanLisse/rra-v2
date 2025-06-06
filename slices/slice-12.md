Okay, we've established persistent conversation management. Now, let's circle back to improving the quality of our Retrieval Augmented Generation, as outlined in the PRD, by implementing **Cohere Rerank**.

When our initial vector search (Slice 6 & 10) retrieves, say, the top 10-20 text chunks (and potentially images), not all of them might be equally relevant to the user's query. A reranker model can take these initial results and the original query, and re-score them for better relevance, leading to more accurate context for the LLM.

---

### Slice 13: Integrating Cohere Rerank for Improved Context Relevance

**What You're Building:**
*   Integrating the Cohere Rerank API (via `@ai-sdk/cohere` or a direct API call if the SDK abstraction isn't ideal for rerank).
*   Modifying the search/retrieval process:
    1.  Perform an initial broad vector search (e.g., retrieve top 20-50 chunks).
    2.  Pass these retrieved chunks (their text content) and the original query to the Cohere Rerank API.
    3.  Use the reranked and re-ordered chunks (e.g., top 3-5) as the final context for the LLM.
*   This primarily affects the backend retrieval logic.

**Tasks:**

1.  **Verify/Install Cohere SDK for Rerank** - Complexity: 1
    *   [ ] We are already using `@ai-sdk/cohere`. Check if it provides a convenient abstraction for the rerank endpoint. The PRD example shows `@mastra/rag` using `cohere("rerank-v3.5")`. The `ai/core` or `@ai-sdk/cohere` might have a similar `rerank` function.
    *   [ ] If not directly available in `@ai-sdk/cohere` in a simple form, you might need to make a direct HTTP call to the Cohere API for reranking or use a more specific Cohere Node.js SDK if available (`cohere-ai` package).
        *   `bun add cohere-ai` (if direct SDK usage is needed for rerank specifically).
    *   [ ] Ensure your Cohere API key (`COHERE_API_KEY` in `.env.local`) has permissions for the rerank model (e.g., `rerank-english-v3.0`, `rerank-multilingual-v3.0`, or the latest version mentioned in PRD, `rerank-v3.5` - though the PRD code example uses `rerank-v3.5`, the text mentions `Cohere Rerank v3.0`). Let's aim for the latest stable reranker.
2.  **Update Search/Retrieval Logic** - Complexity: 4
    *   [ ] This will primarily modify the function responsible for fetching context, which is currently part of `app/api/documents/search-chunks/route.ts` and used by `retrieveContextAndSources` in `app/api/chat/route.ts`. It's a good idea to refactor the core retrieval logic into a reusable service function if not already done.
    *   **Step 1: Initial Broad Retrieval:**
        *   Modify the existing vector search to retrieve a larger number of initial candidates (e.g., `topK_initial = 25` instead of just 3-5). This applies to both text chunk search and text-to-image search if you are reranking both. For now, let's focus on reranking text chunks.
    *   **Step 2: Prepare Documents for Reranker:**
        *   The Cohere Rerank API expects a `query` (string) and a list of `documents` (either strings or objects like `{ text: "..." }`).
        *   Extract the text content from your initially retrieved `topK_initial` text chunks.
    *   **Step 3: Call Cohere Rerank API:**
        *   Use the Cohere SDK (or a direct API call) to send the `query` and the list of document texts to the rerank model.
        *   Specify the `model` (e.g., `rerank-english-v3.0` or `rerank-multilingual-v3.0`).
        *   You can also specify `top_n` to tell the reranker how many of the top reranked documents you want back.
    *   **Step 4: Process Reranked Results:**
        *   The reranker will return a list of results, each with an `index` (referring to the original order of documents you sent) and a `relevance_score`.
        *   Use these results to re-order your initial `topK_initial` chunks. Select the new top N (e.g., `topK_final = 3-5`) based on the reranker's scores.
        *   These `topK_final` reranked chunks become the context for the LLM.
    *   **Subtask 2.1:** Increase `topK` for initial vector search in `search-chunks` API.
    *   **Subtask 2.2:** Implement the call to Cohere Rerank API using the retrieved chunk texts and the original query.
    *   **Subtask 2.3:** Process the reranker's response to re-order and select the final set of chunks.
3.  **Update `retrieveContextAndSources`** - Complexity: 2
    *   [ ] The `retrieveContextAndSources` function in `app/api/chat/route.ts` will now use this enhanced retrieval logic (which includes reranking).
    *   The `ChatSource` objects it prepares for the frontend should now be based on the *reranked and selected* top N chunks. The `similarityScore` in `ChatSource` could now be the reranker's `relevance_score`.
4.  **Considerations for Multimodal Reranking (Future)** - Complexity: 1 (Conceptual)
    *   [ ] Cohere's rerank models can sometimes handle multimodal inputs or work with text representations of images.
    *   [ ] For this slice, we will focus on reranking the *text chunks*. If you also retrieved images in the initial step, you could:
        *   Pass textual descriptions of these images (if available from ADE or metadata) to the reranker along with text chunks.
        *   Or, keep the image retrieval separate and combine reranked text with top images using a simpler heuristic for now.
        *   The PRD mentions "Cohere Rerank for relevance optimization across text and visual content." This implies the reranker itself might handle multimodal aspects or that you apply reranking to both text and image search results separately and then fuse.
        *   **For this slice: Rerank text chunks only.** Images will still be retrieved by initial vector similarity to the text query.
5.  **Configuration and Model Selection** - Complexity: 1
    *   [ ] Make the reranker model name and the `top_n` parameter for reranking configurable (e.g., via environment variables or constants).
6.  **Write Tests** - Complexity: 2
    *   [ ] **Retrieval Logic:** Unit test the new retrieval flow. Mock the initial vector search and the Cohere Rerank API call. Verify that chunks are correctly prepared for reranking and that the reranker's output is used to select the final context.
    *   [ ] Test edge cases (e.g., fewer initial results than `top_n` for reranker).

**Code Example (Conceptual update to retrieval logic, e.g., in a service function):**
```typescript
// lib/retrieval-service.ts (New or refactored from search-chunks API)
import { db } from '@/lib/db';
import {
  documentChunks as documentChunksTable,
  documentEmbeddings as documentEmbeddingsTable,
  // ... documentImagesTable if also handling images here
} from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { embed } from 'ai';
import { cohere as cohereAISDKClient } from '@ai-sdk/cohere'; // For embedding
import { CohereClient } from 'cohere-ai'; // For rerank using the cohere-ai SDK

const cohereRerankClient = new CohereClient({ token: process.env.COHERE_API_KEY });

const COHERE_EMBEDDING_MODEL = "embed-v4.0";
const COHERE_EMBEDDING_DIMENSIONS = 1024;
const COHERE_RERANK_MODEL = process.env.COHERE_RERANK_MODEL || "rerank-english-v3.0"; // Or multilingual
const INITIAL_RETRIEVAL_TOP_K = 25; // Fetch more initially
const RERANK_TOP_N = 5; // How many results to get back from reranker and use for LLM

interface RetrievedChunk {
  id: string;
  content: string;
  chunkIndex: number;
  documentId: string;
  originalSimilarityScore?: number; // From vector search
  // Add other fields like documentOriginalName if fetched
}

export async function searchAndRerank(
  query: string,
  documentId?: string
): Promise<{ rerankedTextChunks: RetrievedChunk[], imageResults: any[] }> { // Define imageResults type
  // 1. Embed the user query
  const { embedding: queryEmbedding } = await embed({
    model: cohereAISDKClient.embedding(COHERE_EMBEDDING_MODEL, { dimensions: COHERE_EMBEDDING_DIMENSIONS }),
    value: query,
  });
  if (!queryEmbedding) throw new Error('Failed to embed query');
  const queryEmbeddingString = `[${queryEmbedding.join(',')}]`;
  const distanceMetric = sql`embedding <=> ${queryEmbeddingString}::vector`;

  // 2. Initial Broad Vector Search for Text Chunks
  const initialTextChunks: RetrievedChunk[] = await db.select({
    id: documentChunksTable.id,
    content: documentChunksTable.content,
    chunkIndex: documentChunksTable.chunkIndex,
    documentId: documentChunksTable.documentId,
    originalSimilarityScore: sql<number>`1 - (${distanceMetric})`
  })
  .from(documentChunksTable)
  .innerJoin(documentEmbeddingsTable, eq(documentChunksTable.id, documentEmbeddingsTable.chunkId))
  .where(sql`${documentEmbeddingsTable.embeddingType} = 'text' ${documentId ? sql`AND ${documentChunksTable.documentId} = ${documentId}` : sql``}`)
  .orderBy(distanceMetric)
  .limit(INITIAL_RETRIEVAL_TOP_K);

  if (initialTextChunks.length === 0) {
    return { rerankedTextChunks: [], imageResults: [] }; // Or handle image search separately
  }

  // 3. Prepare documents for Reranker
  const documentsToRerank = initialTextChunks.map(chunk => ({ text: chunk.content }));
  // Note: Cohere rerank API might have a limit on the number of documents (e.g., 1000).
  // And total size of documents.

  // 4. Call Cohere Rerank API
  let rerankedTextChunks: RetrievedChunk[] = initialTextChunks; // Default to initial if rerank fails or not enough results

  if (documentsToRerank.length > 0) {
    try {
      const rerankResponse = await cohereRerankClient.rerank({
        model: COHERE_RERANK_MODEL,
        query: query,
        documents: documentsToRerank,
        topN: RERANK_TOP_N, // Ask reranker to return top N
      });

      // 5. Process Reranked Results
      const topRerankedDocs: RetrievedChunk[] = [];
      if (rerankResponse.results) {
        for (const rerankedResult of rerankResponse.results) {
          // rerankedResult.index refers to the original index in `documentsToRerank`
          const originalChunk = initialTextChunks[rerankedResult.index];
          if (originalChunk) {
            topRerankedDocs.push({
              ...originalChunk,
              // Replace original similarity score with reranker's relevance score
              // The reranker's relevance_score is what matters now.
              // We might not even need to name it similarityScore, but relevanceScore.
              originalSimilarityScore: rerankedResult.relevanceScore, // Using the same field for simplicity
            });
          }
        }
        rerankedTextChunks = topRerankedDocs;
      }
    } catch (rerankError) {
      console.error("Cohere Rerank API error:", rerankError);
      // Fallback: use top N from initial vector search if rerank fails
      rerankedTextChunks = initialTextChunks.slice(0, RERANK_TOP_N);
    }
  } else {
     rerankedTextChunks = [];
  }


  // TODO: Perform image search (as in Slice 10) - this part is not reranked in this iteration
  // For now, image search remains separate and uses its own vector similarity
  const imageResults: any[] = []; // Placeholder for image search results from Slice 10 logic

  return { rerankedTextChunks, imageResults };
}
```

**Using the service in `app/api/chat/route.ts` (`retrieveContextAndSources`):**
```typescript
// app/api/chat/route.ts
// ...
// async function retrieveContextAndSources(query: string, documentId?: string): Promise<{ contextText: string, sources: ChatSource[] }> {
//   const { rerankedTextChunks, imageResults } = await searchAndRerank(query, documentId); // Call the new service

//   const sources: ChatSource[] = [];
//   // Populate sources from rerankedTextChunks
//   for (const textRes of rerankedTextChunks) {
//     sources.push({
//       type: 'text',
//       id: textRes.id,
//       documentId: textRes.documentId,
//       documentOriginalName: "Fetched Doc Name", // Fetch or pass document name
//       contentSnippet: textRes.content.substring(0, 200) + "...",
//       similarityScore: textRes.originalSimilarityScore, // This is now the rerank score
//       chunkIndex: textRes.chunkIndex,
//     });
//   }
//   // Populate sources from imageResults (as in Slice 10)
//   // ...

//   const contextText = rerankedTextChunks.map(r => r.content).join("\n---\n");
//   return { contextText, sources };
// }
// ...
```
**Note:** The `searchAndRerank` function above focuses on reranking text. Image retrieval would still happen as in Slice 10 (vector search text-to-image) and its results would be returned alongside the reranked text. The PRD's "reranking ... across text and visual content" is an advanced step; this slice focuses on significantly improving text relevance first.

**Ready to Merge Checklist:**
*   [ ] Cohere SDK (`cohere-ai`) installed and configured for rerank API calls.
*   [ ] Retrieval logic updated to:
    *   Fetch a larger initial set of text chunks via vector search.
    *   Call Cohere Rerank API with these chunks and the query.
    *   Process reranked results to select the final top N chunks for LLM context.
*   [ ] `retrieveContextAndSources` function in the chat API uses the new reranked results.
*   [ ] `ChatSource` objects passed to the frontend reflect the reranked chunks and their relevance scores.
*   [ ] Configuration for reranker model and `top_n` is in place.
*   [ ] Text-based chat responses are noticeably more relevant for queries where initial vector search might have returned mixed-quality results.
*   [ ] Image retrieval part of the search remains functional (not reranked in this slice, but still retrieved).
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **Cohere Rerank API Documentation:** [https://docs.cohere.com/reference/rerank](https://docs.cohere.com/reference/rerank). Check latest model names, request/response structure, and limits (number of documents, total text size).
*   **`cohere-ai` Node.js SDK:** Examples for using the rerank endpoint.
*   **Impact of reranking on retrieval latency:** Reranking adds an extra API call. Consider its performance implications.

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm adding Cohere Rerank to my RAG pipeline after an initial vector search. Explain the typical workflow: how many documents should I fetch from vector search to pass to the reranker? What are the key parameters for the Cohere Rerank API call (e.g., `model`, `top_n`, `documents` structure)? How do I interpret the `relevance_score` and use it to select the final context for my LLM? Provide a Node.js code snippet using the `cohere-ai` SDK."*

**Questions for Senior Dev:**
*   [ ] What are good default values for `INITIAL_RETRIEVAL_TOP_K` (for vector search) and `RERANK_TOP_N` (for the reranker output)? How do these affect overall quality vs. latency?
*   [ ] The PRD mentions "Cohere Rerank v3.0" and the code example uses "rerank-v3.5". Which specific model should we target (e.g., `rerank-english-v3.0` or `rerank-multilingual-v3.0` or a newer one if available)?
*   [ ] For this slice, we're only reranking text chunks. How would we approach reranking or combining image search results more effectively in a future iteration, aligning with "reranking ... across text and visual content"?
*   [ ] Are there any error handling patterns specific to the rerank API we should be aware of (e.g., if input documents are too long or too many)?

---

Integrating a reranker is a powerful way to boost the quality of your RAG system. The LLM will receive more pertinent information, leading to better and more accurate answers. This slice significantly enhances the "Intelligence" of your chat application.