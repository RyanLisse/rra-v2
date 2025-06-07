# Inngest Functions

This directory contains all Inngest workflow functions for the document processing pipeline.

## Function Organization

Each function file should export a single Inngest function that handles a specific step in the document processing workflow:

- `process-document-upload.ts` - Handles initial document upload processing
- `extract-document-text.ts` - Handles text extraction from uploaded documents  
- `chunk-document.ts` - Handles document chunking/segmentation
- `embed-document.ts` - Handles embedding generation for document chunks
- `handle-processing-failure.ts` - Handles error recovery and retry logic
- `batch-processing.ts` - Handles batch document processing workflows

## Function Structure

Each function should follow this pattern:

```typescript
import { inngest } from "@/lib/inngest/client";
import { EVENT_NAMES, type DocumentUploadedPayload } from "@/lib/inngest/types";

export const functionName = inngest.createFunction(
  {
    id: "function-id",
    name: "Human Readable Function Name",
    // Optional: Configure retries, rate limiting, concurrency
    retries: 3,
    concurrency: {
      limit: 5,
    },
  },
  {
    event: EVENT_NAMES.EVENT_NAME,
  },
  async ({ event, step }) => {
    // Function implementation
    const { data } = event;
    
    // Use step.run() for each logical step that should be retried independently
    const result = await step.run("step-name", async () => {
      // Step implementation
      return processStep(data);
    });
    
    // Send follow-up events using step.sendEvent()
    await step.sendEvent("send-next-event", {
      name: EVENT_NAMES.NEXT_EVENT,
      data: {
        // Event payload
      },
    });
    
    return result;
  }
);
```

## Event Flow

The document processing workflow follows this event flow:

1. `document.uploaded` → `process-document-upload` function
2. `document.text-extracted` → `chunk-document` function  
3. `document.chunked` → `embed-document` function
4. `document.embedded` → final processing complete
5. `document.processing-failed` → `handle-processing-failure` function

Each function is responsible for:
- Processing the current step
- Updating document status in the database
- Sending the next event in the workflow
- Handling errors gracefully

## Testing

Functions can be tested by:
1. Starting the Inngest Dev Server: `npx inngest-cli@latest dev`
2. Sending test events via the Inngest dashboard or programmatically
3. Using the Inngest testing utilities for unit tests

## Error Handling

All functions should:
- Use try/catch blocks around business logic
- Send failure events for non-retryable errors
- Log errors appropriately for debugging
- Update document status to reflect current state