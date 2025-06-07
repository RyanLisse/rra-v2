import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from '@google/generative-ai';

export interface RAGContext {
  chunks: {
    content: string;
    documentTitle: string;
    chunkIndex: number;
    similarity: number;
  }[];
  totalSources: number;
}

export interface RAGResponse {
  content: string;
  citations: Citation[];
  sources: string[];
  confidence: number;
}

export interface Citation {
  text: string;
  source: string;
  chunkIndex: number;
  startIndex?: number;
  endIndex?: number;
}

class GeminiRAGService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;
  private readonly MODEL_NAME = 'gemini-2.0-flash-exp';

  constructor() {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY environment variable is required');
    }

    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.model = this.genAI.getGenerativeModel({
      model: this.MODEL_NAME,
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 2048,
      },
    });
  }

  /**
   * Generate RAG response with citations
   */
  async generateRAGResponse(
    query: string,
    context: RAGContext,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
  ): Promise<RAGResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const contextPrompt = this.buildContextPrompt(context);
      const userPrompt = this.buildUserPrompt(query);

      let chatHistory: any[] = [];

      if (conversationHistory && conversationHistory.length > 0) {
        chatHistory = conversationHistory.map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        }));
      }

      const chat = this.model.startChat({
        history: chatHistory,
      });

      const fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${userPrompt}`;
      const result = await chat.sendMessage(fullPrompt);
      const response = result.response;
      const text = response.text();

      // Parse citations and sources from response
      const { content, citations, sources } = this.parseCitationsFromResponse(
        text,
        context,
      );
      const confidence = this.calculateConfidence(context, citations);

      return {
        content,
        citations,
        sources,
        confidence,
      };
    } catch (error) {
      console.error('Gemini RAG error:', error);
      throw new Error(
        `RAG response generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Generate streaming RAG response
   */
  async *generateRAGResponseStream(
    query: string,
    context: RAGContext,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
  ): AsyncGenerator<{
    content: string;
    isComplete: boolean;
    citations?: Citation[];
    sources?: string[];
  }> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const contextPrompt = this.buildContextPrompt(context);
      const userPrompt = this.buildUserPrompt(query);

      let chatHistory: any[] = [];

      if (conversationHistory && conversationHistory.length > 0) {
        chatHistory = conversationHistory.map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        }));
      }

      const chat = this.model.startChat({
        history: chatHistory,
      });

      const fullPrompt = `${systemPrompt}\n\n${contextPrompt}\n\n${userPrompt}`;
      const result = await chat.sendMessageStream(fullPrompt);

      let accumulatedText = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        accumulatedText += chunkText;

        yield {
          content: chunkText,
          isComplete: false,
        };
      }

      // Final processing for citations
      const { content, citations, sources } = this.parseCitationsFromResponse(
        accumulatedText,
        context,
      );

      yield {
        content: '',
        isComplete: true,
        citations,
        sources,
      };
    } catch (error) {
      console.error('Gemini RAG streaming error:', error);
      throw new Error(
        `RAG streaming failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private buildSystemPrompt(): string {
    return `You are an intelligent document assistant that provides accurate, helpful answers based on the provided context documents. 

IMPORTANT INSTRUCTIONS:
1. Base your answers ONLY on the provided context documents
2. If the context doesn't contain sufficient information, clearly state this limitation
3. Include citations using the format [Source: DocumentName, Chunk X] where appropriate
4. Provide specific, detailed answers when possible
5. If you're uncertain about information, express that uncertainty
6. Do not hallucinate or add information not present in the context
7. Structure your response clearly with proper formatting

CITATION FORMAT:
- Use [Source: DocumentName, Chunk X] after relevant statements
- Include multiple citations when information spans multiple sources
- Be specific about which parts of your answer come from which sources`;
  }

  private buildContextPrompt(context: RAGContext): string {
    let contextPrompt = `CONTEXT DOCUMENTS (${context.totalSources} sources):\n\n`;

    context.chunks.forEach((chunk, index) => {
      contextPrompt += `Document: ${chunk.documentTitle}\n`;
      contextPrompt += `Chunk: ${chunk.chunkIndex}\n`;
      contextPrompt += `Relevance Score: ${chunk.similarity.toFixed(3)}\n`;
      contextPrompt += `Content: ${chunk.content}\n\n`;
      contextPrompt += '---\n\n';
    });

    return contextPrompt;
  }

  private buildUserPrompt(query: string): string {
    return `USER QUESTION: ${query}

Please provide a comprehensive answer based on the context documents above. Include relevant citations and clearly indicate if any part of the question cannot be answered from the provided context.`;
  }

  private parseCitationsFromResponse(
    response: string,
    context: RAGContext,
  ): { content: string; citations: Citation[]; sources: string[] } {
    const citations: Citation[] = [];
    const sources = new Set<string>();

    // Extract citations in format [Source: DocumentName, Chunk X]
    const citationRegex = /\[Source:\s*([^,]+),\s*Chunk\s*(\d+)\]/g;
    let match: RegExpExecArray | null;

    let content = response;

    match = citationRegex.exec(response);
    while (match !== null) {
      const [fullMatch, documentName, chunkIndex] = match;
      const chunkIdx = Number.parseInt(chunkIndex);

      // Find the corresponding chunk in context
      const chunk = context.chunks.find(
        (c) =>
          c.documentTitle
            .toLowerCase()
            .includes(documentName.toLowerCase().trim()) &&
          c.chunkIndex === chunkIdx,
      );

      if (chunk) {
        citations.push({
          text: fullMatch,
          source: chunk.documentTitle,
          chunkIndex: chunk.chunkIndex,
        });
        sources.add(chunk.documentTitle);
      }

      match = citationRegex.exec(response);
    }

    // Clean up citations from content for display
    content = content.replace(citationRegex, '').trim();

    return {
      content,
      citations,
      sources: Array.from(sources),
    };
  }

  private calculateConfidence(
    context: RAGContext,
    citations: Citation[],
  ): number {
    if (context.chunks.length === 0) return 0;

    // Base confidence on average similarity score and citation coverage
    const avgSimilarity =
      context.chunks.reduce((sum, chunk) => sum + chunk.similarity, 0) /
      context.chunks.length;
    const citationCoverage =
      citations.length / Math.min(context.chunks.length, 3); // Normalize by top 3 chunks

    // Weighted combination
    const confidence =
      avgSimilarity * 0.7 + Math.min(citationCoverage, 1) * 0.3;

    return Math.round(confidence * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Summarize document content
   */
  async summarizeDocument(content: string, title: string): Promise<string> {
    try {
      const prompt = `Please provide a concise summary of the following document:

Document Title: ${title}

Content:
${content}

Provide a 2-3 paragraph summary that captures the main points, key information, and overall purpose of the document.`;

      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Document summarization error:', error);
      throw new Error(
        `Document summarization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

// Singleton instance
export const geminiRAGService = new GeminiRAGService();
