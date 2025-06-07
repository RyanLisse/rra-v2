import type { HybridSearchResult } from '@/lib/search/vector-search';
import type { EnhancedChatSource, ContextAssemblyResult } from '@/lib/types';
import { enhancedRagSystemPrompt } from './prompts';

/**
 * Enhanced context source with structural metadata
 */
export interface ChatSource {
  id: string;
  title: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  // Enhanced ADE metadata
  elementType?: string | null;
  pageNumber?: number | null;
  bbox?: any;
}

/**
 * Context formatting options
 */
export interface ContextFormattingOptions {
  includeStructuralPrefixes: boolean;
  includeMetadata: boolean;
  includePageNumbers: boolean;
  includeBoundingBoxes: boolean;
  maxTokens?: number;
  prioritizeElementTypes?: string[]; // Prioritize certain element types
}

/**
 * Format search results into structured context for LLM prompts
 */
export function formatContextForLLM(
  results: HybridSearchResult[],
  options: ContextFormattingOptions = {
    includeStructuralPrefixes: true,
    includeMetadata: true,
    includePageNumbers: true,
    includeBoundingBoxes: false,
  },
): {
  formattedContext: string;
  sources: ChatSource[];
  totalTokens: number;
} {
  const sources: ChatSource[] = [];
  let formattedContext = '';
  let totalTokens = 0;

  // Sort results by priority if element types are specified
  const sortedResults = options.prioritizeElementTypes
    ? sortByElementTypePriority(results, options.prioritizeElementTypes)
    : results;

  for (const [index, result] of sortedResults.entries()) {
    // Create source object with structural metadata
    const source: ChatSource = {
      id: result.chunkId,
      title: result.documentTitle,
      content: result.content,
      chunkIndex: result.chunkIndex,
      similarity: result.hybridScore || result.similarity,
      elementType: result.elementType,
      pageNumber: result.pageNumber,
      bbox: result.bbox,
    };

    // Generate structural prefix
    const structuralPrefix = options.includeStructuralPrefixes
      ? getStructuralPrefix(result.elementType, result.pageNumber)
      : '';

    // Build context entry
    let contextEntry = `[Context ${index + 1}]\n`;
    
    if (options.includeMetadata) {
      contextEntry += `Source: ${result.documentTitle}\n`;
      contextEntry += `Chunk: ${result.chunkIndex}\n`;
      contextEntry += `Relevance: ${result.hybridScore?.toFixed(3) || result.similarity.toFixed(3)}\n`;
      
      if (result.elementType) {
        contextEntry += `Type: ${result.elementType}\n`;
      }
      
      if (options.includePageNumbers && result.pageNumber !== null && result.pageNumber !== undefined) {
        contextEntry += `Page: ${result.pageNumber}\n`;
      }
      
      if (options.includeBoundingBoxes && result.bbox && Array.isArray(result.bbox)) {
        contextEntry += `Position: [${result.bbox.join(', ')}]\n`;
      }
    }

    contextEntry += `Content: ${structuralPrefix}${result.content}\n\n`;

    // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
    const entryTokens = Math.ceil(contextEntry.length / 4);
    
    // Check token limit
    if (options.maxTokens && totalTokens + entryTokens > options.maxTokens) {
      break;
    }

    formattedContext += contextEntry;
    sources.push(source);
    totalTokens += entryTokens;
  }

  return {
    formattedContext,
    sources,
    totalTokens,
  };
}

/**
 * Sort results by element type priority
 */
function sortByElementTypePriority(
  results: HybridSearchResult[],
  priorityTypes: string[],
): HybridSearchResult[] {
  return [...results].sort((a, b) => {
    // First sort by element type priority
    const aPriority = a.elementType ? priorityTypes.indexOf(a.elementType) : -1;
    const bPriority = b.elementType ? priorityTypes.indexOf(b.elementType) : -1;
    
    if (aPriority !== bPriority) {
      // Higher priority (lower index) comes first, but handle -1 (not found) case
      if (aPriority === -1) return 1;
      if (bPriority === -1) return -1;
      return aPriority - bPriority;
    }
    
    // Then sort by relevance score
    return (b.hybridScore || b.similarity) - (a.hybridScore || a.similarity);
  });
}

/**
 * Generate a structural prefix for content based on element type and location
 */
function getStructuralPrefix(elementType?: string | null, pageNumber?: number | null): string {
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

/**
 * Create a context-aware system prompt that instructs the LLM about structural information
 */
export function createStructuredSystemPrompt(hasStructuralData: boolean = true): string {
  const basePrompt = `You are an intelligent assistant that provides accurate, helpful answers based on the provided context documents.`;
  
  if (!hasStructuralData) {
    return `${basePrompt}

INSTRUCTIONS:
1. Base your answers on the provided context documents
2. If the context doesn't contain sufficient information, clearly state this limitation
3. Include citations in the format [Context X] where appropriate
4. Provide specific, detailed answers when possible
5. If uncertain about information, express that uncertainty
6. Do not add information not present in the context`;
  }

  return `${basePrompt}

INSTRUCTIONS:
1. Base your answers on the provided context documents
2. Pay attention to document structure: titles, headings, tables, figures, and lists have different informational value
3. When referencing specific document elements, mention their type (e.g., "According to the table on page 3..." or "The heading indicates...")
4. Include citations in the format [Context X] where appropriate
5. Use structural information to provide more precise and contextual answers
6. If the context doesn't contain sufficient information, clearly state this limitation
7. If uncertain about information, express that uncertainty
8. Do not add information not present in the context

UNDERSTANDING DOCUMENT STRUCTURE:
- Titles and headings provide organizational context
- Table content contains structured data
- Figure captions explain visual elements  
- Lists present sequential or categorical information
- Paragraphs contain detailed explanations
- Use this structural information to provide more precise and contextual answers`;
}

/**
 * Enhanced context assembly with complete metadata tracking
 */
export async function assembleEnhancedContext(
  query: string,
  userId: string,
  options: {
    limit?: number;
    threshold?: number;
    documentIds?: string[];
    elementTypes?: string[];
    pageNumbers?: number[];
    prioritizeElementTypes?: string[];
    maxContextTokens?: number;
    includeSystemPrompt?: boolean;
  } = {},
): Promise<ContextAssemblyResult> {
  // Import the vector search service
  const { vectorSearchService } = await import('@/lib/search/vector-search');

  try {
    // Perform enhanced search with element type and page filtering
    const searchResponse = await vectorSearchService.hybridSearch(query, userId, {
      limit: options.limit || 10,
      threshold: options.threshold || 0.3,
      documentIds: options.documentIds,
      elementTypes: options.elementTypes,
      pageNumbers: options.pageNumbers,
      useRerank: true,
      rerankTopK: 15,
    });

    // Format context with structural information
    const { formattedContext, sources, totalTokens } = formatContextForLLM(
      searchResponse.results,
      {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: false,
        maxTokens: options.maxContextTokens || 4000,
        prioritizeElementTypes: options.prioritizeElementTypes,
      },
    );

    // Convert to enhanced sources with additional metadata
    const enhancedSources: EnhancedChatSource[] = sources.map((source, index) => {
      const originalResult = searchResponse.results.find(r => r.chunkId === source.id);
      return {
        ...source,
        documentId: originalResult?.documentId || '',
        contextIndex: index,
        tokenCount: Math.ceil(source.content.length / 4), // Rough token estimate
        wasReranked: !!originalResult?.rerankScore,
        rerankScore: originalResult?.rerankScore,
        confidence: originalResult?.metadata?.confidence,
        metadata: originalResult?.metadata,
      };
    });

    // Calculate element type distribution
    const elementTypeDistribution: Record<string, number> = {};
    enhancedSources.forEach(source => {
      if (source.elementType) {
        elementTypeDistribution[source.elementType] = (elementTypeDistribution[source.elementType] || 0) + 1;
      }
    });

    // Check if context was truncated
    const truncated = searchResponse.results.length > sources.length;

    return {
      formattedContext,
      sources: enhancedSources,
      totalTokens,
      searchStats: {
        totalResults: searchResponse.totalResults,
        searchTimeMs: searchResponse.searchTimeMs,
        rerankTimeMs: searchResponse.rerankTimeMs,
        algorithm: searchResponse.algorithmUsed || 'hybrid',
      },
      truncated,
      elementTypeDistribution,
    };
  } catch (error) {
    console.error('Enhanced context assembly error:', error);
    throw error;
  }
}

/**
 * Retrieve and format context for a query with enhanced metadata
 * @deprecated Use assembleEnhancedContext for better type safety and metadata
 */
export async function retrieveContextAndSources(
  query: string,
  userId: string,
  options: {
    limit?: number;
    threshold?: number;
    documentIds?: string[];
    elementTypes?: string[];
    pageNumbers?: number[];
    prioritizeElementTypes?: string[];
    maxContextTokens?: number;
  } = {},
): Promise<{
  formattedContext: string;
  sources: ChatSource[];
  totalTokens: number;
  searchStats: any;
}> {
  const result = await assembleEnhancedContext(query, userId, options);
  
  return {
    formattedContext: result.formattedContext,
    sources: result.sources.map(source => ({
      id: source.id,
      title: source.title,
      content: source.content,
      chunkIndex: source.chunkIndex,
      similarity: source.similarity,
      elementType: source.elementType,
      pageNumber: source.pageNumber,
      bbox: source.bbox,
    })), // Convert to basic ChatSource interface
    totalTokens: result.totalTokens,
    searchStats: result.searchStats,
  };
}

/**
 * Create a complete system prompt with context and structural awareness
 */
export function createContextAwareSystemPrompt(
  contextResult: ContextAssemblyResult,
): string {
  const hasStructuralData = Object.keys(contextResult.elementTypeDistribution).length > 0;
  const elementTypes = Object.keys(contextResult.elementTypeDistribution);
  
  return enhancedRagSystemPrompt(hasStructuralData, elementTypes);
}

/**
 * Element type priorities for different query types
 */
export const ELEMENT_TYPE_PRIORITIES = {
  technical: ['table_text', 'figure_caption', 'list_item', 'heading', 'title', 'paragraph'],
  procedural: ['list_item', 'heading', 'title', 'table_text', 'paragraph', 'figure_caption'],
  conceptual: ['title', 'heading', 'paragraph', 'figure_caption', 'table_text', 'list_item'],
  troubleshooting: ['heading', 'list_item', 'table_text', 'paragraph', 'title', 'figure_caption'],
} as const;