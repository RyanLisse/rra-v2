Excellent! We've successfully processed documents into text chunks and their corresponding vector embeddings. Now, let's build the "Retrieval" part of our RAG system. This slice will focus on taking a user's query, embedding it, and then searching our NeonDB (PGVector) database for the most similar document chunks.

---

### Slice 6: Query Embedding & Vector Similarity Search

**What You're Building:**
*   Setting up an HNSW index on the `embedding` column in the `document_embeddings` table for efficient similarity search.
*   An API endpoint that takes a user query and a `documentId` (to scope search initially), embeds the query using Cohere, and performs a vector similarity search against the stored document chunk embeddings.
*   Modifying the existing chat API (`app/api/chat/route.ts`) to call this new search service to retrieve context before generating a response with the LLM.

**Tasks:**

1.  **Create HNSW Index in Database** - Complexity: 2
    *   [ ] You need to add an HNSW (Hierarchical Navigable Small World) index to your `embedding` column in the `document_embeddings` table for fast and efficient similarity searches. This is typically done via a new Drizzle migration or directly in your NeonDB SQL console.
    *   **Migration Approach (Recommended):**
        *   Create a new migration file manually in your `drizzle` folder (e.g., `meta/000X_snapshot.json` and `000X_add_hnsw_index.sql`).
        *   In the `.sql` file, add:
            ```sql
            CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON document_embeddings USING hnsw (embedding vector_cosine_ops);
            -- Or for inner product: (embedding vector_ip_ops)
            -- Or for L2 distance: (embedding vector_l2_ops)
            -- Cosine is common for semantic similarity with Cohere embeddings.
            -- Consult Cohere/PGVector docs for best operator with embed-v4.0.
            -- The PRD example uses vector_cosine_ops.
            ```
        *   Update the snapshot if your `drizzle-kit` version requires it.
        *   Run `bun run db:migrate`.
    *   **Direct SQL Approach (Simpler for one-off):**
        *   Connect to your NeonDB instance via its SQL editor.
        *   Execute: `CREATE EXTENSION IF NOT EXISTS vector;` (if not already done).
        *   Execute: `CREATE INDEX IF NOT EXISTS idx_document_embeddings_embedding_hnsw ON document_embeddings USING hnsw (embedding vector_cosine_ops);`
        *   (Make sure the table and column names match your schema exactly).
2.  **Create API Route for Semantic Search** - Complexity: 4
    *   [ ] Create `app/api/documents/search-chunks/route.ts`.
    *   [ ] Implement a `POST` handler that expects a `query` (string) and optionally a `documentId` (string, to scope search to a specific document for now).
    *   **Subtask 2.1:** API route setup, parse `query` and `documentId`. - Complexity: 1
    *   **Subtask 2.2:** Embed the user's `query` using `embed` from the `ai` SDK with `cohere.embedding("embed-v4.0", { dimensions: 1024 })`. - Complexity: 2
    *   **Subtask 2.3:** Construct a Drizzle ORM query to perform a similarity search.
        *   You'll need to use a raw SQL fragment or a Drizzle helper if available for vector distance functions (e.g., `<=>` for cosine distance with `vector_cosine_ops`).
        *   The query should select relevant fields from `document_chunks` (like `content`, `chunkIndex`) by joining `document_embeddings` with `document_chunks`.
        *   Filter by `documentId` if provided.
        *   Order by similarity (distance) and limit the results (e.g., top 3-5 chunks).
        *   Example Drizzle with raw SQL for similarity:
            ```typescript
            import { sql } from 'drizzle-orm';
            // ...
            const queryEmbeddingString = `[${queryEmbedding.join(',')}]`;
            const similarChunks = await db.select({
                // Select fields from documentChunksTable
                id: documentChunksTable.id,
                content: documentChunksTable.content,
                chunkIndex: documentChunksTable.chunkIndex,
                documentId: documentChunksTable.documentId,
                // Optionally, calculate and select the distance/similarity score
                similarity: sql<number>`1 - (document_embeddings.embedding <=> ${queryEmbeddingString}::vector)`
                // or distance: sql<number>`document_embeddings.embedding <=> ${queryEmbeddingString}::vector`
            })
            .from(documentChunksTable)
            .innerJoin(documentEmbeddingsTable, eq(documentChunksTable.id, documentEmbeddingsTable.chunkId))
            .where(documentId ? eq(documentChunksTable.documentId, documentId) : undefined) // Optional document scoping
            .orderBy(sql`document_embeddings.embedding <=> ${queryEmbeddingString}::vector ASC`) // ASC for distance (smaller is better)
            .limit(5);
            ```
        *   Complexity: 3
3.  **Integrate Search into Chat API** - Complexity: 3
    *   [ ] Modify `app/api/chat/route.ts` (the one based on Vercel AI Chatbot template).
    *   [ ] Before calling the LLM (`streamText` or similar), if a `documentId` is part of the chat context (you'll need to pass this from the frontend chat state):
        *   Get the last user message as the query.
        *   Call your new `/api/documents/search-chunks` endpoint (or call the service function directly if refactored).
        *   Take the content of the retrieved chunks and prepend them to the system prompt or as part of the user's message to provide context to the LLM.
        *   Example prompt augmentation:
            ```
            System: You are a helpful assistant. Answer the user's question based on the following document excerpts. If the answer is not in the excerpts, say "I couldn't find an answer in the provided documents."

            Document Excerpts:
            [Chunk 1 content]
            ---
            [Chunk 2 content]
            ---
            [Chunk 3 content]

            User: [User's actual query]
            ```
    *   **Subtask 3.1:** Adapt the chat API to accept/manage `documentId` state. - Complexity: 1
    *   **Subtask 3.2:** Call the search service and get context. - Complexity: 1
    *   **Subtask 3.3:** Augment the prompt/messages for the LLM with the retrieved context. - Complexity: 2
4.  **Update Frontend Chat Interface** - Complexity: 2
    *   [ ] The chat interface needs to know which document is currently "active" or being discussed.
    *   [ ] When a document is successfully processed (uploaded, text extracted, embeddings done), allow the user to "select" it for chat.
    *   [ ] Store the `documentId` of the active document in the chat component's state.
    *   [ ] When sending a chat message, include this `activeDocumentId` in the payload to `/api/chat/route.ts`.
5.  **Error Handling** - Complexity: 2
    *   [ ] Handle errors in the search API (e.g., query embedding failure, database search error).
    *   [ ] In the chat API, if context retrieval fails, gracefully fall back (e.g., inform the LLM that context is unavailable or proceed without it, depending on desired behavior).
6.  **Write Tests** - Complexity: 3
    *   [ ] **Backend Search API:** Mock Cohere API and DB. Test query embedding and the construction of the DB similarity search query. Test that it returns mock chunks.
    *   [ ] **Chat API Integration:** Test that the chat API calls the search service and that the LLM prompt is augmented correctly with mock context.

**Code Example (`app/api/documents/search-chunks/route.ts`):**
```typescript
// app/api/documents/search-chunks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  documentChunks as documentChunksTable,
  documentEmbeddings as documentEmbeddingsTable
} from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { embed } from 'ai';
import { cohere } from '@ai-sdk/cohere';

const COHERE_EMBEDDING_MODEL = "embed-v4.0";
const COHERE_EMBEDDING_DIMENSIONS = 1024;
const SIMILARITY_THRESHOLD = 0.7; // Example: 1 - distance, so higher is better. Adjust based on distance metric.
const TOP_K_RESULTS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, documentId, topK = TOP_K_RESULTS } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query string is required' }, { status: 400 });
    }

    // 1. Embed the user query
    const { embedding: queryEmbedding } = await embed({
      model: cohere.embedding(COHERE_EMBEDDING_MODEL, { dimensions: COHERE_EMBEDDING_DIMENSIONS }),
      value: query,
    });

    if (!queryEmbedding) {
      return NextResponse.json({ error: 'Failed to embed query' }, { status: 500 });
    }

    const queryEmbeddingString = `[${queryEmbedding.join(',')}]`;

    // 2. Perform similarity search
    // Using <=> (cosine distance) from pgvector. Smaller distance = more similar.
    // Similarity = 1 - distance (for cosine distance)
    const distanceMetric = sql`document_embeddings.embedding <=> ${queryEmbeddingString}::vector`; // Cosine Distance

    const similarChunks = await db.select({
      id: documentChunksTable.id,
      content: documentChunksTable.content,
      chunkIndex: documentChunksTable.chunkIndex,
      documentId: documentChunksTable.documentId,
      // Calculate similarity: 1 - cosine_distance. Higher is better.
      // For L2 distance, similarity might be 1 / (1 + distance) or exp(-distance).
      similarityScore: sql<number>`1 - (${distanceMetric})`
    })
    .from(documentChunksTable)
    .innerJoin(documentEmbeddingsTable, eq(documentChunksTable.id, documentEmbeddingsTable.chunkId))
    .where(
      documentId
        ? eq(documentChunksTable.documentId, documentId) // Scope to a document if ID provided
        : undefined // Or search across all documents if no documentId
    )
    .orderBy(distanceMetric) // Order by distance ASC (most similar first)
    .limit(topK);
    // Optionally filter by similarityScore after retrieval if needed, or in SQL if supported well:
    // .having(sql`1 - (${distanceMetric}) > ${SIMILARITY_THRESHOLD}`)

    return NextResponse.json({ results: similarChunks }, { status: 200 });

  } catch (error: any) {
    console.error("Error searching chunks:", error);
    return NextResponse.json({ error: 'Failed to search chunks', details: error.message }, { status: 500 });
  }
}
```

**Code Example (Simplified `app/api/chat/route.ts` modification):**
```typescript
// app/api/chat/route.ts
// ... (existing imports from Vercel AI Chatbot, like streamText, OpenAI, etc.)
// Replace OpenAI with Google Gemini as per PRD
import { google } from '@ai-sdk/google-vertexai'; // Or @ai-sdk/google
import { streamText, CoreMessage } from 'ai';
import { z } from 'zod'; // For tool definition if using Vercel AI SDK tools

// Assume this function calls your new search API or a direct service function
async function retrieveContextForChat(query: string, documentId?: string): Promise<string> {
  if (!documentId) return ""; // No document context if no ID

  try {
    // In a real app, you might call this via fetch or a direct service import
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/documents/search-chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documentId, topK: 3 }), // Fetch top 3 chunks
    });
    if (!response.ok) {
      console.error("Failed to retrieve context:", await response.text());
      return "";
    }
    const searchResult = await response.json();
    if (searchResult.results && searchResult.results.length > 0) {
      return searchResult.results
        .map((r: { content: string }) => r.content)
        .join("\n---\n"); // Join chunks with a separator
    }
    return "";
  } catch (error) {
    console.error("Error retrieving context for chat:", error);
    return "";
  }
}

export async function POST(req: Request) {
  const { messages, data } = await req.json(); // Vercel AI SDK often uses `data` for custom payload
  const activeDocumentId = data?.documentId; // Assuming documentId is passed in `data`

  const lastUserMessage = messages.findLast((m: CoreMessage) => m.role === 'user');
  let retrievedContext = "";
  if (lastUserMessage && activeDocumentId) {
    retrievedContext = await retrieveContextForChat(String(lastUserMessage.content), activeDocumentId);
  }

  const systemPrompt = `You are a helpful assistant. Answer the user's question based ONLY on the following document excerpts. If the answer is not in the excerpts or the excerpts are irrelevant, say "I couldn't find an answer in the provided document excerpts for that query." Do not use any external knowledge.
---
DOCUMENT EXCERPTS:
${retrievedContext || "No relevant excerpts found for this query in the document."}
---`;

  // Prepend system prompt
  const messagesWithContext: CoreMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const result = await streamText({
    model: google('gemini-1.5-flash-latest'), // Using Gemini as per PRD
    messages: messagesWithContext,
    // tools: { ... } // If you were to use tools for retrieval, that's an alternative
  });

  return result.toDataStreamResponse();
}
```

**Frontend Update `components/chat/chat.tsx` (or similar in Vercel AI Chatbot):**
*   You'll need a way to select an "active" document (e.g., from a list of processed documents).
*   Store `activeDocumentId` in state.
*   When `useChat` (from `ai/react`) makes a request, pass `activeDocumentId` in the `body` or `data` field.
    ```typescript
    // Example in your chat component where `useChat` is used
    const { messages, input, handleInputChange, handleSubmit } = useChat({
      // ... other options
      body: { // Pass custom data here
        documentId: activeDocumentId, // Your state variable
      },
      // or `data: { documentId: activeDocumentId }` if using a newer Vercel AI SDK pattern
    });
    ```

**Ready to Merge Checklist:**
*   [ ] HNSW index created on `document_embeddings.embedding` column in NeonDB.
*   [ ] API route `/api/documents/search-chunks` successfully:
    *   Embeds the query.
    *   Performs similarity search using Drizzle ORM and PGVector operator.
    *   Returns relevant chunks.
*   [ ] Chat API (`/api/chat/route.ts`) calls the search service and augments the LLM prompt with retrieved context.
*   [ ] Frontend chat interface allows selecting an active document and passes its `documentId` to the chat API.
*   [ ] Chat responses are now (attempting to be) based on the content of the selected document.
*   [ ] Error handling is in place.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: User can ask questions about a selected document, and the system retrieves relevant chunks to inform the LLM's answer.

**Quick Research (5-10 minutes):**
*   **PGVector Indexing (HNSW):** [https://github.com/pgvector/pgvector#indexing](https://github.com/pgvector/pgvector#indexing). Understand `lists`, `ef_construction`, `ef_search` parameters if you need to tune later.
*   **PGVector Distance Operators:** `<->` (L2), `<#>` (inner product), `<=>` (cosine distance). Confirm which is best for Cohere `embed-v4.0`. (Cosine distance `<=>` is typical).
*   **Drizzle ORM with Raw SQL:** [https://orm.drizzle.team/docs/sql](https://orm.drizzle.team/docs/sql) for how to incorporate vector search operators.
*   **Vercel AI SDK `useChat` `body` option:** Check docs for passing custom data.
*   **Prompt Engineering for RAG:** Search for "best system prompts for RAG" or "contextual prompting for LLMs".

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm implementing vector similarity search with PGVector and Drizzle ORM. How do I correctly use distance operators like `<=>` (cosine distance) in my Drizzle queries? Explain how to select data from one table (`document_chunks`) while ordering by distance calculated on a joined table (`document_embeddings`). Show a complete Drizzle query example."*
*   **Research Prompt:** *"How do I effectively pass custom data, like an `activeDocumentId`, from my Next.js frontend using `useChat` (from `ai/react`) to my backend API route? Explain the `body` or `data` option in `useChat`."*

**Questions for Senior Dev:**
*   [ ] What's a good default for `TOP_K_RESULTS` and `SIMILARITY_THRESHOLD` to start with? How can we make these configurable later?
*   [ ] The current search is scoped to a single `documentId`. The PRD mentions "Hybrid Multimodal Search" across all documents later. Is this single-document search a good first step? (Yes, it's a good simplification for now).
*   [ ] How should the system behave if no relevant chunks are found above a certain similarity threshold? (Current prompt handles this by saying "No relevant excerpts...").
*   [ ] Is the HNSW index creation via a manual SQL migration step okay, or should `drizzle-kit` handle this more directly if possible? (Manual SQL for `CREATE INDEX USING` is common).

---

This is a major milestone! With this slice, the core RAG loop (Retrieve -> Augment -> Generate) is functional for text-based queries on single documents. Future slices will build on this by adding UI for citations, multimodal capabilities, and more advanced features like reranking and workflow-based processing.