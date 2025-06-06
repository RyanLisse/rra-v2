Okay, we've established initial RAG evaluation with DeepEval, which is crucial for quality. The PRD also mentions specific performance targets and a comprehensive monitoring setup. While a full-blown monitoring dashboard is a larger effort, this slice will focus on **enhancing our existing logging with more targeted performance metrics and preparing for future dashboard integration**.

This builds upon Slice 19 (Basic Workflow Monitoring) by making our "metric logs" more deliberate and considering how they might feed into a system like Grafana, Prometheus, or a cloud provider's monitoring service.

---

### Slice 21: Enhanced Performance Logging for Future Dashboarding

**What You're Building:**
*   Refining the structured "metric logs" (from Slice 19) to be more consistently formatted and comprehensive for key performance indicators (KPIs) related to document processing and RAG response times.
*   Adding specific timing logs for end-to-end RAG query processing (from user query to LLM response generation).
*   Ensuring critical error rates or types are logged in a way that can be easily aggregated (e.g., specific error codes or types).
*   (Conceptual) Thinking about which of these logged metrics would be primary candidates for a future monitoring dashboard.

**Tasks:**

1.  **Standardize Metric Log Format** - Complexity: 2
    *   [ ] Review the "metric logs" implemented in Slice 19. Ensure a consistent structure.
    *   **Recommended Structure:**
        ```json
        // {
        //   "level": "info", // or "warn" for error rates
        //   "time": 1678886400000, // Pino adds this
        //   "pid": 123, // Pino adds this
        //   "hostname": "...", // Pino adds this
        //   "metric": true, // Discriminator
        //   "name": "my_app.workflow.step.duration_ms", // Hierarchical metric name
        //   "value": 1234.56,
        //   "unit": "ms", // Optional, but good for clarity
        //   "tags": { // Key-value pairs for dimensions/filtering
        //     "workflowName": "document_processing",
        //     "stepName": "pdf_to_image_conversion",
        //     "documentId": "uuid-...",
        //     "status": "success" // or "failure"
        //     // Add other relevant tags like userId, modelName, etc.
        //   },
        //   "msg": "Metric: PDF to Image conversion duration" // Human-readable message
        // }
        ```
    *   [ ] Create a helper function or a clear convention for emitting these metric logs to ensure consistency.
2.  **Log End-to-End RAG Query Performance** - Complexity: 3
    *   [ ] In `app/api/chat/route.ts`:
        *   Log a timestamp at the very beginning of the `POST` request.
        *   Log timestamps *before and after* key stages:
            1.  Context retrieval (calling `retrieveContextAndSources`, which includes search and rerank).
            2.  LLM call (`streamText` or `generateText`).
        *   At the end of the request (or when the stream is fully processed), log the total duration and durations for these key stages.
    *   **Metric Names:**
        *   `my_app.rag.query.total_duration_ms`
        *   `my_app.rag.query.context_retrieval_duration_ms`
        *   `my_app.rag.query.llm_generation_duration_ms`
    *   Tags should include `documentId` (if applicable), `userId`.
3.  **Log Detailed Document Processing Stage Timings** - Complexity: 2
    *   [ ] In your Inngest functions (`lib/inngest/functions/document-processing.ts`), refine the duration logging for each major stage as identified in the PRD's "Custom Metrics":
        *   PDF → images (already started in Slice 19)
        *   ADE processing (simulated or real)
        *   Embeddings generation (text and image separately if possible)
    *   Ensure these use the standardized metric log format with appropriate tags (`stepName`, `documentId`, `status`).
4.  **Log Critical Error Rates/Types** - Complexity: 2
    *   [ ] When errors occur in Inngest functions or API routes:
        *   Log a specific metric indicating a failure.
        *   `name`: `my_app.workflow.step.failure_count` (value 1) or `my_app.api.request.failure_count`
        *   `tags`: Include `stepName` or `apiRoute`, `errorType` (e.g., "CohereAPIError", "DatabaseError", "ValidationError", "LandingAIError"), `documentId`, `userId`.
        *   This allows aggregating failure counts by type or step.
5.  **Log Cache Hit/Miss Rates (for the simple cache in Slice 16)** - Complexity: 2
    *   [ ] In the `getQueryEmbedding` helper function (or wherever the query embedding cache is):
        *   Log a cache hit: `name: 'my_app.cache.hit_count'`, `tags: { cacheName: 'query_embedding' }`, `value: 1`
        *   Log a cache miss: `name: 'my_app.cache.miss_count'`, `tags: { cacheName: 'query_embedding' }`, `value: 1`
    *   This will allow calculating a hit rate: `hits / (hits + misses)`.
6.  **Review and Consolidate Logging** - Complexity: 1
    *   [ ] Ensure there isn't excessive redundant logging. Metric logs should be distinct from general debug/info logs.
    *   [ ] Verify that all logged metrics align with the "Custom Metrics" section of the PRD where applicable.
7.  **Conceptual Dashboard Metrics** - Complexity: 1 (Mental Exercise)
    *   [ ] Think about which of these logged metrics would be most important to visualize on a dashboard:
        *   Average RAG query total duration.
        *   P95/P99 RAG query total duration.
        *   Average context retrieval duration.
        *   Average LLM generation duration.
        *   Document processing pipeline success rate (overall and per step).
        *   Average duration for each document processing step.
        *   Error rates by type/step.
        *   Cache hit rate.
    *   This thinking helps ensure your logged metrics are useful for future dashboarding.
8.  **Testing (Manual Verification of Logs)** - Complexity: 1
    *   [ ] Perform key actions in the application (upload document, ask questions).
    *   [ ] Monitor the console (with `pino-pretty`) to ensure the new metric logs are being generated correctly with the standardized format and accurate values/tags.
    *   [ ] Trigger some error conditions to verify failure metrics are logged.

**Code Example (Standardized Metric Logging Helper - conceptual):**
```typescript
// lib/metric-logger.ts (or part of logger.ts)
import logger from './logger'; // Your main pino logger

interface MetricLogOptions {
  name: string; // e.g., my_app.workflow.step.duration_ms
  value: number;
  unit?: string;
  tags?: Record<string, string | number | boolean | undefined>;
  msg?: string; // Optional human-readable message
}

export function logMetric(options: MetricLogOptions): void {
  logger.info({
    metric: true, // Discriminator
    name: options.name,
    value: options.value,
    unit: options.unit,
    tags: options.tags || {},
  }, options.msg || `Metric: ${options.name}`);
}

// Example usage:
// import { logMetric } from '@/lib/metric-logger';
// logMetric({
//   name: 'my_app.rag.query.total_duration_ms',
//   value: Date.now() - requestStartTime,
//   unit: 'ms',
//   tags: { userId: 'some-user', documentId: 'some-doc' },
//   msg: "RAG query processed"
// });
```

**Code Example (Logging in `app/api/chat/route.ts`):**
```typescript
// app/api/chat/route.ts
// import logger from '@/lib/logger';
// import { logMetric } from '@/lib/metric-logger'; // Your new helper
// ...

export async function POST(req: NextRequest) {
  const requestStartTime = Date.now();
  let userIdFromSession: string | undefined; // To store userId for final metric log

  try {
    const session = await auth(); // From your auth.ts
    userIdFromSession = session?.user?.id;
    // ... (validation, get activeDocumentId) ...

    const contextRetrievalStartTime = Date.now();
    // ... (call retrieveContextAndSources) ...
    const contextRetrievalDuration = Date.now() - contextRetrievalStartTime;
    logMetric({
      name: 'my_app.rag.query.context_retrieval_duration_ms',
      value: contextRetrievalDuration,
      unit: 'ms',
      tags: { documentId: activeDocumentId, userId: userIdFromSession, status: 'success' }, // Add status
    });

    const llmCallStartTime = Date.now();
    // ... (LLM call logic, e.g., constructing stream with sources and follow-ups) ...
    // After the stream is fully constructed or the main LLM part is done:
    const llmGenerationDuration = Date.now() - llmCallStartTime; // This might be tricky with streams
                                                              // Log this when the LLM part of the stream is known to be complete.
                                                              // For a fully streamed response, this specific metric is harder.
                                                              // You might log it when the `ReadableStream`'s `controller.close()` for LLM text is called.
    // For now, let's log it conceptually near where the LLM interaction finishes.
    // This will be refined if we have more precise stream completion events.
    // logMetric({
    //   name: 'my_app.rag.query.llm_generation_duration_ms',
    //   value: llmGenerationDuration, // Approximate
    //   unit: 'ms',
    //   tags: { userId: userIdFromSession, modelName: 'gemini-1.5-flash' },
    // });


    // The total duration is logged when the response is fully sent or stream closed.
    // For streaming responses, this is complex. A simple way is to log it here,
    // acknowledging it doesn't include full stream transfer time.
    logMetric({
      name: 'my_app.rag.query.api_handler_duration_ms', // More accurate name for now
      value: Date.now() - requestStartTime,
      unit: 'ms',
      tags: { userId: userIdFromSession, documentId: activeDocumentId, status: 'success' },
    });

    return new Response(customStream, { /* ... */ }); // Your stream from Slice 11

  } catch (error: any) {
    const totalDuration = Date.now() - requestStartTime;
    logger.error({ error: { message: error.message, name: error.name }, userId: userIdFromSession }, "Chat API POST error");
    logMetric({
      name: 'my_app.api.request.failure_count',
      value: 1,
      tags: { apiRoute: '/api/chat', errorType: error.name || 'UnknownChatError', userId: userIdFromSession },
    });
    logMetric({ // Log duration even on failure
      name: 'my_app.rag.query.api_handler_duration_ms',
      value: totalDuration,
      unit: 'ms',
      tags: { userId: userIdFromSession, status: 'failure' },
    });
    // ... return error response ...
  }
}
```
**Note on `llm_generation_duration_ms` with streams:** Accurately measuring the pure LLM generation time when streaming is tricky because the call is asynchronous and yields tokens progressively. You might measure the time until the *first token* arrives or until the LLM part of your custom stream signals completion. The example above is a simplification.

**Ready to Merge Checklist:**
*   [ ] Standardized metric log format (e.g., using a helper like `logMetric`) is defined and applied.
*   [ ] End-to-end RAG query performance metrics (total, context retrieval, approximate LLM generation) are logged from the chat API.
*   [ ] Detailed document processing stage timings (PDF-to-image, ADE, embeddings) are logged from Inngest functions using the standardized format.
*   [ ] Critical error rates/types are logged as metrics with relevant tags (step, error type).
*   [ ] Cache hit/miss rates for query embeddings are logged.
*   [ ] Logged metrics are reviewed for consistency and alignment with PRD's "Custom Metrics" section.
*   [ ] (Mental Exercise) Key metrics for a future dashboard have been identified based on current logging.
*   [ ] Manual verification of console logs confirms correct format, values, and tags for metric logs under various scenarios (success, failure).
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **OpenTelemetry:** Briefly understand what it is. It's a more advanced standard for observability (logs, metrics, traces) that `pino` can often integrate with. (Not for implementation in this slice, just awareness).
*   **Log aggregation tools (ELK Stack, Splunk, Grafana Loki):** How they typically ingest and allow querying of structured JSON logs.
*   **Metrics systems (Prometheus, Grafana Mimir, Datadog Metrics):** How they store and visualize time-series metric data.

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm using Pino for structured JSON logging in my Node.js application. I want to emit specific logs that represent application metrics (e.g., durations, counts, rates) in a format that can be easily parsed and aggregated by a log management system (like Grafana Loki or OpenSearch) for dashboarding. What's a good, consistent JSON structure for these 'metric logs'? Show an example of a helper function to emit such logs and how to use it for timing a function or counting an event."*

**Questions for Senior Dev:**
*   [ ] For accurately measuring `llm_generation_duration_ms` when using streaming responses, what's a practical approach? (e.g., time to first token, or time until a specific "LLM done" signal in our stream).
*   [ ] The current "metric logs" are just structured logs. When should we consider moving to a dedicated metrics library (like `prom-client`) and scraping endpoint for Prometheus, or direct integration with a cloud monitoring service? (When dashboards and alerting become a priority, or if log volume/cost for metrics becomes an issue).
*   [ ] Are there any other critical KPIs from the PRD that we should prioritize logging as metrics in this pass?

---

This slice significantly improves your ability to understand the performance and reliability of your application's core workflows. These enhanced logs are the foundation for building effective monitoring dashboards and setting up alerts, moving closer to an "enterprise-ready" system.