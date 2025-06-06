Okay, we've reached a fantastic point: the core RAG functionality is working, and the LLM is generating answers based on document content! Now, let's enhance user trust and verifiability by showing *which* parts of the document were used to generate the answer. This is our first step towards "inline citations."

---

### Slice 7: Displaying Source Chunk Citations in Chat

**What You're Building:**
*   Modifying the backend to send source chunk information (metadata and content snippets) along with the LLM's response.
*   Updating the frontend chat interface to display these sources beneath the AI's message, allowing users to see the origin of the information.

**Tasks:**

1.  **Refine Search API Response for Citations** - Complexity: 2
    *   [ ] In `app/api/documents/search-chunks/route.ts`:
        *   Ensure the query returns not just chunk content but also `chunkId`, `documentId`, `chunkIndex`.
        *   It would be helpful to also join with the `documents` table to get the `originalName` of the document for display.
        *   The response objects should be structured clearly for citation purposes.
        ```typescript
        // Example structure for each search result item:
        // {
        //   chunkId: 'uuid-of-chunk',
        //   documentId: 'uuid-of-document',
        //   documentOriginalName: 'MyReport.pdf',
        //   chunkIndex: 0,
        //   content: 'The content of the chunk...',
        //   similarityScore: 0.85
        // }
        ```
2.  **Modify Chat API to Stream Source Data** - Complexity: 3
    *   [ ] In `app/api/chat/route.ts`:
        *   When `retrieveContextForChat` (or its equivalent) gets the search results (the source chunks), keep this array of source objects.
        *   Utilize the Vercel AI SDK's data streaming capabilities. When calling `streamText` (or `OpenAIStream` / `StreamingTextResponse` if using older patterns), you can use a mechanism to append or interleave structured data. The modern `ai` package's `streamText` often works with a `Data` object that can be streamed.
        *   The goal is for each AI message streamed back to the client to also include an array of the `source` objects that were used as context for *that specific response*.
    *   **Using `experimental_streamData` (Vercel AI SDK):**
        *   The `ai` package's `streamText` and `toDataStreamResponse()` handle this well. You can construct a `Data` instance and append to it.
        *   The `streamText` result object has methods like `append()`, `close()` which can be used to add custom JSON data alongside the text stream.
        ```typescript
        // In app/api/chat/route.ts, after getting LLM stream and sources
        // (This is a conceptual illustration; actual implementation depends on exact Vercel AI SDK usage)
        // If using the 'ai' package's streamText:
        // const { stream, ...rest } = await streamText(...);
        // The `rest` object or the stream itself might have ways to attach additional data.
        // A common pattern is to use the `onCompletion` or `onFinal` callback of the stream
        // to send a final data payload, or to use a multi-part stream.

        // With the Vercel AI SDK, often you construct a ReadableStream.
        // You can write JSON chunks to this stream.
        // Example using a custom stream:
        // const customStream = new ReadableStream({
        //   async start(controller) {
        //     // ... (stream LLM text tokens)
        //     // After LLM text is done, or interleaved:
        //     const sourceData = { type: 'sources', data: retrievedSourceObjects };
        //     controller.enqueue(`data: ${JSON.stringify(sourceData)}\n\n`);
        //     controller.close();
        //   }
        // });
        // return new StreamingTextResponse(customStream);

        // The Vercel `ai` package handles this more elegantly with its `Data` feature.
        // When you call `toDataStreamResponse()`, it can handle structured data.
        // You might need to modify how `retrieveContextForChat` passes data or how the main
        // `POST` function in `chat/route.ts` assembles the final stream.

        // A practical approach with `ai/core.experimental_streamObject` or similar might be needed
        // or by customizing the stream.
        // For now, let's assume the `streamText` or its wrapper can be augmented.
        // The Vercel AI SDK's `DataMessage` is key here.
        // You can create a `DataMessage` with your sources and append it.
        // The `streamText` function itself doesn't directly take a `data` field for this.
        // You typically construct the stream manually if you need to mix text and data messages.

        // Let's use the `experimental_onToolCall` or a similar mechanism if retrieval is a tool.
        // If retrieval is NOT a tool, then we send sources at the end.
        // The Vercel examples (e.g., `vercel/ai-chatbot`) show how to use `createStreamableValue`
        // and `streamUI` for more complex UI generation, which can include data.

        // Simpler path for now: The `streamText` result can be augmented.
        // The `toDataStreamResponse` can take an options bag.
        // Let's ensure the `retrievedSourceObjects` are available.
        // We will send them as a separate JSON payload after the text stream, or use
        // the `experimental_streamData` feature if `useChat` supports it directly.
        // The `ai/react` `useChat` hook has an `experimental_streamData` option.
        // If true, the server can send JSON data messages.
        // `res.write(`0:"Hello"`)` for text, `res.write(`1:[{"foo":"bar"}]`)` for data.

        // In `app/api/chat/route.ts`:
        const { stream, writer } = createCallbacksTransformer(); // From `ai` package
        const llmStream = await streamText({ /* ... */ });
        llmStream.pipeThrough(writer); // Pipe LLM tokens

        // After LLM stream is initiated, or on completion:
        // This needs to be done carefully with how the stream is constructed and consumed.
        // A common pattern is to send a final message with all sources.
        // Or, if `experimental_streamData` is used, you can interleave data messages.

        // For `ai/core`'s `StreamingTextResponse`:
        // It can take a `data` option.
        // Let `retrievedSourceObjects` be the array of sources.
        // The `StreamingTextResponse` can be made to include this.
        // We'll need to make sure they are associated with the correct AI message on the client.
        // The `streamText` function itself doesn't directly return the sources.
        // We will modify the `POST` function to send sources after the main text.

        // Let's simplify: The `POST` function in `chat/route.ts` will get the sources.
        // It will then create the `StreamingTextResponse`.
        // The `StreamingTextResponse` can be enhanced to include these sources.
        // The `ai` package's `Data` class and `streamData` option in `toDataStreamResponse` is the way.
        // `stream.append(createDataMessage(JSON.stringify(retrievedSourceObjects)))`
        // `stream.done()`
        // This means `result.pipeThrough(createStreamDataTransformer())` on the client.
        ```        *   **Revised approach for `app/api/chat/route.ts`:**
            ```typescript
            // app/api/chat/route.ts
            import { createStreamableValue } from 'ai/rsc'; // Or similar mechanism for data
            import { type AI } from '@/lib/chat/actions'; // Assuming this pattern from Vercel examples
            // ...
            // In the POST handler:
            // ... after getting retrievedContext and initializing LLM call ...
            // const sources = ... // This is your array of source objects
            //
            // const stream = result.toDataStreamResponse({
            //   data: sources, // This is a simplified idea; actual API might differ.
            // });
            // The `ai/react` `useChat` hook with `experimental_streamData: true` expects
            // the server to send data chunks prefixed with '1:'.
            // Example: '0:"text part"\n1:{"custom":"data"}\n0:"more text"'

            // Let's assume `retrievedSourceObjects` is the array of sources.
            // We need to make sure the `StreamingTextResponse` or `toDataStreamResponse`
            // can be augmented.
            // The `ai` package's `createStreamDataTransformer` is relevant here.
            // The server would use `stream.write` for text and `stream.write_data` for JSON.
            // This requires a more manual stream setup.

            // Simpler: use the `data` property of the `StreamingTextResponse` constructor if available,
            // or send a separate JSON message after the stream if using `generateText` and manually handling.
            // With `streamText` and `toDataStreamResponse`, you can pass a `data` option
            // to `toDataStreamResponse` which gets appended.
            //
            // Let `sourcesArray` be the array of source objects.
            // const result = await streamText({ model, messages: messagesWithContext });
            // return result.toDataStreamResponse({ data: sourcesArray }); // This is hypothetical
            //
            // Correct way with Vercel AI SDK 3.1+ `toDataStreamResponse`
            // The `data` parameter to `toDataStreamResponse` is for arbitrary Data frames.
            // You'd construct these using `new TextEncoder().encode('1:JSON.stringify(yourData)\n')`
            // and append them to the stream *before* closing the text part.
            // This is complex.
            //
            // A more straightforward way for `useChat`:
            // If `experimental_streamData: true` on client.
            // Server can do:
            // const textEncoder = new TextEncoder();
            // const readableStream = new ReadableStream({
            //  async pull(controller) {
            //    const { value, done } = await reader.read(); // reader from LLM stream
            //    if (done) {
            //      // After all text, send sources data
            //      const  jsonData = JSON.stringify(retrievedSourceObjects);
            //      controller.enqueue(textEncoder.encode(`1:${jsonData}\n`));
            //      controller.close();
            //      return;
            //    }
            //    controller.enqueue(textEncoder.encode(`0:"${JSON.stringify(value).slice(1, -1)}"\n`)); // Stream text
            //  }
            // });
            // return new Response(readableStream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ... }});
            // This is the manual way. The `ai` library aims to simplify this.
            //
            // Let's use the `onFinish` callback of `streamText` to get all generated text,
            // then make a new response that includes text + sources. This breaks streaming for sources.
            //
            // The best way with `ai/react` and `experimental_streamData: true`:
            // The `POST` function in `chat/route.ts` will construct the response.
            // When the LLM response is being streamed, you also stream data messages.
            // The `streamText` result needs to be piped into a transform stream that adds the data.
            //
            // A simpler, non-streaming way for sources (for now):
            // In `app/api/chat/route.ts`, after `const result = await streamText(...)`,
            // collect the full text: `const fullText = await result.fullStream;`
            // Then return a JSON response:
            // `return NextResponse.json({ text: fullText, sources: retrievedSourceObjects });`
            // And update client to handle this non-streamed JSON. This is a fallback.
            //
            // Sticking to streaming:
            // The `toDataStreamResponse()` method can be augmented.
            // The `data` part of the stream is for UI components.
            // We need to send the sources array as part of the message's metadata.
            // The `useChat` hook will receive an `experimental_streamData` array in `messages`.
            // So, the server needs to send `1:jsonData` chunks.
            // The Vercel AI SDK's `streamText` doesn't directly support injecting these `1:jsonData` chunks easily.
            // We might need to use `generateText` and manually construct the stream with `experimental_AssistantResponse`.
            //
            // **Pragmatic Solution for this slice:**
            // After the text stream from the LLM is finished, append a special message containing the JSON of sources.
            // Client will parse this.
            // Or, if `experimental_streamData: true` is used on the client with `useChat`:
            // `app/api/chat/route.ts`
            // const result = await streamText({ model, messages: messagesWithContext });
            // const stream = result.readableStream.pipeThrough(createStreamDataTransformer());
            // // Now, how to inject our sources?
            // // The `streamData` is typically for UI components.
            // // We can add sources to the `Message` object itself on the client side if the server sends them.
            //
            // Let's assume `retrievedSourceObjects` is available.
            // The `POST` function in `chat/route.ts` will now use `experimental_AssistantResponse`
            // from `ai` to construct the response. This allows mixing text and data.
            // ```typescript
            // import { experimental_AssistantResponse } from 'ai';
            // // ...
            // return experimental_AssistantResponse(
            //   { threadId: 'some-thread-id', messageId: 'some-message-id' }, // These might not be strictly needed for this use case
            //   async ({ forwardStream }) => {
            //     const stream = await streamText({ model, messages: messagesWithContext });
            //     await forwardStream(stream); // Forward the LLM's text stream
            //
            //     // Now, send the sources as a data message
            //     // This part is tricky as `forwardStream` might close the response.
            //     // The data should ideally be part of the message object.
            //
            //     // A simpler way: The `useChat` hook's `onFinish` callback on the client
            //     // can make another request to get sources for the last AI message. (Not ideal)
            //
            //     // The Vercel AI SDK documentation implies that if `experimental_streamData: true`
            //     // is used, any `data` field in the `Message` objects sent by `onToolCall` or
            //     // similar server-side constructs will appear in `message.experimental_streamData`.
            //     // Since our retrieval is not a "tool" in the LLM sense yet, this is harder.
            //
            //     // **Revised strategy for `chat/route.ts` for Slice 7:**
            //     // 1. Retrieve sources.
            //     // 2. Call `streamText` for LLM response.
            //     // 3. Construct a new `ReadableStream`.
            //     //    - First, write all text tokens from LLM stream, prefixed with `0:`.
            //     //    - Then, write the sources array as a JSON string, prefixed with `1:`.
            //     // This assumes `experimental_streamData: true` on the client.
            //   },
            // );
            // ```
            // This is the most robust way if we stick to `useChat`'s `experimental_streamData`.
            ```
3.  **Frontend: Enable `experimental_streamData` and Process Sources** - Complexity: 3
    *   [ ] In your chat component where `useChat` is initialized (e.g., `components/chat.tsx`):
        *   Set `experimental_streamData: true` in the `useChat` options.
    *   [ ] Modify the component that renders each message:
        *   Check if `message.experimental_streamData` exists and contains your sources array.
        *   If so, iterate through the sources and display them.
        *   Style the sources display (e.g., a small list under the message).
    *   **Subtask 3.1:** Enable `experimental_streamData` in `useChat`. - Complexity: 1
    *   **Subtask 3.2:** Access `message.experimental_streamData` in the message rendering component. - Complexity: 1
    *   **Subtask 3.3:** Render the list of sources with basic styling. - Complexity: 2
4.  **Define Source Data Structure** - Complexity: 1
    *   [ ] Formally define the TypeScript interface for a `Source` object that will be passed from backend to frontend (e.g., in `types/index.ts`).
        ```typescript
        // types/index.ts
        export interface ChatSource {
          chunkId: string;
          documentId: string;
          documentOriginalName: string;
          chunkIndex: number;
          contentSnippet: string; // e.g., first N chars of the chunk
          similarityScore?: number;
        }
        ```
5.  **Write Tests** - Complexity: 2
    *   [ ] **Backend Chat API:** Test that the constructed stream includes the `1:jsonData` part correctly if using the manual stream construction.
    *   [ ] **Frontend:** Test that `experimental_streamData` is correctly parsed and sources are displayed. Mock messages with this data.

**Code Example (Revised `app/api/chat/route.ts` for streaming sources):**
```typescript
// app/api/chat/route.ts
import { google } from '@ai-sdk/google-vertexai'; // Or your chosen LLM provider
import { CoreMessage, streamText } from 'ai';
import { NextRequest } from 'next/server';
import { ChatSource } from '@/types'; // Assuming you define this

// Your existing retrieveContextForChat or similar function
async function retrieveContextAndSources(query: string, documentId?: string): Promise<{ contextText: string, sources: ChatSource[] }> {
  if (!documentId) return { contextText: "", sources: [] };
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/documents/search-chunks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documentId, topK: 3 }),
    });
    if (!response.ok) {
      console.error("Failed to retrieve context:", await response.text());
      return { contextText: "", sources: [] };
    }
    const searchResult = await response.json(); // Expects { results: YourChunkType[] }
    
    const sources: ChatSource[] = (searchResult.results || []).map((r: any) => ({ // Cast 'r' to your actual chunk type
      chunkId: r.id, // Ensure your search-chunks API returns 'id' as chunkId
      documentId: r.documentId,
      documentOriginalName: r.document?.originalName || 'Unknown Document', // Assuming join in search-chunks
      chunkIndex: r.chunkIndex,
      contentSnippet: r.content.substring(0, 150) + "...", // Create a snippet
      similarityScore: r.similarityScore,
    }));

    const contextText = sources.map(s => s.contentSnippet).join("\n---\n"); // Or full content if preferred for LLM
    return { contextText, sources };

  } catch (error) {
    console.error("Error retrieving context for chat:", error);
    return { contextText: "", sources: [] };
  }
}

export async function POST(req: NextRequest) {
  const { messages, data } = await req.json();
  const activeDocumentId = data?.documentId;

  const lastUserMessage = messages.findLast((m: CoreMessage) => m.role === 'user');
  let retrievedContextText = "No relevant excerpts found for this query in the document.";
  let sourcesForMessage: ChatSource[] = [];

  if (lastUserMessage && activeDocumentId) {
    const { contextText, sources } = await retrieveContextAndSources(String(lastUserMessage.content), activeDocumentId);
    if (contextText) retrievedContextText = contextText;
    sourcesForMessage = sources;
  }

  const systemPrompt = `You are a helpful assistant. Answer the user's question based ONLY on the following document excerpts. If the answer is not in the excerpts or the excerpts are irrelevant, say "I couldn't find an answer in the provided document excerpts for that query." Do not use any external knowledge.
---
DOCUMENT EXCERPTS:
${retrievedContextText}
---`;

  const messagesWithContext: CoreMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.filter((m: CoreMessage) => m.role !== 'system'), // Avoid duplicate system messages if client sends them
  ];

  const llmResultStream = await streamText({
    model: google('gemini-1.5-flash-latest'),
    messages: messagesWithContext,
  });

  // Manually construct the stream to include text and data parts
  const textEncoder = new TextEncoder();
  const customStream = new ReadableStream({
    async start(controller) {
      // Stream LLM text tokens
      for await (const textPart of llmResultStream.textStream) {
        controller.enqueue(textEncoder.encode(`0:${JSON.stringify(textPart)}\n`));
      }

      // After all text, send sources data if any
      if (sourcesForMessage.length > 0) {
        const jsonData = JSON.stringify(sourcesForMessage);
        controller.enqueue(textEncoder.encode(`1:${jsonData}\n`));
      }

      // Optionally, stream tool calls, tool results etc. if using them.
      // For now, just text and our custom sources data.
      
      controller.close();
    }
  });

  return new Response(customStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
```

**Code Example (Frontend `components/chat-messages.tsx` or similar):**
```typescript
// Assuming you have a component that renders individual messages
// import { Message } from 'ai/react'; // Message type from useChat
// import { ChatSource } from '@/types';

// function ChatMessage({ message }: { message: Message }) { // Message type from Vercel AI SDK
//   const { role, content, experimental_streamData } = message;
//   const isAIMessage = role === 'assistant';
//   let sources: ChatSource[] | undefined = undefined;

//   if (isAIMessage && experimental_streamData) {
//     // experimental_streamData could be an array of data items.
//     // We expect our sources array to be one of these items.
//     // Or, if we send it as the *only* data item, it might be the direct value.
//     // Let's assume it's the direct value for simplicity if we only send one `1:` chunk
//     if (Array.isArray(experimental_streamData) && experimental_streamData.length > 0) {
//         // If streamData is an array of multiple data payloads, find ours.
//         // For now, assume the last data payload (if any) is our sources array.
//         // This depends on how the server structures the `1:` messages.
//         // With our current server setup, experimental_streamData will be the direct JSON parsed array.
//         sources = experimental_streamData as ChatSource[];
//     } else if (!Array.isArray(experimental_streamData) && experimental_streamData != null) {
//         // If it's a single object (older SDK behavior or specific server setup)
//         sources = experimental_streamData as ChatSource[];
//     }
//   }

//   return (
//     <div>
//       <div className="message-content">{content}</div>
//       {isAIMessage && sources && sources.length > 0 && (
//         <div className="sources" style={{ fontSize: '0.8em', marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
//           <strong>Sources:</strong>
//           <ul style={{ listStyle: 'disc', marginLeft: '20px' }}>
//             {sources.map((source, index) => (
//               <li key={source.chunkId || index}>
//                 Doc: {source.documentOriginalName} (Chunk {source.chunkIndex}, Score: {source.similarityScore?.toFixed(2)})
//                 <p style={{ fontStyle: 'italic', color: '#555', whiteSpace: 'pre-wrap' }}>"{source.contentSnippet}"</p>
//               </li>
//             ))}
//           </ul>
//         </div>
//       )}
//     </div>
//   );
// }

// In your main chat component where you map through messages:
// messages.map(m => <ChatMessage key={m.id} message={m} />)

// And in useChat hook:
// const { messages, ... } = useChat({
//   experimental_streamData: true,
//   // ... other options
// });
```
**Note on `experimental_streamData` parsing:** The exact structure of `experimental_streamData` on the client can vary. If you send multiple `1:data\n` chunks from the server, `experimental_streamData` will be an array. If you send only one, it might be the parsed object directly. The example above tries to handle it being the direct array. Adjust parsing as needed based on console logging `message.experimental_streamData`.

**Ready to Merge Checklist:**
*   [ ] Search API (`/api/documents/search-chunks`) returns detailed source information including document name and chunk index.
*   [ ] Chat API (`/api/chat/route.ts`) successfully streams both LLM text (`0:`) and the array of `ChatSource` objects (`1:`) at the end of the AI's response.
*   [ ] Frontend `useChat` hook has `experimental_streamData: true` enabled.
*   [ ] Chat message component correctly parses `message.experimental_streamData` and displays the list of sources with their details.
*   [ ] The `ChatSource` type is defined and used consistently.
*   [ ] Error handling ensures chat remains functional even if sources are not available for a message.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.
*   [ ] Feature works as expected: AI responses in chat now have a "Sources" section listing the document chunks used as context.

**Quick Research (5-10 minutes):**
*   **Vercel AI SDK `experimental_streamData`:** [https://sdk.vercel.ai/docs/guides/streaming-data](https://sdk.vercel.ai/docs/guides/streaming-data) (or latest documentation on streaming structured data with `useChat`).
*   **Vercel AI SDK `createStreamDataTransformer` / `Data` class:** If the manual stream construction becomes too complex, see if these helpers simplify sending `0:` and `1:` prefixed data.
*   **TypeScript interfaces for data contracts.**

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm using the Vercel AI SDK with `useChat` and `experimental_streamData: true`. Explain exactly how the server should format its `ReadableStream` response with `0:` prefixed text chunks and `1:` prefixed JSON data chunks so that `message.experimental_streamData` on the client correctly receives the parsed JSON data. Provide a minimal server-side example."*

**Questions for Senior Dev:**
*   [ ] Is the current method of manually constructing the stream in `chat/route.ts` to interleave `0:` and `1:` data the most maintainable way, or should we explore other Vercel AI SDK utilities for this?
*   [ ] For the `contentSnippet` in `ChatSource`, is `substring(0, 150)` a good default, or should this be more configurable/intelligent?
*   [ ] How should we handle the UI if there are many sources? (e.g., collapsible section, limit displayed initially). For now, a simple list is fine.

---

This slice significantly improves the user experience by providing transparency. The next steps could involve making these citations more interactive, moving to background processing for document ingestion, or starting on multimodal capabilities.