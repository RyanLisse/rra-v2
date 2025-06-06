Okay, we've laid a strong foundation for monitoring and performance logging. Now, let's address a more user-facing enhancement from the PRD's "Chat Interface (Enhanced)" section: **History Pruning / Intelligent Conversation Context Management**.

Currently, our chat API (`app/api/chat/route.ts`) takes all messages sent from the client and prepends a system prompt with retrieved context. For very long conversations, sending the entire message history to the LLM on every turn can become inefficient (token limits, cost) and might not always be necessary for the LLM to understand the immediate context.

This slice will implement a basic history pruning strategy: limiting the number of past messages sent to the LLM while trying to retain important context.

---

### Slice 22: Basic Conversation History Pruning

**What You're Building:**
*   Modifying the chat API (`app/api/chat/route.ts`) to implement a simple conversation history pruning mechanism before sending messages to the LLM.
*   Strategies to consider:
    1.  Keep only the last N messages.
    2.  Keep the system prompt, the last N user/assistant turns (a turn = 1 user message + 1 assistant response), and the latest user query.
*   Ensuring that the retrieved context (from RAG) is always included with the pruned history.

**Tasks:**

1.  **Decide on a Pruning Strategy** - Complexity: 2
    *   **Strategy A: Last N Messages:** Simplest. Keep the system prompt (if you always add one), the retrieved RAG context, and the last N messages from the `messages` array.
    *   **Strategy B: Last N Turns + System Prompt + RAG Context:** More sophisticated. A "turn" is a user message and its subsequent assistant message. This preserves conversational flow better.
    *   **PRD mentions "Intelligent conversation context management."** Strategy B is a step towards this. Let's aim for a variation of Strategy B.
    *   **Our chosen strategy for this slice:**
        *   Always include the **System Prompt** (the one we construct with RAG context).
        *   Always include the **most recent user message**.
        *   Include the last **K user/assistant message pairs (turns)** before the most recent user message.
        *   (Optional) Consider always keeping the *very first* user message and assistant response if they set important initial context for the whole conversation (e.g., "I want to discuss document X").
2.  **Implement Pruning Logic in Chat API** - Complexity: 3
    *   [ ] In `app/api/chat/route.ts`, before the `streamText` (or `generateText`) call to the LLM:
        *   Access the `messages` array from the request.
        *   Implement the chosen pruning logic to select which messages will be sent to the LLM.
        *   Remember that your constructed system prompt (with RAG context) is *prepended* to this pruned list of messages.
    *   **Subtask 2.1:** Extract the current user's message.
    *   **Subtask 2.2:** Implement logic to select the last K turns from the history (excluding the current user message).
    *   **Subtask 2.3:** (Optional) Implement logic to always include the first user/assistant turn.
    *   **Subtask 2.4:** Assemble the final list of messages to be sent to the LLM (pruned history + current user message), which will then be prepended with the system/RAG context prompt.
3.  **Configuration for Pruning** - Complexity: 1
    *   [ ] Make the number of turns (K) configurable, e.g., via an environment variable or a constant. `MAX_CONVERSATION_TURNS_TO_LLM = 3` (meaning 3 pairs of user/assistant messages + current user message).
4.  **Testing the Pruning Logic** - Complexity: 2
    *   [ ] **Unit Test:** Create a dedicated unit test for your pruning function. Provide various `messages` arrays (short, long, different role distributions) and verify that the output list of messages is correctly pruned according to your strategy.
    *   [ ] **Manual/Integration Test:**
        *   Engage in a long conversation with the chatbot (e.g., 10+ turns).
        *   Observe the logs (if you add logging for the messages sent to LLM) or debug to confirm that only the pruned set of messages (plus system prompt and current query) is being sent to the LLM.
        *   Verify that the chatbot can still respond coherently even with a pruned history, especially for follow-up questions that refer to recent turns.
5.  **Consider Impact on Follow-up Questions & Citations** - Complexity: 1 (Analysis)
    *   [ ] **Follow-up Questions (Slice 11):** The prompt for generating follow-up questions uses "Main Answer" and "Retrieved Context." Pruning the history sent to the *main LLM* should not directly affect this, as the "Main Answer" is generated based on the (pruned) history.
    *   [ ] **Citations (Slice 7):** Citations are based on the context retrieved by RAG for the *current query*. Pruning the conversational history sent to the LLM for generating the *answer* should not affect which sources are cited for that answer.
    *   No direct code changes needed here for this slice, but it's good to confirm the interactions.

**Code Example (Pruning Logic in `app/api/chat/route.ts`):**
```typescript
// app/api/chat/route.ts
import { type CoreMessage } from 'ai';
// ... other imports

const MAX_HISTORY_TURNS_TO_LLM = parseInt(process.env.MAX_HISTORY_TURNS_TO_LLM || "3"); // e.g., keep last 3 user/assistant pairs

function pruneMessageHistory(messages: CoreMessage[], maxTurns: number): CoreMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const prunedMessages: CoreMessage[] = [];
  let turnCount = 0;

  // Always keep the last message if it's from the user (it's the current query)
  // The Vercel AI SDK usually ensures the last message is the user's current input.
  const currentUserMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  // Iterate backwards from the second to last message
  // to collect previous turns
  let i = messages.length - 2;
  while (i >= 0 && turnCount < maxTurns) {
    const assistantMessage = messages[i];
    const userMessageForTurn = messages[i - 1]; // Potential user message for this turn

    if (assistantMessage && assistantMessage.role === 'assistant' &&
        userMessageForTurn && userMessageForTurn.role === 'user') {
      prunedMessages.unshift(assistantMessage); // Add assistant's response
      prunedMessages.unshift(userMessageForTurn);   // Add user's query for that turn
      turnCount++;
      i -= 2; // Move to the potential previous turn
    } else {
      // If the sequence isn't a clean user/assistant pair, or if we are at the beginning.
      // We might just take the message if it's important (e.g. system messages not part of turns)
      // For this simple turn-based pruning, we might just skip non-paired messages from the end,
      // or include the last few non-paired ones if they are not the current user message.
      // For now, this strict turn-pairing from the end is simpler.
      // A more robust approach might look for the last N 'user' roles and their subsequent 'assistant' roles.
      i--;
    }
  }

  // (Optional: Always add the very first user message and assistant response if available and not already included)
  // This adds complexity in avoiding duplicates if they are already in prunedMessages.
  // if (messages.length > 1 && maxTurns > 0) { // Ensure there's at least one turn to consider
  //   const firstUserMessage = messages.find(m => m.role === 'user');
  //   const firstSystemOrAssistantMessageAfterFirstUser = messages.find((m, idx) => idx > messages.findIndex(um => um.id === firstUserMessage?.id) && (m.role === 'assistant' || m.role === 'system'));
  //
  //   if (firstUserMessage && !prunedMessages.find(pm => pm.id === firstUserMessage.id)) {
  //     prunedMessages.unshift(firstUserMessage);
  //   }
  //   if (firstSystemOrAssistantMessageAfterFirstUser && !prunedMessages.find(pm => pm.id === firstSystemOrAssistantMessageAfterFirstUser.id)) {
  //      // Add it after the firstUserMessage if that was added
  //      const insertIndex = prunedMessages.findIndex(pm => pm.id === firstUserMessage?.id);
  //      if (insertIndex !== -1) prunedMessages.splice(insertIndex + 1, 0, firstSystemOrAssistantMessageAfterFirstUser);
  //      else prunedMessages.unshift(firstSystemOrAssistantMessageAfterFirstUser); // Or just add to start
  //   }
  // }


  // Add the current user's message back if it was isolated
  if (currentUserMessage && currentUserMessage.role === 'user') {
    prunedMessages.push(currentUserMessage);
  } else if (currentUserMessage && prunedMessages.length === 0) {
    // If history was empty and only current message exists
    prunedMessages.push(currentUserMessage);
  }


  // Filter out any system messages from the client-sent history, as we prepend our own.
  // However, some system messages might be intentional from client (e.g. for function calling instructions)
  // For now, let's assume our main system prompt (with RAG context) is the authoritative one.
  return prunedMessages.filter(m => m.role !== 'system');
}


export async function POST(req: NextRequest) {
  // ... (auth, request parsing, validationResult from Zod)
  const { messages: originalMessages, data } = validationResult.data; // Assuming Zod validation
  const activeDocumentId = data?.documentId;

  // ... (retrieveContextAndSources logic to get `retrievedContextText` and `sourcesForMessage`) ...
  // const systemPrompt = `System: ... DOCUMENT EXCERPTS:\n${retrievedContextText} ---`;

  // Prune the original message history
  const messagesToSendToLLM = pruneMessageHistory(originalMessages, MAX_HISTORY_TURNS_TO_LLM);

  const messagesWithSystemPromptAndPrunedHistory: CoreMessage[] = [
    { role: 'system', content: systemPrompt }, // Prepend our RAG-aware system prompt
    ...messagesToSendToLLM
  ];

  // Log what's being sent to LLM for debugging
  logger.debug({
    documentId: activeDocumentId,
    userId: session?.user?.id, // from auth()
    messagesSentToLLM: messagesWithSystemPromptAndPrunedHistory.map(m => ({ role: m.role, content: m.content.substring(0, 50) + "..."}))
  }, "Messages being sent to LLM after pruning");


  // const llmResultStream = await streamText({
  //   model: google('gemini-1.5-flash-latest'),
  //   messages: messagesWithSystemPromptAndPrunedHistory, // Use the pruned and prepended list
  // });

  // ... (rest of the logic for constructing the customStream with sources, follow-ups, etc.)
  // The generation of follow-up questions should also ideally use the same pruned context + main answer.
  // So, the `fullLLMResponseText` for the follow-up prompt should be from the LLM call that used `messagesWithSystemPromptAndPrunedHistory`.
}
```

**Unit Test for `pruneMessageHistory` (Conceptual):**
```typescript
// test/pruning.test.ts
import { describe, it, expect } from 'vitest';
import { type CoreMessage } from 'ai'; // Assuming this type is accessible

// Definition of pruneMessageHistory function would be here or imported
// function pruneMessageHistory(messages: CoreMessage[], maxTurns: number): CoreMessage[] { ... }

describe('pruneMessageHistory', () => {
  const sysMsg = (id: string, content: string): CoreMessage => ({ id, role: 'system', content });
  const userMsg = (id: string, content: string): CoreMessage => ({ id, role: 'user', content });
  const assistantMsg = (id: string, content: string): CoreMessage => ({ id, role: 'assistant', content });

  it('should keep all messages if less than maxTurns', () => {
    const messages: CoreMessage[] = [
      userMsg('u1', 'User 1'), assistantMsg('a1', 'Assistant 1'),
      userMsg('u2', 'User 2'),
    ];
    const pruned = pruneMessageHistory(messages, 3);
    // Expects [u1, a1, u2] after filtering system messages (if any were present and filter applied)
    expect(pruned.map(m=>m.id)).toEqual(['u1', 'a1', 'u2']);
  });

  it('should prune older turns, keeping the latest user message', () => {
    const messages: CoreMessage[] = [
      userMsg('u1', 'User 1 old'), assistantMsg('a1', 'Assistant 1 old'),
      userMsg('u2', 'User 2 mid'), assistantMsg('a2', 'Assistant 2 mid'),
      userMsg('u3', 'User 3 recent'), assistantMsg('a3', 'Assistant 3 recent'),
      userMsg('u4', 'User 4 current query'),
    ];
    const pruned = pruneMessageHistory(messages, 1); // Keep 1 turn + current query
    // Expected: [u3, a3, u4]
    expect(pruned.map(m=>m.id)).toEqual(['u3', 'a3', 'u4']);
  });

  it('should handle history with only user messages', () => {
    const messages: CoreMessage[] = [userMsg('u1', 'User 1'), userMsg('u2', 'User 2'), userMsg('u3', 'User 3 current')];
    const pruned = pruneMessageHistory(messages, 1);
    // Expected: [u3] (as there are no full "turns" before it)
    // Or, if it keeps last N messages regardless of turn structure when no turns found: [u2, u3] (depends on exact logic)
    // Current strict turn logic: it would find no prior turns, so just [u3]
    expect(pruned.map(m=>m.id)).toEqual(['u3']);
  });

  it('should return only current user message if history is just that', () => {
    const messages: CoreMessage[] = [userMsg('u1', 'Current query')];
    const pruned = pruneMessageHistory(messages, 2);
    expect(pruned.map(m=>m.id)).toEqual(['u1']);
  });

  it('should handle empty messages array', () => {
    const messages: CoreMessage[] = [];
    const pruned = pruneMessageHistory(messages, 2);
    expect(pruned).toEqual([]);
  });

  it('should filter out system messages from client if strategy implies', () => {
    const messages: CoreMessage[] = [
      sysMsg('s1', 'Client System Prompt'),
      userMsg('u1', 'User 1'), assistantMsg('a1', 'Assistant 1'),
      userMsg('u2', 'User 2 current'),
    ];
    const pruned = pruneMessageHistory(messages, 1); // Assuming the filter for role 'system' is active
    expect(pruned.map(m=>m.id)).toEqual(['u1', 'a1', 'u2']);
    expect(pruned.find(m => m.role === 'system')).toBeUndefined();
  });

   it('should correctly prune with maxTurns = 0, keeping only current user message', () => {
    const messages: CoreMessage[] = [
      userMsg('u1', 'User 1 old'), assistantMsg('a1', 'Assistant 1 old'),
      userMsg('u2', 'User 2 current query'),
    ];
    const pruned = pruneMessageHistory(messages, 0);
    expect(pruned.map(m => m.id)).toEqual(['u2']);
  });

  it('should handle a sequence ending with assistant message before current user', () => {
    // This case tests if the backward iteration correctly identifies the last full turn
    const messages: CoreMessage[] = [
      userMsg('u1', 'User 1'), assistantMsg('a1', 'Assistant 1'), // Turn 1
      userMsg('u2', 'User 2'), assistantMsg('a2', 'Assistant 2'), // Turn 2 (this is the one to keep if maxTurns=1)
      userMsg('u3', 'User 3 current query'),
    ];
    const pruned = pruneMessageHistory(messages, 1);
    expect(pruned.map(m => m.id)).toEqual(['u2', 'a2', 'u3']);
  });

});
```

**Ready to Merge Checklist:**
*   [ ] A clear conversation history pruning strategy (e.g., keep system/RAG prompt + last K turns + current user query) is chosen and implemented.
*   [ ] The chat API (`app/api/chat/route.ts`) correctly prunes the `messages` array before sending it to the LLM.
*   [ ] The number of turns/messages to keep is configurable (e.g., via an environment variable or constant).
*   [ ] Unit tests for the pruning logic cover various scenarios (short/long history, different message role distributions, edge cases).
*   [ ] Manual/integration testing confirms that for long conversations, a pruned history is sent to the LLM, and the chatbot remains coherent.
*   [ ] The impact on follow-up question generation and citation display has been considered and confirmed to be acceptable (no negative impact expected with current design).
*   [ ] All tests pass (bun test).
*   [ ] Linting passes (bun run lint).
*   [ ] Build succeeds (bun run build).
*   [ ] Code reviewed by senior dev.

**Quick Research (5-10 minutes):**
*   **LLM context window limits:** Understand the typical token limits for models like Gemini Flash (PRD mentions 1M, but for chat turns, you'd still want to be economical).
*   **Different history pruning strategies:** (e.g., "token budget," "summarization of old turns" - these are more advanced than this slice).
*   **Impact of history pruning on conversational AI quality.**

**Need to Go Deeper?**
*   **Research Prompt:** *"I'm implementing conversation history pruning for an LLM-based chatbot. My goal is to keep the last K user/assistant turns, plus the most recent user query, and always prepend a system prompt with RAG context. Explain how to reliably iterate through a message history array (where messages have `role: 'user' | 'assistant' | 'system'` and `content`) to implement this. Show a JavaScript/TypeScript function example and discuss edge cases like conversations shorter than K turns or histories not ending in a user/assistant pair."*

**Questions for Senior Dev:**
*   [ ] The current pruning logic is based on message counts/turns. For more "intelligent" pruning, should we consider token counts or even summarizing older parts of the conversation in a future iteration? (Yes, these are advanced techniques).
*   [ ] If a user's query heavily relies on information from a turn that just got pruned, how will the LLM handle it? (It will likely not have that specific context, highlighting the trade-off of pruning. RAG helps by re-fetching context for the current query).
*   [ ] Is the optional step of "always keeping the first user/assistant turn" valuable enough to add complexity, or is last K turns usually sufficient? (Last K is a good start, first turn can be added if specific use cases demand it).

---

Implementing history pruning is an important optimization for LLM-based chat applications, helping to manage costs, stay within token limits, and potentially improve response times by reducing the payload to the LLM. This slice provides a basic but effective mechanism.