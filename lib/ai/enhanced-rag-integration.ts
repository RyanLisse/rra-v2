/**
 * Enhanced RAG Integration Example
 *
 * This file demonstrates how to use the enhanced RAG pipeline with structural metadata
 * for better context assembly and LLM prompting.
 */

import type { EnhancedChatSource, ContextAssemblyResult } from '@/lib/types';
import {
  assembleEnhancedContext,
  createContextAwareSystemPrompt,
} from './context-formatter';
import { enhancedRagSystemPrompt } from './prompts';

/**
 * Example of how to use the enhanced RAG pipeline
 */
export async function exampleEnhancedRAGQuery(
  query: string,
  userId: string,
  options: {
    focusElementTypes?: string[];
    prioritizeElementTypes?: string[];
    maxContextTokens?: number;
  } = {},
): Promise<{
  systemPrompt: string;
  context: string;
  sources: EnhancedChatSource[];
  metadata: {
    totalTokens: number;
    searchStats: any;
    elementTypeDistribution: Record<string, number>;
    hasStructuralData: boolean;
  };
}> {
  try {
    // Step 1: Assemble enhanced context with structural metadata
    const contextResult: ContextAssemblyResult = await assembleEnhancedContext(
      query,
      userId,
      {
        limit: 10,
        threshold: 0.3,
        elementTypes: options.focusElementTypes, // Filter by specific element types
        prioritizeElementTypes: options.prioritizeElementTypes, // Prioritize certain types
        maxContextTokens: options.maxContextTokens || 4000,
      },
    );

    // Step 2: Create context-aware system prompt
    const systemPrompt = createContextAwareSystemPrompt(contextResult);

    // Step 3: Analyze structural composition
    const hasStructuralData =
      Object.keys(contextResult.elementTypeDistribution).length > 0;
    const totalSources = new Set(contextResult.sources.map((s) => s.documentId))
      .size;

    return {
      systemPrompt,
      context: contextResult.formattedContext,
      sources: contextResult.sources,
      metadata: {
        totalTokens: contextResult.totalTokens,
        searchStats: {
          ...contextResult.searchStats,
          totalSources,
          hasReranking: contextResult.sources.some((s) => s.wasReranked),
        },
        elementTypeDistribution: contextResult.elementTypeDistribution,
        hasStructuralData,
      },
    };
  } catch (error) {
    console.error('Enhanced RAG query error:', error);
    throw error;
  }
}

/**
 * Example of query-specific element type prioritization
 */
export function getElementTypePrioritiesForQuery(query: string): string[] {
  const queryLower = query.toLowerCase();

  // Technical/procedural queries - prioritize structured content
  if (/\b(how|steps|process|procedure|install|configure)\b/i.test(query)) {
    return [
      'list_item',
      'heading',
      'title',
      'table_text',
      'paragraph',
      'figure_caption',
    ];
  }

  // Troubleshooting queries - prioritize diagnostic content
  if (/\b(error|issue|problem|fix|solve|troubleshoot)\b/i.test(query)) {
    return [
      'heading',
      'list_item',
      'table_text',
      'paragraph',
      'title',
      'figure_caption',
    ];
  }

  // Data/specification queries - prioritize tables and structured data
  if (/\b(specification|data|table|chart|figure|graph)\b/i.test(query)) {
    return [
      'table_text',
      'figure_caption',
      'title',
      'heading',
      'paragraph',
      'list_item',
    ];
  }

  // Conceptual queries - prioritize explanatory content
  if (/\b(what|explain|concept|theory|definition)\b/i.test(query)) {
    return [
      'title',
      'heading',
      'paragraph',
      'figure_caption',
      'table_text',
      'list_item',
    ];
  }

  // Default priority for general queries
  return [
    'title',
    'heading',
    'paragraph',
    'list_item',
    'table_text',
    'figure_caption',
  ];
}

/**
 * Example of creating specialized prompts for different query types
 */
export function createSpecializedSystemPrompt(
  contextResult: ContextAssemblyResult,
  queryType: 'technical' | 'troubleshooting' | 'conceptual' | 'comparative',
): string {
  const hasStructuralData =
    Object.keys(contextResult.elementTypeDistribution).length > 0;
  const elementTypes = Object.keys(contextResult.elementTypeDistribution);

  const basePrompt = enhancedRagSystemPrompt(hasStructuralData, elementTypes);

  const specialInstructions = {
    technical: `
TECHNICAL QUERY FOCUS:
- Pay special attention to step-by-step procedures in list items
- Reference specific table data and measurements when available
- Include page numbers for precise technical references
- Distinguish between setup instructions and operational procedures`,

    troubleshooting: `
TROUBLESHOOTING QUERY FOCUS:
- Prioritize error messages and diagnostic information
- Look for step-by-step resolution procedures in lists
- Reference specific error codes or symptoms mentioned in context
- Provide systematic approaches based on document structure`,

    conceptual: `
CONCEPTUAL QUERY FOCUS:
- Use titles and headings to establish conceptual hierarchy
- Draw from paragraph content for detailed explanations
- Reference figure captions for visual concept clarification
- Maintain logical flow from basic to advanced concepts`,

    comparative: `
COMPARATIVE QUERY FOCUS:
- Use table data for direct comparisons when available
- Reference multiple sources to show different perspectives
- Highlight structural differences in how topics are presented
- Draw distinctions based on document organization and content`,
  };

  return `${basePrompt}

${specialInstructions[queryType]}`;
}

/**
 * Example utility for analyzing context quality
 */
export function analyzeContextQuality(contextResult: ContextAssemblyResult): {
  qualityScore: number;
  strengths: string[];
  recommendations: string[];
} {
  const { sources, elementTypeDistribution, searchStats } = contextResult;

  let qualityScore = 0.5; // Base score
  const strengths: string[] = [];
  const recommendations: string[] = [];

  // Score based on source diversity
  const uniqueSources = new Set(sources.map((s) => s.documentId)).size;
  if (uniqueSources >= 3) {
    qualityScore += 0.2;
    strengths.push('Good source diversity');
  } else if (uniqueSources === 1) {
    recommendations.push('Consider uploading more relevant documents');
  }

  // Score based on structural data availability
  const structuralTypes = Object.keys(elementTypeDistribution).length;
  if (structuralTypes >= 3) {
    qualityScore += 0.2;
    strengths.push('Rich document structure available');
  } else if (structuralTypes === 0) {
    recommendations.push(
      'Documents may benefit from ADE processing for better structure',
    );
  }

  // Score based on reranking usage
  const rerankedSources = sources.filter((s) => s.wasReranked).length;
  if (rerankedSources > 0) {
    qualityScore += 0.1;
    strengths.push('AI-enhanced relevance ranking applied');
  }

  // Score based on average similarity
  const avgSimilarity =
    sources.reduce((sum, s) => sum + s.similarity, 0) / sources.length;
  if (avgSimilarity > 0.7) {
    qualityScore += 0.2;
    strengths.push('High relevance scores');
  } else if (avgSimilarity < 0.4) {
    recommendations.push('Query may need refinement for better matches');
  }

  return {
    qualityScore: Math.min(1.0, qualityScore),
    strengths,
    recommendations,
  };
}

/**
 * Example of how to format enhanced citations for UI display
 */
export function formatEnhancedCitations(sources: EnhancedChatSource[]): Array<{
  id: string;
  title: string;
  excerpt: string;
  metadata: {
    elementType?: string;
    pageNumber?: number;
    confidence?: number;
    wasReranked?: boolean;
  };
  displayText: string;
}> {
  return sources.map((source, index) => {
    const elementInfo = source.elementType
      ? `${source.elementType}${source.pageNumber ? ` (page ${source.pageNumber})` : ''}`
      : 'text chunk';

    const confidenceInfo = source.confidence
      ? ` (${Math.round(source.confidence * 100)}% confidence)`
      : '';

    const displayText = `[${index + 1}] ${source.title} - ${elementInfo}${confidenceInfo}`;

    return {
      id: source.id,
      title: source.title,
      excerpt:
        source.content.length > 150
          ? `${source.content.substring(0, 150)}...`
          : source.content,
      metadata: {
        elementType: source.elementType || undefined,
        pageNumber: source.pageNumber || undefined,
        confidence: source.confidence,
        wasReranked: source.wasReranked,
      },
      displayText,
    };
  });
}
