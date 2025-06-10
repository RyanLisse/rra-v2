/**
 * RAG Pipeline Runner for Evaluation
 *
 * Helper functions to run queries through the actual RAG pipeline
 * and collect the results needed for evaluation.
 */

import { vectorSearchService } from '@/lib/search/vector-search';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { RAGSystemOutput } from './rag-evaluator';

// Initialize AI client
const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export interface RAGPipelineOptions {
  topK?: number;
  rerankingEnabled?: boolean;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_OPTIONS: Required<RAGPipelineOptions> = {
  topK: 5,
  rerankingEnabled: true,
  model: 'gemini-1.5-flash',
  temperature: 0.1,
  maxTokens: 1000,
};

/**
 * Run a query through the complete RAG pipeline
 */
export async function runRAGPipeline(
  query: string,
  documentId?: string,
  options: RAGPipelineOptions = {},
): Promise<RAGSystemOutput> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Step 1: Retrieve relevant chunks using vector search
    const searchResults = await vectorSearchService.hybridSearch(
      query,
      'rag-evaluation',
      {
        limit: opts.topK,
        threshold: 0.3,
        documentIds: documentId ? [documentId] : undefined,
        useRerank: opts.rerankingEnabled,
        rerankTopK: opts.topK * 2,
      },
    );

    // Extract text content from search results
    const retrievalContext = searchResults.results
      .map((result) => {
        // searchResults returns HybridSearchResult objects with content property
        if (result.content) {
          return result.content;
        }
        return '';
      })
      .filter((content) => content.length > 0);

    // Step 2: Generate answer using the retrieved context
    const systemPrompt = buildSystemPrompt(retrievalContext);
    const actualOutput = await generateAnswer(
      query,
      systemPrompt,
      opts.model,
      opts.temperature,
      opts.maxTokens,
    );

    return {
      actualOutput,
      retrievalContext,
      sources: searchResults.results.map((result) => ({
        id: result.chunkId,
        type: 'text',
        score: result.hybridScore,
        rerankScore: result.rerankScore,
        documentId: result.documentId,
        chunkIndex: result.chunkIndex,
      })),
    };
  } catch (error) {
    console.error('RAG pipeline execution failed:', error);
    throw new Error(
      `RAG pipeline failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Build system prompt with retrieved context
 */
function buildSystemPrompt(retrievalContext: string[]): string {
  if (retrievalContext.length === 0) {
    return `You are a helpful assistant for RoboRail system documentation. Please answer the user's question based on your knowledge. If you don't have specific information, please say so clearly.`;
  }

  return `You are a helpful assistant for RoboRail system documentation. Please answer the user's question based ONLY on the provided context from the documentation.

CONTEXT FROM DOCUMENTATION:
${retrievalContext.map((chunk, index) => `[${index + 1}] ${chunk}`).join('\n\n')}

Instructions:
- Answer based only on the provided context
- If the context doesn't contain enough information to answer the question, say so clearly
- Be precise and cite specific information from the context when possible
- Do not make up information not found in the context
- Keep your answer concise but complete`;
}

/**
 * Generate answer using the AI model
 */
async function generateAnswer(
  query: string,
  systemPrompt: string,
  model: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  try {
    const response = await generateText({
      model: google(model),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      temperature,
      maxTokens,
    });

    return response.text;
  } catch (error) {
    console.error('Answer generation failed:', error);
    throw new Error(
      `Answer generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Run multiple queries through the RAG pipeline
 */
export async function runRAGPipelineBatch(
  queries: string[],
  documentId?: string,
  options: RAGPipelineOptions = {},
): Promise<RAGSystemOutput[]> {
  const results: RAGSystemOutput[] = [];

  // Process queries sequentially to avoid overwhelming the system
  for (const query of queries) {
    try {
      const result = await runRAGPipeline(query, documentId, options);
      results.push(result);

      // Add delay between queries to respect rate limits
      if (queries.indexOf(query) < queries.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Failed to process query: "${query}"`, error);
      // Continue with other queries, but record the failure
      results.push({
        actualOutput: `Error: Failed to process query - ${error instanceof Error ? error.message : 'Unknown error'}`,
        retrievalContext: [],
        sources: [],
      });
    }
  }

  return results;
}

/**
 * Test the RAG pipeline with a simple query
 */
export async function testRAGPipeline(
  query = 'What is RoboRail?',
): Promise<RAGSystemOutput> {
  console.log(`Testing RAG pipeline with query: "${query}"`);

  const result = await runRAGPipeline(query);

  console.log('RAG Pipeline Test Results:');
  console.log('Query:', query);
  console.log('Retrieved Context Count:', result.retrievalContext.length);
  console.log('Generated Answer:', result.actualOutput);
  console.log('Sources Count:', result.sources?.length || 0);

  return result;
}

/**
 * Get available document IDs for testing
 */
export async function getAvailableDocumentIds(): Promise<string[]> {
  try {
    // This would typically query your database for available documents
    // For now, return placeholder IDs that might exist based on your data structure
    return [
      'doc_1_faq_roborail_measurement_v0_0_020524',
      'doc_2_operators_manual_roborail_v2_2_170424',
      'doc_3_confirm_the_calibration',
      'doc_4_faq_roborail_chuck_alignment_calibration_v0_0_080424',
      'doc_5_faq_roborail_calibration_v0_0_290324',
      'doc_6_faq_no_communication_to_pmac',
      'doc_7_faq_data_collection',
    ];
  } catch (error) {
    console.warn('Could not fetch document IDs:', error);
    return [];
  }
}
