import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from '@google/generative-ai';
import { enhancedRagSystemPrompt } from './prompts';

export interface RAGContext {
  chunks: {
    content: string;
    documentTitle: string;
    chunkIndex: number;
    similarity: number;
    // Enhanced ADE metadata for structured context
    elementType?: string | null;
    pageNumber?: number | null;
    bbox?: any; // bounding box coordinates [x1, y1, x2, y2]
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
  // Enhanced ADE metadata for richer citations
  elementType?: string | null;
  pageNumber?: number | null;
  bbox?: any;
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
      const systemPrompt = this.buildSystemPrompt(context);
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
      const systemPrompt = this.buildSystemPrompt(context);
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

  private buildSystemPrompt(context: RAGContext): string {
    // Extract element types from context for enhanced prompt generation
    const elementTypes = Array.from(
      new Set(
        context.chunks
          .map((chunk) => chunk.elementType)
          .filter((type): type is string => Boolean(type))
      )
    );

    const hasStructuralData = elementTypes.length > 0;

    // Use the enhanced RAG system prompt with ADE information
    const basePrompt = enhancedRagSystemPrompt(hasStructuralData, elementTypes);

    // Add specific citation format instructions for Gemini
    const citationInstructions = `

CITATION FORMAT:
- Use [Source: DocumentName, Chunk X, Page Y] after relevant statements
- Include element type when relevant: [Source: DocumentName, Table on Page Y]
- Include multiple citations when information spans multiple sources
- Be specific about which parts of your answer come from which sources and document elements

RESPONSE REQUIREMENTS:
- Base your answers ONLY on the provided context documents
- If the context doesn't contain sufficient information, clearly state this limitation
- Provide specific, detailed answers when possible
- If you're uncertain about information, express that uncertainty
- Do not hallucinate or add information not present in the context
- Structure your response clearly with proper formatting`;

    return `${basePrompt}${citationInstructions}`;
  }

  private buildContextPrompt(context: RAGContext): string {
    let contextPrompt = `CONTEXT DOCUMENTS (${context.totalSources} sources):\n\n`;

    context.chunks.forEach((chunk, index) => {
      contextPrompt += `Document: ${chunk.documentTitle}\n`;
      contextPrompt += `Chunk: ${chunk.chunkIndex}\n`;
      contextPrompt += `Relevance Score: ${chunk.similarity.toFixed(3)}\n`;

      // Add structural metadata when available
      if (chunk.elementType) {
        contextPrompt += `Element Type: ${chunk.elementType}\n`;
      }
      if (chunk.pageNumber !== null && chunk.pageNumber !== undefined) {
        contextPrompt += `Page: ${chunk.pageNumber}\n`;
      }
      if (chunk.bbox && Array.isArray(chunk.bbox) && chunk.bbox.length === 4) {
        contextPrompt += `Position: [${chunk.bbox.join(', ')}]\n`;
      }

      // Format content with structural context
      const structuralPrefix = this.getStructuralPrefix(
        chunk.elementType,
        chunk.pageNumber,
      );
      contextPrompt += `Content: ${structuralPrefix}${chunk.content}\n\n`;
      contextPrompt += '---\n\n';
    });

    return contextPrompt;
  }

  /**
   * Generate a structural prefix for content based on element type and location
   */
  private getStructuralPrefix(
    elementType?: string | null,
    pageNumber?: number | null,
  ): string {
    if (!elementType) return '';

    const pageRef = pageNumber ? ` (Page ${pageNumber})` : '';

    switch (elementType.toLowerCase()) {
      case 'title':
        return `[TITLE${pageRef}] `;
      case 'heading':
        return `[HEADING${pageRef}] `;
      case 'figure_caption':
        return `[FIGURE CAPTION${pageRef}] `;
      case 'table_text':
        return `[TABLE${pageRef}] `;
      case 'list_item':
        return `[LIST ITEM${pageRef}] `;
      case 'paragraph':
        return `[PARAGRAPH${pageRef}] `;
      default:
        return `[${elementType.toUpperCase()}${pageRef}] `;
    }
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

    // Extract citations in multiple formats:
    // [Source: DocumentName, Chunk X, Page Y]
    // [Source: DocumentName, Table on Page Y]
    // [Source: DocumentName, Chunk X] (legacy format)
    const citationRegexes = [
      /\[Source:\s*([^,]+),\s*Chunk\s*(\d+),\s*Page\s*(\d+)\]/g,
      /\[Source:\s*([^,]+),\s*(\w+(?:\s+\w+)*)\s+on\s+Page\s*(\d+)\]/g,
      /\[Source:\s*([^,]+),\s*Chunk\s*(\d+)\]/g,
    ];

    let content = response;

    // Process each citation format
    citationRegexes.forEach((regex, formatIndex) => {
      let match: RegExpExecArray | null;
      regex.lastIndex = 0; // Reset regex state

      match = regex.exec(response);
      while (match !== null) {
        let documentName: string;
        let chunkIndex: number | undefined;
        let pageNumber: number | undefined;
        let elementType: string | undefined;

        if (formatIndex === 0) {
          // Format: [Source: DocumentName, Chunk X, Page Y]
          const [, docName, chunkStr, pageStr] = match;
          documentName = docName;
          chunkIndex = Number.parseInt(chunkStr);
          pageNumber = Number.parseInt(pageStr);
        } else if (formatIndex === 1) {
          // Format: [Source: DocumentName, Table on Page Y]
          const [, docName, elemType, pageStr] = match;
          documentName = docName;
          elementType = elemType;
          pageNumber = Number.parseInt(pageStr);
        } else {
          // Format: [Source: DocumentName, Chunk X] (legacy)
          const [, docName, chunkStr] = match;
          documentName = docName;
          chunkIndex = Number.parseInt(chunkStr);
        }

        // Find the corresponding chunk in context
        const chunk = context.chunks.find((c) => {
          const nameMatch = c.documentTitle
            .toLowerCase()
            .includes(documentName.toLowerCase().trim());

          if (chunkIndex !== undefined) {
            return nameMatch && c.chunkIndex === chunkIndex;
          }

          if (pageNumber !== undefined) {
            return nameMatch && c.pageNumber === pageNumber;
          }

          return nameMatch;
        });

        if (chunk) {
          citations.push({
            text: match[0],
            source: chunk.documentTitle,
            chunkIndex: chunk.chunkIndex,
            elementType: chunk.elementType,
            pageNumber: chunk.pageNumber,
            bbox: chunk.bbox,
          });
          sources.add(chunk.documentTitle);
        }

        match = regex.exec(response);
      }
    });

    // Clean up all citation formats from content for display
    citationRegexes.forEach((regex) => {
      content = content.replace(regex, '').trim();
    });

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
