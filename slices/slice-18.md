Okay, we've significantly enhanced the LLM's understanding by providing structured context from the (simulated or real) ADE output. The PRD also mentions "Custom Metrics" under "Enhanced Monitoring & Observability" and specific "Performance & Scalability" targets like workflow reliability and document processing times.

This slice will focus on **instrumenting our Inngest workflows with basic custom metrics and logging** to start tracking some of these key performance indicators (KPIs). We won't build a full monitoring dashboard yet, but we'll ensure the data is being emitted.

---

### Slice 19: Basic Workflow Monitoring & Custom Metrics with Inngest

**What You're Building:**
*   Adding structured logging within Inngest functions to capture key events, durations, and outcomes.
*   Using Inngest's built-in capabilities or simple external calls to emit custom metrics (e.g., processing time for each step, success/failure counts). For this slice, we might focus on logging these metrics, with actual metric system integration (like Prometheus/Grafana or a cloud provider's monitoring) being a future step.
*   Ensuring error tracking within Inngest functions is robust and provides enough context for debugging.

**Tasks:**

1.  **Choose a Structured Logging Approach** - Complexity: 1
    *   [ ] We can use `console.log` with JSON objects for structured logging, or a lightweight logging library like `pino` (`bun add pino pino-pretty`). `pino` is excellent for performance and structured output.
    *   **Decision:** Let's use `pino` for better structure and potential future integration with log management systems.
    *   [ ] Create a logger instance (e.g., `lib/logger.ts`).
        ```typescript
        // lib/logger.ts
        import pino from 'pino';

        const logger = pino({
          level: process.env.LOG_LEVEL || 'info',
          transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        });

        export default logger;
        ```
2.  **Instrument Inngest Functions with Logging & Timings** - Complexity: 3
    *   [ ] Go through each of your key Inngest functions in `lib/inngest/functions/document-processing.ts` (`convertPdfToImagesFn`, `processWithADEFn`, `generateEmbeddingsFn`).
    *   **At the start of each function:** Log the triggering event data and `documentId`.
    *   **For each significant `step.run(...)`:**
        *   Log before and after the step.
        *   Calculate and log the duration of the step.
        *   Log success or failure of the step with relevant context.
    *   **At the end of each function:** Log overall success/failure and total duration.
    *   **Example within an Inngest function:**
        ```typescript
        // lib/inngest/functions/document-processing.ts
        // import logger from '@/lib/logger';
        // ...
        // export const convertPdfToImagesFn = inngest.createFunction(
        //   // ... config ...
        //   async ({ event, step }) => {
        //     const startTime = Date.now();
        //     const { documentId, filePath } = event.data as DocumentUploadedPayload;
        //     const log = logger.child({ functionName: 'convertPdfToImagesFn', documentId, eventId: event.id });

        //     log.info({ eventData: event.data }, "Function started: Convert PDF to Images");

        //     try {
        //       // ...
        //       const convertStepStartTime = Date.now();
        //       await step.run('convert-pdf-to-images-step', async () => {
        //         log.info("Step started: convert-pdf-to-images-step");
        //         // ... actual conversion logic ...
        //         return { imagesConverted: outputImagePaths.length };
        //       });
        //       log.info({ durationMs: Date.now() - convertStepStartTime, imagesConverted: outputImagePaths.length }, "Step finished: convert-pdf-to-images-step");
        //       // ...
        //       log.info({ totalDurationMs: Date.now() - startTime, status: 'success' }, "Function finished successfully");
        //       return { success: true, ... };
        //     } catch (error: any) {
        //       log.error({ error: { message: error.message, stack: error.stack }, originalEventData: event.data, totalDurationMs: Date.now() - startTime, status: 'failed' }, "Function failed");
        //       // ... update DB status, send failure event ...
        //       throw error;
        //     }
        //   }
        // );
        ```
    *   **Subtask 2.1:** Add detailed logging to `convertPdfToImagesFn`.
    *   **Subtask 2.2:** Add detailed logging to `processWithADEFn`.
    *   **Subtask 2.3:** Add detailed logging to `generateEmbeddingsFn`.
3.  **Define & Log Custom Metrics (as Logs for now)** - Complexity: 2
    *   [ ] Based on the PRD's "Custom Metrics" list, identify a few we can capture via logs:
        *   `document_processing_time_pdf_to_images_ms`
        *   `document_processing_time_ade_ms` (for the ADE step)
        *   `document_processing_time_embeddings_ms`
        *   `image_extraction_success_count` (increment on success, can be aggregated from logs later)
        *   `ade_processing_success_count`
        *   `embedding_generation_success_count`
        *   `workflow_step_failure_count` (with step name and error type)
    *   [ ] When logging durations and success/failure, use consistent field names so they can be easily parsed by a log management system later (e.g., `metricName: 'doc_processing_duration_ms'`, `metricValue: 12345`, `stepName: 'pdf_to_images'`, `status: 'success'`).
    *   **Example Metric Log:**
        ```typescript
        // log.info({
        //   metric: true, // Flag this as a metric log
        //   metricName: 'document_processing_step_duration_ms',
        //   metricValue: Date.now() - stepStartTime,
        //   tags: {
        //     step: 'convert_pdf_to_images',
        //     documentId: documentId,
        //     status: 'success' // or 'failure'
        //   }
        // }, "Document processing step metric");
        ```4.  **Enhanced Error Reporting in Inngest** - Complexity: 2
    *   [ ] Ensure that when errors are caught in Inngest functions:
        *   The error object (message, stack) is logged with rich context (documentId, event data).
        *   A specific "failure" event (e.g., `event/document.processing.failed` as defined in Slice 8) is consistently sent with details about which step failed and the error.
        *   The document status in the DB is updated to reflect the specific error state (e.g., `error_ade_processing`, `error_embedding`).
    *   [ ] Inngest itself provides retry mechanisms and an error history in its dashboard, which is a good starting point for error tracking. Our structured logs will complement this.
5.  **Review Inngest Dashboard for Observability** - Complexity: 1
    *   [ ] While running your Inngest Dev Server (or checking Inngest Cloud dashboard):
        *   Observe the event flows, function invocations, durations, and any errors reported by Inngest.
        *   Check if your structured logs (if outputting to console with `pino-pretty`) are readable and provide useful information during development.
6.  **Write Tests (Focus on Logging/Error Path)** - Complexity: 1
    *   [ ] It's hard to directly test "logging" output easily in unit tests without complex spy setups.
    *   [ ] Instead, ensure your error handling paths in Inngest functions correctly update DB status and emit the failure events. You can test these side effects.
    *   [ ] Manually verify log output during development and testing.

**Code Example (`lib/logger.ts` - already shown)**

**Code Example (Applying to an Inngest function - more detailed):**
```typescript
// lib/inngest/functions/document-processing.ts
import logger from '@/lib/logger'; // Your Pino logger
import { InngestMiddleware } from 'inngest'; // For potential middleware later

// ... (other imports)

// Optional: Inngest Middleware for consistent logging/metrics (Advanced)
// const loggingMiddleware = new InngestMiddleware({
//   name: 'structured-logging-middleware',
//   init() {
//     return {
//       onFunctionRun(ctx) {
//         const log = logger.child({ functionId: ctx.fn.id, runId: ctx.runId, eventId: ctx.event.id, attempt: ctx.attempt });
//         log.info({ eventName: ctx.event.name, eventData: ctx.event.data }, "Function run started");
//         const startTime = Date.now();
//         return {
//           beforeExecution() { /* ... */ },
//           afterExecution() {
//             log.info({ durationMs: Date.now() - startTime, status: 'success_internal_execution' }, "Function execution finished");
//           },
//           transformOutput() { /* ... */ },
//           onStepRun(stepCtx) {
//             const stepLog = log.child({ stepId: stepCtx.step.id });
//             stepLog.info("Step run started");
//             const stepStartTime = Date.now();
//             return {
//               afterExecution() {
//                 stepLog.info({ durationMs: Date.now() - stepStartTime, status: 'success' }, "Step execution finished");
//               },
//               // ... other step lifecycle hooks
//             }
//           }
//         }
//       }
//     }
//   }
// });
// Then in client: export const inngest = new Inngest({ id: 'rag-chat-app', middleware: [loggingMiddleware] });
// For this slice, we'll stick to manual logging within functions for simplicity.

export const convertPdfToImagesFn = inngest.createFunction(
  { id: 'convert-pdf-to-images', name: 'Convert PDF Pages to Images' /*, middleware: [someFunctionSpecificMiddleware] */ },
  { event: EVENT_DOCUMENT_UPLOADED },
  async ({ event, step }) => {
    const fnStartTime = Date.now();
    const { documentId, userId, originalName, filePath } = event.data as DocumentUploadedPayload; // Assuming userId is now passed
    const log = logger.child({
      functionName: 'convertPdfToImagesFn',
      documentId,
      userId, // Log userId
      eventId: event.id,
      runId: step.runId, // Inngest provides runId
    });

    log.info({ eventName: event.name, eventData: event.data }, "Function started");

    try {
      await step.run('update-status-to-processing-images', async () => {
        log.debug("Step: update-status-to-processing-images - START");
        await db.update(documentsTable).set({ status: 'processing_images', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
        log.debug("Step: update-status-to-processing-images - END");
      });

      const imageOutputDir = path.join(UPLOAD_DIR, documentId, 'images'); // UPLOAD_DIR from config/constants
      await step.run('create-image-output-directory', () => {
        log.debug({ imageOutputDir }, "Step: create-image-output-directory - START");
        return fs.mkdir(imageOutputDir, { recursive: true });
      });
      log.debug("Step: create-image-output-directory - END");


      let convertedImageDetails: Array<{ pageNumber: number, imagePath: string }> = [];
      const conversionStepTime = Date.now();
      try {
        convertedImageDetails = await step.run('convert-pdf-pages', async () => {
          log.debug({ filePath }, "Step: convert-pdf-pages - START");
          // ... actual PDF to image conversion logic ...
          // const doc = await convert(filePath, { ... });
          // const outputImagePaths = doc.map(p => ({ pageNumber: p.pageNum, imagePath: p.path }));
          // return outputImagePaths;
          return []; // Placeholder
        });
        log.info({
            metric: true, metricName: 'document_processing_step_duration_ms', metricValue: Date.now() - conversionStepTime,
            tags: { step: 'pdf_to_images_conversion', documentId, status: 'success', imagesConverted: convertedImageDetails.length }
        }, "Step: convert-pdf-pages - END");
      } catch (convError: any) {
        log.error({ error: { message: convError.message, name: convError.name }, stepName: 'convert-pdf-pages' }, "Conversion step failed");
        log.warn({
            metric: true, metricName: 'document_processing_step_failure',
            tags: { step: 'pdf_to_images_conversion', documentId, errorType: convError.name || 'UnknownConversionError' }
        }, "Conversion step failure metric");
        throw convError; // Propagate to main catch
      }


      // ... (store image records in DB, similar logging for that step) ...

      await step.sendEvent('send-pdf-pages-converted-event', { /* ... */ });
      await db.update(documentsTable).set({ status: 'awaiting_ade', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));

      log.info({
        metric: true, metricName: 'document_processing_function_duration_ms', metricValue: Date.now() - fnStartTime,
        tags: { functionName: 'convertPdfToImagesFn', documentId, status: 'success' }
      }, "Function finished successfully");
      return { success: true, imagesConverted: convertedImageDetails.length };

    } catch (error: any) {
      log.error({
        error: { message: error.message, name: error.name, stack: error.stack },
        originalEventData: event.data,
        metric: true, metricName: 'document_processing_function_failure',
        tags: { functionName: 'convertPdfToImagesFn', documentId, errorType: error.name || 'UnknownError' }
      }, "Function failed");

      await step.run('update-status-on-function-error', async () => { // Use a step for this critical update
        await db.update(documentsTable).set({ status: 'error_image_conversion', updatedAt: new Date() }).where(eq(documentsTable.id, documentId));
      }).catch(dbErr => log.error({ dbError: dbErr }, "Failed to update document status to error after function failure"));

      await step.sendEvent('send-processing-failed-event-on-function-error', {
          name: EVENT_DOCUMENT_PROCESSING_FAILED, // Ensure this event is defined
          data: { documentId, step: 'image_conversion_fn', error: error.message, userId }
      }).catch(evtErr => log.error({ evtError: evtErr }, "Failed to send processing_failed event after function failure"));

      throw error; // Re-throw for Inngest to handle retries/dead-lettering
    }
  }
);
```

**Ready to Merge Checklist:**
*   [ ] `pino` (or chosen logging library) installed and configured. Logger instance is accessible.
*   [ ] Key Inngest functions (`convertPdfToImagesFn`, `processWithADEFn`, `generateEmbeddingsFn`) are instrumented with:
    *   Structured logs for function start/end, step start/end.
    *   Calculation and logging of durations for main steps and overall function.
    *   Logging of success/failure for steps and overall function.
*   [ ] Logs include contextual information like `documentId`, `userId`, `eventId`, `runId`.
*   [ ] Custom metrics (processing times, success/failure counts for key stages) are logged with consistent field names (e.g., `metric: true`, `metricName`, `metricValue`, `tags`).
*   [ ] Error logging within Inngest functions is enhanced to include detailed error objects and relevant context.
*   [ ] Failure events (`event/document.processing.failed`) are consistently sent with informative payloads.
*   [ ] Document status in DB is reliably updated on errors, reflecting the failed step.
*   [ ] Reviewed Inngest Dev Server dashboard and console logs during test runs to verify logging and error reporting.
*   [ ] (Manual) Tests for error paths in Inngest functions confirm that DB status is updated and failure events are emitted.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **`pino` documentation:** [https://getpino.io/](https://getpino.io/) (basic usage, child loggers, levels, transports like `pino-pretty`).
*   **Inngest `step.runId`, `event.id`, `step.attemptNumber`:** Useful context provided by Inngest for logging.
*   **Structured Logging Best Practices:** Consistent field names, appropriate log levels (info, error, debug, warn).
*   **CloudWatch Logs, Datadog, Sentry, etc.:** Briefly look at how structured JSON logs are typically ingested and queried in these systems (for future reference).

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm instrumenting my Inngest background jobs with structured logging using Pino. What are the best practices for logging within multi-step Inngest functions? How should I log timings for individual steps and the overall function? What contextual information (like `documentId`, `userId`, Inngest's `runId` or `eventId`) should I include in every log message to make debugging easier? Show an example of a Pino child logger configured for an Inngest function."*
*   **Research Prompt:** *"How can I emit custom application metrics from a Node.js application that can later be consumed by a monitoring system like Prometheus or Datadog? Explain the concept of logging metrics vs. using a dedicated metrics library (like `prom-client`). For logging metrics, what's a good structured format?"*

**Questions for Senior Dev:**
*   [ ] For logging custom metrics, is outputting them as structured logs (with a `metric: true` flag) a good enough start, or should we integrate a proper metrics library (like `prom-client` for Prometheus) in this slice? (Logging is a good start, full metrics system is more involved).
*   [ ] The PRD mentions "Inngest dashboard integration for workflow observability." Inngest's own dashboard provides a lot. What specific additional observability are we aiming for with custom metrics beyond what Inngest provides out-of-the-box? (Likely business-specific KPIs like "average ADE processing accuracy" which Inngest wouldn't know).
*   [ ] What log level (`info`, `debug`, `warn`, `error`) is appropriate for different types of events (e.g., step start/end, metric emission, non-critical warnings)?

---

This slice significantly improves the observability of your backend processing pipeline. While you're not building a dashboard yet, the structured logs and emitted "metric logs" provide the raw data needed for future monitoring, alerting, and performance analysis, aligning with the PRD's goals for an enterprise-ready system.