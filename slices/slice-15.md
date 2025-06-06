Okay, we've built a solid document management UI. The PRD mentions several "Technical Requirements" around **Performance & Scalability**, **Quality & Testing**, and **Monitoring & Observability**. While full implementation of all these is extensive, this slice will focus on laying some foundational pieces, specifically:

1.  **Basic Caching:** Implementing a simple caching layer for frequently accessed data that doesn't change often (e.g., document embeddings after they are processed). We'll start with in-memory caching.
2.  **Schema Validation with Zod:** Ensuring API inputs and outputs, and potentially critical data structures, are validated using Zod, as per the PRD.
3.  **Vitest Setup (Unit/Integration Testing Foundation):** If not already fully set up from earlier placeholder test tasks, ensure Vitest is configured and write a few more targeted tests for critical business logic.

---

### Slice 16: Foundations for Quality & Performance (Caching, Zod Validation, Vitest)

**What You're Building:**
*   A simple in-memory caching mechanism for a selected backend operation (e.g., fetching processed embeddings for a query).
*   Integrating Zod schemas to validate inputs for one or two critical API endpoints (e.g., chat API, document upload).
*   Ensuring Vitest is properly configured and adding a few more meaningful unit/integration tests.

**Tasks:**

1.  **Simple In-Memory Caching** - Complexity: 3
    *   [ ] Choose a piece of data or an operation that is a good candidate for caching. Example:
        *   When retrieving embeddings for a user's query in `/api/documents/search-chunks` (Slice 6/10), the query embedding itself could be cached if the same query is made frequently.
        *   Alternatively, if fetching *all* embeddings for a document to do client-side pre-filtering (not current design, but an example), those could be cached.
        *   **Let's choose to cache the *query embedding* for a short duration.**
    *   [ ] Use a simple in-memory store like a `Map` or a lightweight library like `node-cache` (`bun add node-cache`).
    *   [ ] In the relevant service/API route (e.g., where query embedding is generated in `searchAndRerank` or `search-chunks` API):
        *   Before generating an embedding for a query, check if it's in the cache.
        *   If found and not expired, use the cached embedding.
        *   If not found or expired, generate it, then store it in the cache with a Time-To-Live (TTL).
    *   **Subtask 1.1:** Install `node-cache` or prepare to use a `Map` with manual TTL.
    *   **Subtask 1.2:** Implement caching logic around the query embedding generation step.
    *   **Subtask 1.3:** Set a reasonable TTL (e.g., 5-10 minutes for query embeddings).
2.  **Zod Schema Validation** - Complexity: 3
    *   [ ] Install Zod: `bun add zod`.
    *   [ ] **Target API 1: Document Upload (`/api/documents/upload/route.ts`)**
        *   Define a Zod schema for the expected `multipart/form-data` (this is tricky with files, Zod is best for the metadata or JSON parts. For files, you'll still do manual checks for type/size, but Zod can validate other form fields if any).
        *   Or, more practically, validate the *parsed* file information (name, size, type) against Zod schema constraints *after* initial parsing.
    *   [ ] **Target API 2: Chat API (`/api/chat/route.ts`)**
        *   Define a Zod schema for the expected request body (`{ messages: CoreMessage[], data: { documentId?: string } }`).
        *   Validate the incoming request body against this schema at the beginning of the `POST` handler. Return a 400 error if validation fails.
    *   [ ] **Target API 3: Search Chunks API (`/api/documents/search-chunks/route.ts`)**
        *   Define a Zod schema for `{ query: string, documentId?: string, topK?: number }`.
        *   Validate the request body.
    *   **Subtask 2.1:** Create Zod schemas for the request bodies of the chosen APIs.
    *   **Subtask 2.2:** Integrate schema parsing and error handling into the API routes.
3.  **Vitest Setup and More Tests** - Complexity: 3
    *   [ ] If Vitest isn't fully configured from earlier slices (PRD mentions it), ensure it's set up:
        *   `bun add -D vitest @vitest/ui happy-dom` (happy-dom for frontend component testing if needed, or jsdom).
        *   Create `vitest.config.ts` (or `.js`):
            ```typescript
            // vitest.config.ts
            import { defineConfig } from 'vitest/config';
            import react from '@vitejs/plugin-react'; // If testing React components
            import path from 'path';

            export default defineConfig({
              plugins: [react()], // If needed
              test: {
                globals: true, // To use describe, it, expect globally
                environment: 'node', // Or 'jsdom'/'happy-dom' for frontend tests
                // setupFiles: ['./vitest.setup.ts'], // Optional setup file
                alias: { // To match tsconfig.json paths
                  '@': path.resolve(__dirname, './'),
                },
              },
            });
            ```
        *   Add test script to `package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:ui": "vitest --ui"`.
    *   [ ] **Write New Unit Tests:**
        *   **Chunking Logic (`lib/text-processing.ts`):** Add more diverse test cases for `simpleRecursiveChunker` (empty text, text smaller than chunk size, text exactly chunk size, text requiring multiple chunks, overlap behavior).
        *   **A Server Action (`app/lib/documents/actions.tsx`):** Pick one action (e.g., `getManagedDocuments`) and write a unit test for its logic, mocking the `db` calls.
        *   **An Inngest Function Step:** Test a specific step within an Inngest function (e.g., the data transformation part of `extractTextFn` before DB calls).
    *   **Subtask 3.1:** Finalize Vitest configuration.
    *   **Subtask 3.2:** Write unit tests for the chunking utility.
    *   **Subtask 3.3:** Write a unit test for a selected server action, mocking DB.
4.  **Code Quality (BiomeJS)** - Complexity: 1
    *   [ ] Ensure BiomeJS (formatter/linter) is run on all new and modified code in this slice.
    *   [ ] Add `bun run lint && bun run format` to a pre-commit hook if desired (e.g., using `husky`). (Optional for this slice, but good practice).

**Code Example (In-Memory Cache for Query Embeddings):**
```typescript
// lib/retrieval-service.ts (or wherever query embedding happens)
import NodeCache from 'node-cache';
// ... (other imports: embed, cohereAISDKClient)

const queryEmbeddingCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes
const COHERE_EMBEDDING_MODEL = "embed-v4.0";
const COHERE_EMBEDDING_DIMENSIONS = 1024;


// async function getQueryEmbedding(query: string): Promise<number[]> {
//   const cacheKey = `query_embedding:${query}`;
//   const cachedEmbedding = queryEmbeddingCache.get<number[]>(cacheKey);
//   if (cachedEmbedding) {
//     console.log("Cache hit for query embedding:", query.substring(0,20)+"...");
//     return cachedEmbedding;
//   }

//   console.log("Cache miss for query embedding, generating:", query.substring(0,20)+"...");
//   const { embedding } = await embed({
//     model: cohereAISDKClient.embedding(COHERE_EMBEDDING_MODEL, { dimensions: COHERE_EMBEDDING_DIMENSIONS }),
//     value: query,
//   });

//   if (!embedding) throw new Error('Failed to embed query');

//   queryEmbeddingCache.set(cacheKey, embedding);
//   return embedding;
// }

// In searchAndRerank:
// const { embedding: queryEmbedding } = await getQueryEmbedding(query); // Use this helper
```
**Note:** The `getQueryEmbedding` function needs to be defined and used where you currently call `embed` for the user's query.

**Code Example (Zod Validation in Chat API):**
```typescript
// app/api/chat/route.ts
import { z } from 'zod';
import { type CoreMessage } from 'ai'; // Or your specific Message type
// ...

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().optional(), // id might not be present on first user message from some clients
      role: z.enum(['user', 'assistant', 'system', 'function', 'tool']),
      content: z.string(),
      name: z.string().optional(),
      // experimental_tool_calls: z.any().optional(), // If using tools
      // tool_call_id: z.string().optional(),
      // data: z.any().optional(), // For Vercel AI SDK specific data messages
      // experimental_streamData: z.any().optional(), // This comes from server to client
      // createdAt: z.date().optional(), // Usually added by useChat
    })
  ).min(1),
  data: z.object({
    documentId: z.string().uuid().optional(), // Assuming documentId is a UUID
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const validationResult = ChatRequestSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json({ error: "Invalid request body", details: validationResult.error.format() }, { status: 400 });
    }

    const { messages, data } = validationResult.data;
    const activeDocumentId = data?.documentId;
    // ... rest of your chat logic
  } catch (error: any) {
    if (error instanceof SyntaxError) { // JSON parsing error
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

**Code Example (Vitest Test for `simpleRecursiveChunker`):**
```typescript
// lib/text-processing.test.ts
import { describe, it, expect } from 'vitest';
import { simpleRecursiveChunker, Chunk } from './text-processing'; // Adjust path

describe('simpleRecursiveChunker', () => {
  it('should return single chunk for short text', () => {
    const text = "Hello world.";
    const chunks = simpleRecursiveChunker(text, 100, 10);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].charCount).toBe(text.length);
  });

  it('should return empty array for empty text', () => {
    const text = "";
    const chunks = simpleRecursiveChunker(text, 100, 10);
    // Or expect it to return [{ content: "", charCount: 0 }] based on implementation
    expect(chunks).toHaveLength(1); 
    expect(chunks[0].content).toBe("");
  });

  it('should create multiple chunks for longer text', () => {
    const text = "This is a longer sentence that will definitely need to be split into multiple chunks for processing.";
    const chunkSize = 20;
    const chunkOverlap = 5;
    const chunks = simpleRecursiveChunker(text, chunkSize, chunkOverlap);
    
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeLessThanOrEqual(chunkSize);
    });
    // Check overlap: end of chunk 1 should overlap with start of chunk 2
    if (chunks.length > 1) {
      const endOfChunk1 = chunks[0].content;
      const startOfChunk2 = chunks[1].content;
      expect(endOfChunk1.endsWith(startOfChunk2.substring(0, chunkOverlap))).toBe(true);
    }
  });

  it('should handle text exactly matching chunk size', () => {
    const text = "12345678901234567890"; // 20 chars
    const chunks = simpleRecursiveChunker(text, 20, 5);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
  });

  it('should handle overlap correctly at the end', () => {
    const text = "abcde fghij klmno pqrst"; // 23 chars
    const chunkSize = 10;
    const chunkOverlap = 3;
    // Expected: "abcde fghi", "hij klmno", "mno pqrst"
    const chunks = simpleRecursiveChunker(text, chunkSize, chunkOverlap);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].content).toBe("abcde fghi");
    expect(chunks[1].content).toBe("hij klmno");
    expect(chunks[2].content).toBe("mno pqrst");
  });
});
```

**Ready to Merge Checklist:**
*   [ ] Simple in-memory caching implemented for query embeddings with a TTL.
*   [ ] Zod schemas defined and used for input validation in at least two critical API endpoints (e.g., chat, search). Invalid requests return 400 errors with details.
*   [ ] Vitest configuration (`vitest.config.ts`) is in place and test scripts (`"test"`, `"test:watch"`) work.
*   [ ] New meaningful unit tests written for `simpleRecursiveChunker` and at least one server action or Inngest function step, demonstrating DB/API mocking if applicable.
*   [ ] All existing and new tests pass (`bun test`).
*   [ ] Code has been formatted and linted with BiomeJS.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: Caching provides minor perf benefit (verifiable via logs), API inputs are validated, and test suite is growing.

**Quick Research (5-10 minutes):**
*   **`node-cache` library:** API for `set`, `get`, `ttl`.
*   **Zod documentation:** [https://zod.dev/](https://zod.dev/) (schemas for objects, arrays, strings, enums; `.safeParse()`, error formatting).
*   **Vitest documentation:** [https://vitest.dev/](https://vitest.dev/) (configuration, mocking, `describe`/`it`/`expect`).
*   **Mocking in Vitest:** `vi.mock()`, `vi.fn()`.

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm adding Zod validation to my Next.js API routes. Show me how to define a complex Zod schema for a request body that includes nested objects and arrays, and how to use `safeParse` to validate the incoming JSON, returning a detailed 400 error response if validation fails."*
*   **Research Prompt:** *"Explain how to write unit tests for a Next.js Server Action using Vitest, specifically focusing on how to mock Drizzle ORM database calls (`db.select`, `db.insert`, etc.) so the test doesn't hit a real database."*
*   **Research Prompt:** *"What are different caching strategies (in-memory, Redis, CDN) and when would I choose one over the other for a Next.js application? For in-memory caching in Node.js, what are common pitfalls (e.g., memory leaks, stale data, multi-instance issues)?"*

**Questions for Senior Dev:**
*   [ ] The current in-memory cache is instance-specific. For a multi-instance deployment (e.g., Vercel serverless functions), this cache won't be shared. Is this acceptable for now, or should we plan for Redis (as mentioned in PRD) sooner? (In-memory is fine for a start, Redis is a bigger step).
*   [ ] Which other API endpoints or internal functions are critical candidates for Zod validation next?
*   [ ] What's our target test coverage percentage (PRD mentions 80%+)? What types of tests (unit, integration, e2e, RAG eval) should we prioritize to reach that? (PRD also mentions DeepEval for RAG evaluation).

---

This slice strengthens the application's robustness and maintainability. While not directly user-facing features, these foundational elements are crucial for a production-grade application. The PRD also mentions DeepEval for RAG evaluation, which would be a more specialized testing slice later.