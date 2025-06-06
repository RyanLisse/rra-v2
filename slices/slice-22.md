Okay, we've covered a lot of ground, from basic setup and document processing to multimodal RAG, authentication, and initial performance/quality measures. The PRD is quite comprehensive.

Let's look at the remaining high-level requirements and pick a slice that adds significant value and aligns with an "enterprise-ready" application. The PRD mentions:
*   **Caching Layer**: "Redis + in-memory for embeddings and processed images" (We did basic in-memory for query embeddings in Slice 16).
*   **Testing**: "DeepEval Integration: Semantic similarity and LLM rubric testing with visual content" (We did initial text-based DeepEval in Slice 20).
*   **Advanced Visual Features** (OCR enhancement, Chart Understanding).
*   **AI Improvements** (Custom Vision Models, Advanced Reasoning, Feedback Learning).
*   **Deployment & Infrastructure** aspects.

Given the current state, **integrating Redis for a more robust caching layer** seems like a logical next step for performance and scalability, directly addressing a specific technical architecture component. This will be more resilient than the simple in-memory cache, especially in serverless environments.

---

### Slice 23: Integrating Redis for Caching

**What You're Building:**
*   Setting up a Redis instance (e.g., using a free tier from a cloud provider like Upstash, or a local Docker container for development).
*   Integrating a Redis client library into the Next.js application.
*   Refactoring the existing in-memory cache for query embeddings (from Slice 16) to use Redis.
*   Identifying another candidate for caching and implementing it with Redis (e.g., caching the results of `getDocumentDetails` from Slice 15, or caching processed image paths for a document).

**Tasks:**

1.  **Set up Redis Instance** - Complexity: 2
    *   **Cloud Option (Recommended for ease):**
        *   Sign up for a free tier on a managed Redis provider like Upstash ([https://upstash.com/](https://upstash.com/)).
        *   Create a Redis database and get your connection URL/credentials (host, port, password).
    *   **Local Docker Option (for Development):**
        *   If you have Docker, run: `docker run -d -p 6379:6379 --name my-redis redis`
        *   Connection URL will be `redis://localhost:6379`.
    *   [ ] Add Redis connection details to `.env.local`:
        *   `REDIS_URL="your_redis_connection_url"` (e.g., `redis://:[password]@[host]:[port]` for Upstash)
        *   Or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` separately.
2.  **Install Redis Client Library** - Complexity: 1
    *   [ ] We'll use `ioredis`, a popular and robust Node.js Redis client.
    *   `bun add ioredis`
3.  **Create Redis Client Singleton** - Complexity: 2
    *   [ ] Create a utility file (e.g., `lib/redis.ts`) to initialize and export a singleton Redis client instance.
        ```typescript
        // lib/redis.ts
        import Redis from 'ioredis';
        import logger from './logger'; // Your Pino logger

        let redis: Redis | null = null;

        if (process.env.REDIS_URL) {
          try {
            redis = new Redis(process.env.REDIS_URL, {
              maxRetriesPerRequest: 3, // Optional: configure retries
              // tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined, // For Upstash with TLS
              lazyConnect: true, // Connect on first command
            });

            redis.on('connect', () => {
              logger.info('Successfully connected to Redis.');
            });
            redis.on('error', (err) => {
              logger.error({ err }, 'Redis connection error. Caching will be disabled for this instance.');
              // Potentially implement a circuit breaker or disable caching features if Redis is down.
              // For simplicity, commands might just fail.
            });
          } catch (error) {
            logger.error({ error }, 'Failed to initialize Redis client. Caching will be disabled.');
            redis = null; // Ensure redis is null if initialization fails
          }
        } else {
          logger.warn('REDIS_URL not found in environment. Redis caching will be disabled.');
        }

        export default redis; // Export the client instance (can be null)
        ```4.  **Refactor Query Embedding Cache to Use Redis** - Complexity: 3
    *   [ ] Modify the `getQueryEmbedding` helper function (from Slice 16, likely in `lib/retrieval-service.ts` or similar).
    *   [ ] Instead of `node-cache` or `Map`, use `ioredis` commands:
        *   `redis.get(cacheKey)`
        *   `redis.set(cacheKey, JSON.stringify(embedding), 'EX', 300)` (EX for seconds TTL, e.g., 300 for 5 mins)
    *   [ ] Handle cases where `redis` client is `null` (i.e., Redis is unavailable) – gracefully fall back to no caching or log a warning.
    *   [ ] Remember to `JSON.stringify` when setting complex objects (like an array of numbers for embeddings) and `JSON.parse` when getting.
5.  **Identify and Implement a Second Cache Candidate** - Complexity: 3
    *   [ ] **Candidate 1: `getDocumentDetails` (from Slice 15)**
        *   The result of `getDocumentDetails(documentId)` includes document metadata and a list of its images. This data changes less frequently once a document is processed.
        *   Cache key: `document_details:${documentId}`.
        *   TTL: Longer, e.g., 1 hour or more, but needs invalidation if the document is deleted or reprocessed (see next task).
    *   [ ] **Candidate 2: Processed image paths for a document**
        *   If fetching just the list of image paths for a document is a common operation.
    *   **Decision:** Let's cache `getDocumentDetails`.
    *   [ ] In the `getDocumentDetails` server action:
        *   Before fetching from DB, check Redis.
        *   If found, parse and return.
        *   If not, fetch from DB, `JSON.stringify` the result, store in Redis with a TTL, then return.
6.  **Cache Invalidation Strategy (Basic)** - Complexity: 2
    *   [ ] For the `getDocumentDetails` cache:
        *   When a document is deleted via the `deleteDocument` server action (Slice 15), explicitly delete its cache entry from Redis: `redis.del(`document_details:${documentId}`)`.
        *   If you implement a "reprocess document" feature later, that would also need to invalidate this cache.
7.  **Configuration & Error Handling** - Complexity: 1
    *   [ ] Ensure Redis TTLs are configurable (constants or env vars).
    *   [ ] All Redis operations should be wrapped in `try...catch` blocks or handle potential errors from the `ioredis` client (e.g., if Redis is down). The singleton setup already includes basic error logging on connection. Functions using `redis` should check if `redis` is non-null.
8.  **Testing** - Complexity: 2
    *   [ ] **Integration Test (Manual or Automated):**
        *   Requires a running Redis instance (local Docker or cloud).
        *   Test the query embedding: make the same query twice; the second time should be faster and log a cache hit (if you add logging for hits/misses with Redis).
        *   Test `getDocumentDetails`: fetch details, then fetch again; verify cache hit. Delete the document, then try fetching details again (should be a cache miss, then a DB miss or error).
    *   [ ] **Unit Tests:** Mock the `ioredis` client for unit testing functions that use Redis.
        ```typescript
        // Example mocking ioredis in Vitest
        // vi.mock('ioredis', () => {
        //   const RedisMock = vi.fn();
        //   const mockInstance = {
        //     get: vi.fn(),
        //     set: vi.fn(),
        //     del: vi.fn(),
        //     on: vi.fn(), // Mock event listeners if your code uses them
        //     connect: vi.fn().mockResolvedValue(undefined), // If using lazyConnect and manual connect
        //   };
        //   RedisMock.mockReturnValue(mockInstance);
        //   return { default: RedisMock, ...mockInstance }; // Export default and instance methods
        // });
        // Then in your test:
        // import redisClient from '@/lib/redis'; // Your singleton
        // (redisClient as any).get.mockResolvedValue(null); // Mock specific calls
        ```

**Code Example (`lib/redis.ts` - shown in Task 3)**

**Code Example (Refactoring `getQueryEmbedding` to use Redis):**
```typescript
// lib/retrieval-service.ts (or wherever query embedding generation is)
import redis from '@/lib/redis'; // Your Redis client singleton
import logger from '@/lib/logger';
// ... (embed, cohereAISDKClient, COHERE_EMBEDDING_MODEL, COHERE_EMBEDDING_DIMENSIONS)

const QUERY_EMBEDDING_CACHE_TTL_SECONDS = 300; // 5 minutes

async function getQueryEmbeddingWithRedis(query: string): Promise<number[] | null> { // Return null if generation fails
  if (!redis) { // Redis unavailable, proceed without cache
    logger.warn("Redis client unavailable, skipping cache for query embedding.");
    const { embedding } = await embed({ /* ... */ value: query });
    return embedding || null;
  }

  const cacheKey = `query_embedding_v2:${query}`; // v2 to avoid conflict with old in-memory if any
  try {
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      logger.info({ cacheKey, cache: 'hit' }, "Query embedding cache hit");
      logMetric({ name: 'my_app.cache.hit_count', value: 1, tags: { cacheName: 'query_embedding' }});
      return JSON.parse(cachedData) as number[];
    }
  } catch (err) {
    logger.error({ err, cacheKey }, "Redis GET error for query embedding. Proceeding without cache.");
  }

  logger.info({ cacheKey, cache: 'miss' }, "Query embedding cache miss");
  logMetric({ name: 'my_app.cache.miss_count', value: 1, tags: { cacheName: 'query_embedding' }});

  const { embedding } = await embed({
    model: cohereAISDKClient.embedding(COHERE_EMBEDDING_MODEL, { dimensions: COHERE_EMBEDDING_DIMENSIONS }),
    value: query,
  });

  if (!embedding) {
    logger.error({ query }, "Failed to generate query embedding.");
    return null;
  }

  try {
    await redis.set(cacheKey, JSON.stringify(embedding), 'EX', QUERY_EMBEDDING_CACHE_TTL_SECONDS);
    logger.debug({ cacheKey }, "Query embedding cached in Redis.");
  } catch (err) {
    logger.error({ err, cacheKey }, "Redis SET error for query embedding.");
    // Proceed with the generated embedding even if caching fails
  }
  return embedding;
}

// In your searchAndRerank or similar function:
// const queryEmbedding = await getQueryEmbeddingWithRedis(query);
// if (!queryEmbedding) {
//   throw new Error('Failed to get or generate query embedding');
// }
```

**Code Example (Caching `getDocumentDetails` server action):**
```typescript
// app/lib/documents/actions.tsx
// import redis from '@/lib/redis';
// import logger from '@/lib/logger';
// import { logMetric } from '@/lib/metric-logger'; // From Slice 21

const DOC_DETAILS_CACHE_TTL_SECONDS = 3600; // 1 hour

// export async function getDocumentDetails(documentId: string, userId?: string): Promise<DocumentDetailView | null> {
//   const targetUserId = userId || MOCK_USER_ID; // Replace with actual session userId
//   const cacheKey = `doc_details_v1:${documentId}:${targetUserId}`;

//   if (redis) {
//     try {
//       const cachedData = await redis.get(cacheKey);
//       if (cachedData) {
//         logger.info({ cacheKey, cache: 'hit', documentId }, "Document details cache hit");
//         logMetric({ name: 'my_app.cache.hit_count', value: 1, tags: { cacheName: 'document_details' }});
//         return JSON.parse(cachedData) as DocumentDetailView;
//       }
//       logMetric({ name: 'my_app.cache.miss_count', value: 1, tags: { cacheName: 'document_details' }});
//     } catch (err) {
//       logger.error({ err, cacheKey, documentId }, "Redis GET error for document details. Fetching from DB.");
//     }
//   }

//   // ... (actual DB fetching logic from Slice 15 for getDocumentDetails) ...
//   // const documentDetailFromDb = await db.query.documents.findFirst({ ... });

//   if (documentDetailFromDb && redis) {
//     try {
//       await redis.set(cacheKey, JSON.stringify(documentDetailFromDb), 'EX', DOC_DETAILS_CACHE_TTL_SECONDS);
//       logger.info({ cacheKey, documentId }, "Document details cached in Redis.");
//     } catch (err) {
//       logger.error({ err, cacheKey, documentId }, "Redis SET error for document details.");
//     }
//   }
//   return documentDetailFromDb;
// }

// In deleteDocument server action:
// export async function deleteDocument(documentId: string, userId?: string): Promise<{ success: boolean; message?: string }> {
//   const targetUserId = userId || MOCK_USER_ID;
//   // ... (file deletion logic) ...
//   // ... (DB deletion logic) ...

//   if (redis) {
//     const cacheKey = `doc_details_v1:${documentId}:${targetUserId}`;
//     try {
//       await redis.del(cacheKey);
//       logger.info({ cacheKey, documentId }, "Document details cache invalidated from Redis.");
//     } catch (err) {
//       logger.error({ err, cacheKey, documentId }, "Redis DEL error for document details cache.");
//     }
//   }
//   revalidatePath('/documents');
//   return { success: true };
// }
```

**Ready to Merge Checklist:**
*   [ ] Redis instance (Upstash or local Docker) is set up and connection URL configured in `.env.local`.
*   [ ] `ioredis` client library installed.
*   [ ] Singleton Redis client (`lib/redis.ts`) is implemented with basic connection and error handling.
*   [ ] Query embedding cache (from Slice 16) is refactored to use Redis, including TTL and fallback if Redis is unavailable.
*   [ ] At least one other cache candidate (e.g., `getDocumentDetails`) is implemented using Redis with appropriate TTL.
*   [ ] Basic cache invalidation strategy (e.g., `DEL` on document deletion) is implemented for the new cache.
*   [ ] Redis operations include error handling and checks for client availability.
*   [ ] Cache hit/miss metrics are logged (as in Slice 21).
*   [ ] Manual/integration testing confirms caching behavior (speed-up on second request, data served from cache) and invalidation.
*   [ ] Unit tests mock the Redis client for functions using it.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **`ioredis` API:** Common commands (`get`, `set`, `del`, `expire`, `exists`) and options (TTL with `EX` or `PX`). [https://github.com/luin/ioredis](https://github.com/luin/ioredis)
*   **Upstash Redis Documentation:** For connection string format and any specific client configurations.
*   **Redis Data Types:** Understand that Redis stores strings. Complex objects need `JSON.stringify`/`parse`.
*   **Cache Invalidation Strategies:** (e.g., TTL-based, explicit deletion, event-driven).

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm integrating Redis for caching in my Next.js application using `ioredis`. Show me how to: 1. Create a singleton Redis client with connection error handling. 2. Implement a caching wrapper for a function that fetches data from a database, using Redis `GET` and `SET EX` (with TTL). 3. Implement cache invalidation by deleting a specific key from Redis. How should I handle cases where Redis is temporarily unavailable?"*

**Questions for Senior Dev:**
*   [ ] What are good default TTL values for different types of cached data (query embeddings vs. document details)?
*   [ ] The current cache invalidation is explicit (on delete). For more complex scenarios (e.g., document content update, not just deletion), what are common patterns for cache invalidation with Redis? (e.g., write-through, write-around, using pub/sub for distributed invalidation).
*   [ ] If Redis becomes a critical dependency, what more advanced error handling or circuit breaker patterns should we consider for the Redis client?
*   [ ] The PRD mentions "Caching Layer: Redis + in-memory for embeddings and processed images." We've done Redis for query embeddings and document details. Should we also add an in-memory L1 cache in front of Redis for very hot data, or is Redis fast enough for these use cases? (Redis is generally very fast; L1 adds complexity).

---

Integrating Redis provides a significant boost to performance and scalability by reducing load on your database and external APIs (like Cohere for embeddings if queries are repeated). It's a key step towards a more production-ready system.