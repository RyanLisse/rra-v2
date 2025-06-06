Okay, we've made excellent progress across various aspects of the application, from core RAG functionality and multimodal processing to authentication, monitoring, and caching.

Looking at the PRD, a few major areas remain or could be deepened:
*   **Full Landing AI ADE Integration:** If Slice 14 was a simulation, implementing the real API calls.
*   **Advanced Visual Features:** OCR enhancement, Chart Understanding.
*   **AI Improvements:** Custom Vision Models, Advanced Reasoning, Feedback Learning.
*   **Testing:** "DeepEval Integration: ... with visual content". We did text-based DeepEval.
*   **Deployment & Infrastructure:** This is a large area.
*   **UI Polish:** More interactive visual citations (hover cards with image previews were mentioned in PRD but maybe not fully fleshed out in Slice 11).

Let's focus on a slice that enhances the **user experience and trust** by improving how visual information is presented and cited, building on Slice 10 (Multimodal Retrieval) and Slice 11 (Interactive Citations). The PRD specifically mentions "Interactive Visual Citations: Hover cards with source details and image previews" and "Image Context: Display relevant document images alongside text responses."

---

### Slice 24: Enhanced Interactive Visual Citations & Image Context Display

**What You're Building:**
*   Improving the display of image sources in the chat:
    *   When an image is shown as a source (from Slice 10/11), make it more interactive. Perhaps clicking it shows not just a larger preview (Slice 11) but also associated text snippets from ADE if available (e.g., captions, nearby paragraphs) or highlights its location in a document overview (more advanced).
    *   For text chunks that are cited, if they are spatially close to an image on the same page (information potentially available from ADE's bounding boxes), display a thumbnail of that related image alongside the text citation.
*   Ensuring that the `ChatSource` objects and the data passed to the frontend robustly support these richer visual citations.

**Prerequisites:**
*   Multimodal retrieval (Slice 10) is working, returning both relevant text chunks and images.
*   Structured ADE output (real or simulated from Slice 14) provides element types, page numbers, image paths, and ideally bounding boxes for both text and visual elements.
*   `document_chunks` and `document_images` tables store this structural information.
*   The search API (`search-chunks`) and `retrieveContextAndSources` function pass this detailed information to the frontend.

**Tasks:**

1.  **Refine `ChatSource` and Backend Data for Richer Visual Context** - Complexity: 3
    *   [ ] **Ensure ADE Bounding Boxes are Stored and Retrieved:**
        *   If not already done in Slice 14/18, ensure `document_chunks.bbox` and `document_images.bbox` (or a similar field on an ADE element table) store the `[x1, y1, x2, y2]` coordinates and `pageNumber`.
        *   Update `generateEmbeddingsFn` to populate these from `adeData`.
        *   Update the search API (`search-chunks` or `searchAndRerank`) to retrieve `bbox` and `pageNumber` for both text chunks and images that are selected as context.
    *   [ ] **Refine `ChatSource` Type (`types/index.ts`):**
        *   Ensure it can carry `bbox`, `pageNumber` for both text and image types.
        *   Add an optional field like `relatedImageThumbPath?: string` or `relatedImageId?: string` to text sources if we can determine a closely associated image.
        *   Add an optional field like `relatedTextSnippets?: string[]` to image sources if ADE provided captions or nearby text.
    *   [ ] **Update `retrieveContextAndSources` (in `app/api/chat/route.ts`):**
        *   After retrieving text chunks and images:
            *   **For image sources:** If ADE provided a caption or nearby text for a retrieved image, include it in `relatedTextSnippets` of the `ChatSource`.
            *   **For text sources:** Implement logic to find "related images." This is non-trivial. A simple heuristic: if a text chunk and an image are on the same `pageNumber` and their `bbox` coordinates are "close" (requires defining "close"), then link them. Add the `imagePath` of the related image to `relatedImageThumbPath` for the text source. This is a simplification; true semantic relation is harder.
        *   This logic might be better placed in the search/retrieval service itself.
2.  **Frontend: Enhanced Image Source Display** - Complexity: 3
    *   [ ] In the chat message component where image sources are rendered (from Slice 11):
        *   When an image source is displayed (the small `<img>` tag):
            *   On hover or as part of its `Dialog` preview, if `relatedTextSnippets` are available in its `ChatSource` object, display them (e.g., "Caption: ...", "Nearby text: ...").
    *   **Subtask 2.1:** Modify image source `Dialog` to include `relatedTextSnippets`.
3.  **Frontend: Text Citations with Related Image Thumbnails** - Complexity: 4
    *   [ ] In the chat message component, where text sources are rendered (using `HoverCard` or `Popover` from Slice 11):
        *   If a text `ChatSource` has a `relatedImageThumbPath` (or `relatedImageId` which you then use to construct a path/URL):
            *   Inside the `HoverCardContent` or `PopoverContent` for the text citation, display a small thumbnail of this related image.
            *   The image `src` would use the `/api/images/...` endpoint.
            *   Clicking this thumbnail could open the same image preview `Dialog` used for direct image sources.
    *   **Subtask 3.1:** Update `HoverCard`/`Popover` for text sources to include an `<img>` thumbnail if `relatedImageThumbPath` exists.
    *   **Subtask 3.2:** Make this thumbnail clickable to open the image preview dialog.
4.  **Logic for Determining "Related" Text/Image (Heuristic)** - Complexity: 3 (Can be simplified)
    *   [ ] This is the core challenge for linking text and images that aren't explicitly linked by ADE (like a figure and its caption).
    *   **Simple Heuristic (to be implemented in `retrieveContextAndSources` or search service):**
        1.  For each retrieved text chunk, get its `pageNumber` and `bbox_text`.
        2.  For each retrieved image (or all images on that page), get its `pageNumber` and `bbox_image`.
        3.  If `pageNumber` matches:
            *   Calculate spatial proximity. E.g., is the vertical distance between `bbox_text` and `bbox_image` small? Are they horizontally overlapping or adjacent?
            *   If "close enough", consider them related.
    *   This can be computationally intensive if done naively for many chunks/images. Start with a very simple check (e.g., on the same page and image y-range overlaps or is just below text y-range).
    *   **Alternative if ADE directly links captions to figures:** If your (simulated or real) ADE output explicitly says "this text is a caption for this figure," then this step is much easier – just use that direct link. Slice 14's `AdeElement` for a figure had an optional `content` for caption.
5.  **Styling and UX** - Complexity: 2
    *   [ ] Ensure the new visual elements (thumbnails in popovers, text snippets with image previews) are well-styled and don't clutter the UI.
    *   [ ] Ensure hover/click interactions are smooth.
6.  **Testing** - Complexity: 2
    *   [ ] **Backend:** Unit test the logic for finding related images/text (the heuristic or ADE link parsing).
    *   [ ] **Frontend:**
        *   Manually test with a document that has clear text-image relationships.
        *   Verify that text citation popovers show related image thumbnails correctly.
        *   Verify that image preview dialogs show related text snippets correctly.
        *   Test responsiveness and styling.

**Code Example (Refined `ChatSource` and `retrieveContextAndSources` - Conceptual):**
```typescript
// types/index.ts
// export interface ChatSource {
//   type: 'text' | 'image';
//   elementType?: 'paragraph' | 'title' | 'list_item' | 'table_text' | 'figure_caption' | string;
//   id: string; // chunkId or imageId from document_images
//   documentId: string;
//   documentOriginalName: string;
//   contentSnippet?: string; // For text chunks, or caption for an image
//   // fullContent?: string; // For text chunks
//   imagePath?: string;      // For image sources (actual path to image file)
//   pageNumber?: number;
//   bbox?: [number, number, number, number]; // [x1, y1, x2, y2]
//   similarityScore?: number;
//   relatedImageForText?: { imageId: string; imagePath: string; pageNumber: number }; // For text source, a nearby image
//   relatedTextForImage?: { textId: string; textContent: string; pageNumber: number }; // For image source, its caption/nearby text
// }

// app/api/chat/route.ts - inside retrieveContextAndSources
// async function retrieveContextAndSources(query: string, documentId?: string): Promise<{ contextText: string, sources: ChatSource[] }> {
//   // 1. Fetch initial text chunks and images from searchAndRerank (or search-chunks)
//   //    Ensure these results include pageNumber, bbox, elementType for text, and imagePath for images.
//   //    const { rerankedTextChunks, imageResults } = await searchAndRerank(query, documentId);
//   //    (Assume rerankedTextChunks have { id, content, pageNumber, bbox, elementType, documentId, documentOriginalName, similarityScore })
//   //    (Assume imageResults have { id, imagePath, pageNumber, bbox, documentId, documentOriginalName, similarityScore })

//   const finalSources: ChatSource[] = [];
//   const formattedContextLines: string[] = [];

//   // Process text results
//   for (const textChunk of rerankedTextChunks) {
//     let relatedImageInfo: ChatSource['relatedImageForText'] | undefined = undefined;
//     // **Heuristic to find related image:**
//     // For simplicity, let's say ADE directly provided a figure caption as a text chunk
//     // and we know which image it relates to (e.g. if elementType is 'figure_caption' and it has a targetImageId)
//     // Or, iterate through imageResults: if an image is on the same page and bbox is close, link it.
//     // This is complex logic. For now, we'll assume this linking is either done by ADE or a simplified heuristic.
//     // Example: if (textChunk.elementType === 'figure_caption' && textChunk.linkedImageId) {
//     //   const foundImage = imageResults.find(img => img.id === textChunk.linkedImageId);
//     //   if (foundImage) relatedImageInfo = { imageId: foundImage.id, imagePath: foundImage.imagePath, pageNumber: foundImage.pageNumber };
//     // }

//     finalSources.push({
//       type: 'text',
//       id: textChunk.id,
//       elementType: textChunk.elementType,
//       documentId: textChunk.documentId,
//       documentOriginalName: textChunk.documentOriginalName, // Assume this is fetched/joined
//       contentSnippet: textChunk.content.substring(0, 200) + "...",
//       fullContent: textChunk.content,
//       pageNumber: textChunk.pageNumber,
//       bbox: textChunk.bbox,
//       similarityScore: textChunk.similarityScore,
//       relatedImageForText: relatedImageInfo,
//     });
//     // Add to LLM context (as in Slice 18)
//     formattedContextLines.push(`[Type: ${textChunk.elementType || 'Text'}, Page: ${textChunk.pageNumber}]\nText: "${textChunk.content}"`);
//   }

//   // Process image results
//   for (const imgResult of imageResults) {
//     let relatedTextInfo: ChatSource['relatedTextForImage'] | undefined = undefined;
//     // **Heuristic to find related text (e.g., caption):**
//     // If ADE provided a direct link, or search for a text chunk of type 'figure_caption'
//     // that is on the same page and spatially close to this image's bbox.
//     // Example: const captionChunk = rerankedTextChunks.find(tc => tc.elementType === 'figure_caption' && tc.pageNumber === imgResult.pageNumber && /* bbox check */);
//     // if (captionChunk) relatedTextInfo = { textId: captionChunk.id, textContent: captionChunk.content, pageNumber: captionChunk.pageNumber };

//     finalSources.push({
//       type: 'image',
//       id: imgResult.id, // This is document_images.id
//       documentId: imgResult.documentId,
//       documentOriginalName: imgResult.documentOriginalName, // Assume fetched/joined
//       imagePath: imgResult.imagePath,
//       pageNumber: imgResult.pageNumber,
//       bbox: imgResult.bbox,
//       similarityScore: imgResult.similarityScore,
//       relatedTextForImage: relatedTextInfo,
//       contentSnippet: relatedTextInfo ? `Caption: ${relatedTextInfo.textContent.substring(0,100)}...` : `Image from page ${imgResult.pageNumber}`,
//     });
//     // Add to LLM context (optional for images, unless you have good text like captions)
//     if (relatedTextInfo) {
//        formattedContextLines.push(`[Type: Figure, Page: ${imgResult.pageNumber}, Image: ${path.basename(imgResult.imagePath)}]\nCaption: "${relatedTextInfo.textContent}"`);
//     } else {
//        formattedContextLines.push(`[Type: Figure, Page: ${imgResult.pageNumber}, Image: ${path.basename(imgResult.imagePath)}]`);
//     }
//   }

//   const contextText = formattedContextLines.join("\n---\n");
//   return { contextText, sources: finalSources };
// }
```

**Frontend Component (Conceptual - Text Citation with Image Thumbnail):**
```typescript
// components/chat-message.tsx (inside the part that renders a text source)
// const textSource: ChatSource = /* ... your source object ... */;
// <HoverCard>
//   <HoverCardTrigger>...</HoverCardTrigger>
//   <HoverCardContent>
//     <h4>{textSource.documentOriginalName} - Page {textSource.pageNumber}</h4>
//     <p className="text-sm">{textSource.elementType}: {textSource.contentSnippet}</p>
//     {textSource.relatedImageForText && (
//       <div className="mt-2">
//         <p className="text-xs font-semibold">Related Image:</p>
//         <Dialog> {/* Reuse image preview dialog */}
//           <DialogTrigger asChild>
//             <img
//               src={`/api/images/${textSource.relatedImageForText.imagePath}`} // Construct URL carefully
//               alt="Related visual context"
//               className="max-w-[80px] max-h-[80px] rounded cursor-pointer hover:opacity-80"
//             />
//           </DialogTrigger>
//           <DialogContent> {/* ... Dialog content as in Slice 11 ... */}
//              <img src={`/api/images/${textSource.relatedImageForText.imagePath}`} />
//           </DialogContent>
//         </Dialog>
//       </div>
//     )}
//   </HoverCardContent>
// </HoverCard>
```

**Ready to Merge Checklist:**
*   [ ] `document_chunks` and `document_images` schemas (and `generateEmbeddingsFn`) store `pageNumber` and `bbox` from ADE output.
*   [ ] Search API (`search-chunks` or retrieval service) retrieves `bbox` and `pageNumber` for relevant text and image elements.
*   [ ] `ChatSource` type is updated to carry richer visual context information (`bbox`, `relatedImageForText`, `relatedTextForImage`).
*   [ ] `retrieveContextAndSources` function in chat API:
    *   Populates `relatedTextForImage` for image sources (e.g., using ADE captions).
    *   Implements a heuristic (or uses ADE links) to populate `relatedImageForText` for text sources.
*   [ ] Frontend chat message component:
    *   Image source previews (`Dialog`) display `relatedTextSnippets` if available.
    *   Text source popovers (`HoverCard`/`Popover`) display a clickable thumbnail of `relatedImageForText` if available.
*   [ ] Logic for determining related text/images is implemented and tested.
*   [ ] UI for these enhanced citations is well-styled and user-friendly.
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **Spatial proximity algorithms (2D):** Basic concepts if implementing bbox-based linking (e.g., checking overlaps, distances). For this slice, simple heuristics are fine.
*   **Shadcn UI `Carousel`:** If considering it for image galleries.
*   **UX for displaying multiple related items:** How to avoid clutter if a text chunk relates to multiple images, or an image to multiple text snippets.

**Need to Go Deeper?**
*   **Research Prompt:** *"I have text chunks and images extracted from a PDF, each with page numbers and bounding box coordinates (x1, y1, x2, y2). How can I programmatically determine if a specific text chunk is spatially 'related' to an image on the same page? Explain a few simple heuristics (e.g., vertical alignment, proximity) and provide a JavaScript/TypeScript code snippet for one such heuristic."*
*   **Research Prompt:** *"In a React chat interface, I want to display a text citation. When the user hovers over this citation, a popover should appear containing details and a small thumbnail of a related image. Clicking the thumbnail should open a larger image preview in a modal. Show how to structure this using Shadcn UI's `HoverCard`, `Dialog`, and `img` components, including state management if needed for the dialog."*

**Questions for Senior Dev:**
*   [ ] The heuristic for linking text and images based on spatial proximity can be complex and imperfect. What's a reasonable level of sophistication for this initial implementation? (Simple same-page and basic y-overlap/adjacency is a good start).
*   [ ] If ADE provides direct links between text (like captions) and figures, should we prioritize using those links over spatial heuristics? (Absolutely, explicit links from ADE are more reliable).
*   [ ] How should the UI handle cases where a text chunk might be "related" to multiple images, or an image to multiple text snippets? (For now, pick the "best" one or limit to one to keep UI simple).

---

This slice makes the chat application feel much more integrated with the visual nature of the documents. Providing these explicit visual links in citations will significantly improve user trust and their ability to verify information.