import { withAuthRequest } from '@/lib/auth/middleware';
import { vectorSearchService } from '@/lib/search/vector-search';
import { geminiRAGService } from '@/lib/ai/gemini-client';
import { ChatSDKError } from '@/lib/errors';
import { z } from 'zod';

const ragChatSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(1000, 'Message too long'),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      }),
    )
    .optional(),
  searchOptions: z
    .object({
      limit: z.number().min(1).max(20).optional(),
      threshold: z.number().min(0).max(1).optional(),
      documentIds: z.array(z.string().uuid()).optional(),
      useRerank: z.boolean().optional(),
      searchType: z
        .enum(['vector', 'hybrid', 'context-aware', 'multi-step'])
        .optional(),
      embeddingModel: z.enum(['v3.0', 'v4.0']).optional(),
    })
    .optional(),
  ragOptions: z
    .object({
      useMultiStepReasoning: z.boolean().optional(),
      confidenceThreshold: z.number().min(0).max(1).optional(),
      maxReasoningSteps: z.number().min(1).max(5).optional(),
      includeSourceAnalysis: z.boolean().optional(),
      contextWindow: z.number().min(1).max(10).optional(),
    })
    .optional(),
  streaming: z.boolean().default(false),
});

export const POST = withAuthRequest(async (request: Request, user) => {
  try {

    const body = await request.json();

    // Validate input
    const validation = ragChatSchema.safeParse(body);
    if (!validation.success) {
      return new ChatSDKError('bad_request:validation', 'Invalid chat parameters', {
        details: validation.error.errors,
      }).toResponse();
    }

    const {
      message,
      conversationHistory = [],
      searchOptions = {},
      ragOptions = {},
      streaming = false,
    } = validation.data;

    const {
      useMultiStepReasoning = false,
      confidenceThreshold = 0.3,
      maxReasoningSteps = 3,
      includeSourceAnalysis = true,
      contextWindow = 6,
    } = ragOptions;

    // Determine search strategy based on options and conversation context
    let searchResponse: any;
    const searchType = searchOptions?.searchType || 'hybrid';

    if (searchType === 'context-aware' && conversationHistory.length > 0) {
      // Use context-aware search with conversation history
      const recentContext = conversationHistory.slice(-contextWindow);
      searchResponse = await vectorSearchService.contextAwareSearch(
        message,
        user.id,
        recentContext,
        {
          limit: searchOptions?.limit || 8,
          threshold: searchOptions?.threshold || 0.3,
          documentIds: searchOptions?.documentIds,
          contextWeight: 0.2,
        },
      );
    } else if (searchType === 'multi-step') {
      // Use multi-step search for complex queries
      searchResponse = await vectorSearchService.multiStepSearch(
        message,
        user.id,
        {
          maxSteps: Math.min(maxReasoningSteps, 3),
          minResultsPerStep: 3,
          documentIds: searchOptions?.documentIds,
        },
      );
    } else {
      // Standard hybrid search
      searchResponse = await vectorSearchService.hybridSearch(
        message,
        user.id,
        {
          limit: searchOptions?.limit || 8,
          threshold: searchOptions?.threshold || 0.3,
          documentIds: searchOptions?.documentIds,
          useRerank: searchOptions?.useRerank !== false,
          vectorWeight: 0.7,
          textWeight: 0.3,
          rerankTopK: 15,
          expandQuery: true,
        },
      );
    }

    // Check if we have relevant context
    if (searchResponse.results.length === 0) {
      // Try fallback search with lower threshold if initial search fails
      const fallbackResponse = await vectorSearchService.hybridSearch(
        message,
        user.id,
        {
          limit: 5,
          threshold: 0.1, // Much lower threshold
          documentIds: searchOptions?.documentIds,
          useRerank: false,
          expandQuery: true,
        },
      );

      if (fallbackResponse.results.length === 0) {
        return Response.json({
          response:
            "I don't have any relevant documents to answer your question. Please ensure you have uploaded documents that contain information related to your query.",
          citations: [],
          sources: [],
          confidence: 0,
          searchStats: {
            totalResults: 0,
            searchTimeMs: searchResponse.searchTimeMs,
            fallbackAttempted: true,
          },
          suggestions: await generateSearchSuggestions(message, user.id),
        });
      }

      searchResponse = fallbackResponse;
    }

    // Build enhanced context for RAG with quality scoring
    const enhancedResults = await enhanceSearchResults(
      searchResponse.results,
      message,
      conversationHistory.slice(-contextWindow),
    );

    // Filter results by confidence threshold
    const qualityFilteredResults = enhancedResults.filter(
      (result) => result.qualityScore >= confidenceThreshold,
    );

    const ragContext = {
      chunks: qualityFilteredResults.map((result) => ({
        content: result.content,
        documentTitle: result.documentTitle,
        chunkIndex: result.chunkIndex,
        similarity: result.hybridScore,
        qualityScore: result.qualityScore,
        relevanceExplanation: result.relevanceExplanation,
        // Include enhanced ADE metadata for structured prompts
        elementType: result.elementType,
        pageNumber: result.pageNumber,
        bbox: result.bbox,
      })),
      totalSources: new Set(qualityFilteredResults.map((r) => r.documentTitle))
        .size,
      searchMetadata: {
        originalResults: searchResponse.results.length,
        filteredResults: qualityFilteredResults.length,
        searchType: searchResponse.algorithmUsed || searchType,
        averageQuality:
          qualityFilteredResults.reduce((sum, r) => sum + r.qualityScore, 0) /
          qualityFilteredResults.length,
      },
    };

    if (streaming) {
      // Return streaming response
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              const encoder = new TextEncoder();

              // Send initial metadata
              const metadata = {
                type: 'metadata',
                searchStats: {
                  totalResults: searchResponse.totalResults,
                  searchTimeMs: searchResponse.searchTimeMs,
                  rerankTimeMs: searchResponse.rerankTimeMs,
                },
                sources: ragContext.chunks.map((chunk) => ({
                  title: chunk.documentTitle,
                  elementType: chunk.elementType,
                  pageNumber: chunk.pageNumber,
                })),
              };

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(metadata)}\n\n`),
              );

              // Stream the RAG response
              const stream = geminiRAGService.generateRAGResponseStream(
                message,
                ragContext,
                conversationHistory,
              );

              for await (const chunk of stream) {
                const data = {
                  type: chunk.isComplete ? 'complete' : 'content',
                  content: chunk.content,
                  citations: chunk.citations,
                  sources: chunk.sources,
                };

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
                );
              }

              controller.close();
            } catch (error) {
              console.error('RAG streaming error:', error);
              const errorData = {
                type: 'error',
                error: 'Failed to generate response',
              };
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify(errorData)}\n\n`,
                ),
              );
              controller.close();
            }
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        },
      );
    }

    // Generate enhanced RAG response with multi-step reasoning if enabled
    let ragResponse: any;

    if (useMultiStepReasoning && qualityFilteredResults.length > 0) {
      ragResponse = await generateMultiStepResponse(
        message,
        ragContext,
        conversationHistory,
        maxReasoningSteps,
      );
    } else {
      ragResponse = await geminiRAGService.generateRAGResponse(
        message,
        ragContext,
        conversationHistory,
      );
    }

    // Enhance response with source analysis if requested
    if (includeSourceAnalysis) {
      ragResponse = await addSourceAnalysis(
        ragResponse,
        qualityFilteredResults,
      );
    }

    return Response.json({
      response: ragResponse.content,
      citations: ragResponse.citations,
      sources: ragResponse.sources,
      confidence: ragResponse.confidence,
      reasoning: ragResponse.reasoning || undefined,
      sourceAnalysis: ragResponse.sourceAnalysis || undefined,
      searchStats: {
        totalResults: searchResponse.totalResults,
        searchTimeMs: searchResponse.searchTimeMs,
        rerankTimeMs: searchResponse.rerankTimeMs,
        queryTokens: searchResponse.queryEmbeddingTokens,
        queryExpansions: searchResponse.queryExpansions,
        cacheHit: searchResponse.cacheHit,
        searchType: searchResponse.algorithmUsed || searchType,
      },
      contextStats: {
        totalChunks: ragContext.chunks.length,
        totalSources: ragContext.totalSources,
        avgSimilarity:
          ragContext.chunks.reduce((sum, chunk) => sum + chunk.similarity, 0) /
          ragContext.chunks.length,
        avgQuality: ragContext.searchMetadata.averageQuality,
        originalResults: ragContext.searchMetadata.originalResults,
        filteredResults: ragContext.searchMetadata.filteredResults,
      },
      performance: {
        multiStepUsed: useMultiStepReasoning,
        sourceAnalysisIncluded: includeSourceAnalysis,
        confidenceThreshold,
      },
    });
  } catch (error) {
    console.error('RAG chat endpoint error:', error);

    if (error instanceof Error) {
      // Handle specific errors
      if (error.message.includes('search failed')) {
        return new ChatSDKError('service_unavailable:search', 'Unable to search documents at this time').toResponse();
      }

      if (error.message.includes('RAG response generation failed')) {
        return new ChatSDKError('service_unavailable:ai', 'Unable to generate response at this time').toResponse();
      }
    }

    return new ChatSDKError('internal:rag', 'Internal server error', {
      debug:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    }).toResponse();
  }
});

/**
 * Generate search suggestions when no results are found
 */
async function generateSearchSuggestions(
  query: string,
  userId: string,
): Promise<string[]> {
  try {
    // Extract key terms from the query
    const words = query.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    const suggestions: string[] = [];

    // Try simpler variations of the query
    if (words.length > 1) {
      // Try each word individually
      for (const word of words.slice(0, 3)) {
        suggestions.push(word);
      }

      // Try pairs of words
      for (let i = 0; i < Math.min(words.length - 1, 2); i++) {
        suggestions.push(`${words[i]} ${words[i + 1]}`);
      }
    }

    // Add common technical terms if query seems technical
    if (/\b(error|issue|problem|config|setup)\b/i.test(query)) {
      suggestions.push('troubleshooting', 'configuration', 'installation');
    }

    return suggestions.slice(0, 5);
  } catch (error) {
    console.error('Error generating search suggestions:', error);
    return [];
  }
}

/**
 * Enhance search results with quality scoring and relevance analysis
 */
async function enhanceSearchResults(
  results: any[],
  query: string,
  conversationContext: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<any[]> {
  const enhancedResults = await Promise.all(
    results.map(async (result) => {
      // Calculate quality score based on multiple factors
      let qualityScore = result.hybridScore || result.similarity;

      // Boost for exact term matches
      const queryWords = query.toLowerCase().split(/\s+/);
      const contentWords = result.content.toLowerCase();
      const exactMatches = queryWords.filter((word) =>
        contentWords.includes(word),
      ).length;

      if (exactMatches > 0) {
        qualityScore += (exactMatches / queryWords.length) * 0.1;
      }

      // Boost for context relevance
      if (conversationContext.length > 0) {
        const contextText = conversationContext
          .map((msg) => msg.content)
          .join(' ')
          .toLowerCase();

        const contextRelevance =
          queryWords.filter((word) => contextText.includes(word)).length /
          queryWords.length;

        qualityScore += contextRelevance * 0.05;
      }

      // Penalty for very short content
      if (result.content.length < 100) {
        qualityScore *= 0.9;
      }

      // Generate relevance explanation
      const relevanceExplanation = generateRelevanceExplanation(
        result,
        query,
        exactMatches,
      );

      return {
        ...result,
        qualityScore: Math.min(1.0, qualityScore),
        relevanceExplanation,
      };
    }),
  );

  // Sort by quality score
  return enhancedResults.sort((a, b) => b.qualityScore - a.qualityScore);
}

/**
 * Generate explanation for why a result is relevant
 */
function generateRelevanceExplanation(
  result: any,
  query: string,
  exactMatches: number,
): string {
  const reasons: string[] = [];

  if (exactMatches > 0) {
    reasons.push(`Contains ${exactMatches} matching terms from your query`);
  }

  if (result.hybridScore > 0.8) {
    reasons.push('High semantic similarity to your question');
  } else if (result.hybridScore > 0.6) {
    reasons.push('Good semantic match to your question');
  }

  if (result.rerankScore && result.rerankScore > 0.8) {
    reasons.push('Identified as highly relevant by AI reranking');
  }

  return reasons.length > 0
    ? reasons.join(', ')
    : 'General topical relevance to your query';
}

/**
 * Generate multi-step reasoning response
 */
async function generateMultiStepResponse(
  query: string,
  ragContext: any,
  conversationHistory: any[],
  maxSteps: number,
): Promise<any> {
  const reasoningSteps: Array<{
    step: number;
    reasoning: string;
    evidence: string[];
    conclusion: string;
  }> = [];

  try {
    // Step 1: Analyze the query and identify key components
    const queryAnalysis = await analyzeQuery(query);
    reasoningSteps.push({
      step: 1,
      reasoning: 'Query Analysis',
      evidence: [
        `Query type: ${queryAnalysis.type}`,
        `Key concepts: ${queryAnalysis.concepts.join(', ')}`,
      ],
      conclusion: `This appears to be a ${queryAnalysis.type} question about ${queryAnalysis.concepts.join(' and ')}.`,
    });

    // Step 2: Evaluate available evidence
    const evidenceEvaluation = evaluateEvidence(
      ragContext.chunks,
      queryAnalysis,
    );
    reasoningSteps.push({
      step: 2,
      reasoning: 'Evidence Evaluation',
      evidence: evidenceEvaluation.sources,
      conclusion: evidenceEvaluation.summary,
    });

    // Step 3: Synthesize response
    const finalResponse = await geminiRAGService.generateRAGResponse(
      query,
      ragContext,
      conversationHistory,
    );

    reasoningSteps.push({
      step: 3,
      reasoning: 'Response Synthesis',
      evidence: [
        'Combined evidence from multiple sources',
        'Applied domain knowledge',
      ],
      conclusion:
        'Generated comprehensive response based on available evidence.',
    });

    return {
      ...finalResponse,
      reasoning: {
        steps: reasoningSteps,
        methodology: 'multi-step-analysis',
        confidence: calculateReasoningConfidence(reasoningSteps, ragContext),
      },
    };
  } catch (error) {
    console.error('Multi-step reasoning error:', error);
    // Fallback to standard response
    return await geminiRAGService.generateRAGResponse(
      query,
      ragContext,
      conversationHistory,
    );
  }
}

/**
 * Analyze query to identify type and key concepts
 */
async function analyzeQuery(query: string): Promise<{
  type: 'how-to' | 'troubleshooting' | 'factual' | 'comparative' | 'general';
  concepts: string[];
  complexity: 'low' | 'medium' | 'high';
}> {
  // Simple rule-based analysis (could be enhanced with AI)
  let type: any = 'general';

  if (/\b(how|steps|process|procedure)\b/i.test(query)) {
    type = 'how-to';
  } else if (/\b(error|issue|problem|fix|solve|troubleshoot)\b/i.test(query)) {
    type = 'troubleshooting';
  } else if (/\b(what|when|where|who)\b/i.test(query)) {
    type = 'factual';
  } else if (/\b(compare|versus|vs|difference|better)\b/i.test(query)) {
    type = 'comparative';
  }

  // Extract key concepts (nouns and technical terms)
  const concepts =
    query
      .toLowerCase()
      .match(/\b[a-z]{3,}\b/g)
      ?.filter(
        (word) =>
          !['the', 'and', 'but', 'for', 'with', 'how', 'what', 'when'].includes(
            word,
          ),
      )
      ?.slice(0, 5) || [];

  const complexity =
    query.length > 100
      ? 'high'
      : query.split(' ').length > 10
        ? 'medium'
        : 'low';

  return { type, concepts, complexity };
}

/**
 * Evaluate evidence quality and relevance
 */
function evaluateEvidence(
  chunks: any[],
  queryAnalysis: any,
): {
  sources: string[];
  summary: string;
  strength: 'strong' | 'moderate' | 'weak';
} {
  const sources = chunks.map(
    (chunk) =>
      `${chunk.documentTitle} (relevance: ${(chunk.qualityScore * 100).toFixed(0)}%)`,
  );

  const avgQuality =
    chunks.reduce((sum, chunk) => sum + chunk.qualityScore, 0) / chunks.length;
  const sourceCount = new Set(chunks.map((c) => c.documentTitle)).size;

  let strength: 'strong' | 'moderate' | 'weak' = 'weak';
  if (avgQuality > 0.7 && sourceCount >= 2) {
    strength = 'strong';
  } else if (avgQuality > 0.5 || sourceCount >= 2) {
    strength = 'moderate';
  }

  const summary = `Found ${chunks.length} relevant chunks from ${sourceCount} sources with ${strength} evidence quality (avg: ${(avgQuality * 100).toFixed(0)}%).`;

  return { sources, summary, strength };
}

/**
 * Calculate confidence score for reasoning process
 */
function calculateReasoningConfidence(steps: any[], ragContext: any): number {
  let confidence = 0.5; // Base confidence

  // Boost for successful multi-step analysis
  if (steps.length >= 3) {
    confidence += 0.2;
  }

  // Boost for high-quality evidence
  if (ragContext.searchMetadata.averageQuality > 0.7) {
    confidence += 0.2;
  }

  // Boost for multiple sources
  if (ragContext.totalSources >= 2) {
    confidence += 0.1;
  }

  return Math.min(1.0, confidence);
}

/**
 * Add detailed source analysis to the response
 */
async function addSourceAnalysis(
  ragResponse: any,
  results: any[],
): Promise<any> {
  const sourceAnalysis = {
    totalSources: new Set(results.map((r) => r.documentTitle)).size,
    sourceBreakdown: {} as Record<string, any>,
    qualityDistribution: {
      high: results.filter((r) => r.qualityScore > 0.7).length,
      medium: results.filter(
        (r) => r.qualityScore > 0.4 && r.qualityScore <= 0.7,
      ).length,
      low: results.filter((r) => r.qualityScore <= 0.4).length,
    },
    recommendations: [] as string[],
  };

  // Analyze each source
  const sourceGroups = results.reduce(
    (groups, result) => {
      const source = result.documentTitle;
      if (!groups[source]) {
        groups[source] = [];
      }
      groups[source].push(result);
      return groups;
    },
    {} as Record<string, any[]>,
  );

  for (const [sourceName, sourceResults] of Object.entries(sourceGroups)) {
    const resultsArray = sourceResults as any[];
    const avgQuality =
      resultsArray.reduce((sum, r) => sum + r.qualityScore, 0) /
      resultsArray.length;
    const chunkCount = resultsArray.length;

    sourceAnalysis.sourceBreakdown[sourceName] = {
      chunkCount,
      avgQuality: Math.round(avgQuality * 100) / 100,
      contribution: `${Math.round((chunkCount / results.length) * 100)}% of evidence`,
    };
  }

  // Generate recommendations
  if (
    sourceAnalysis.qualityDistribution.low >
    sourceAnalysis.qualityDistribution.high
  ) {
    sourceAnalysis.recommendations.push(
      'Consider refining your query for more precise results',
    );
  }

  if (sourceAnalysis.totalSources === 1) {
    sourceAnalysis.recommendations.push(
      'Response based on single source - consider uploading additional relevant documents',
    );
  }

  if (results.every((r) => r.qualityScore < 0.5)) {
    sourceAnalysis.recommendations.push(
      'Low relevance scores detected - the available documents may not fully address your question',
    );
  }

  return {
    ...ragResponse,
    sourceAnalysis,
  };
}
