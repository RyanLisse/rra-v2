# Enhanced RAG Types and System Documentation

## Overview

This document outlines the enhanced TypeScript types and system improvements implemented for Slice 17 of the RAG chat application. The enhancements provide better structural metadata handling, improved context assembly, and more sophisticated LLM prompting.

## Core Type Definitions

### EnhancedChatSource

An enhanced version of the basic `ChatSource` interface that includes comprehensive metadata about document structure and processing.

```typescript
interface EnhancedChatSource {
  // Core ChatSource properties
  id: string;
  title: string;
  content: string;
  chunkIndex: number;
  similarity: number;
  elementType?: string | null;
  pageNumber?: number | null;
  bbox?: any;
  
  // Enhanced document metadata
  documentId: string;
  fileName?: string;
  uploadedAt?: Date;
  
  // Enhanced structural metadata from ADE
  elementId?: string; // ADE element identifier
  confidence?: number; // ADE confidence score
  metadata?: Record<string, any>; // Additional element metadata
  
  // Context assembly metadata
  contextIndex: number; // Position in context list
  tokenCount?: number; // Estimated tokens for this source
  wasReranked?: boolean; // Whether this was reranked
  rerankScore?: number; // Reranking confidence score
}
```

### ContextAssemblyResult

Complete result from the enhanced context assembly process with detailed metadata and statistics.

```typescript
interface ContextAssemblyResult {
  formattedContext: string;
  sources: EnhancedChatSource[];
  totalTokens: number;
  searchStats: {
    totalResults: number;
    searchTimeMs: number;
    rerankTimeMs?: number;
    algorithm: string;
  };
  truncated: boolean;
  elementTypeDistribution: Record<string, number>;
}
```

## Enhanced System Prompts

### Basic RAG System Prompt

A comprehensive system prompt that instructs the LLM about document structure awareness:

- Document structure understanding (titles, headings, tables, figures, lists)
- Proper citation format with [Context X] references
- Structural prefixes for better context (e.g., "[TABLE] shows...", "[HEADING] indicates...")
- Page number references for precise documentation

### Enhanced RAG System Prompt

An adaptive system prompt that adjusts based on available structural data:

- **With structural data**: Includes information about ADE processing, bounding boxes, confidence scores
- **Without structural data**: Falls back to basic text search explanation
- **Element type awareness**: Lists available element types in the context

## Key Functions

### assembleEnhancedContext()

Main function for enhanced context assembly with complete metadata tracking:

```typescript
async function assembleEnhancedContext(
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
  }
): Promise<ContextAssemblyResult>
```

### createContextAwareSystemPrompt()

Creates an intelligent system prompt based on the context assembly results:

```typescript
function createContextAwareSystemPrompt(
  contextResult: ContextAssemblyResult
): string
```

## Element Type Priorities

The system includes predefined element type priorities for different query types:

- **Technical**: `['table_text', 'figure_caption', 'list_item', 'heading', 'title', 'paragraph']`
- **Procedural**: `['list_item', 'heading', 'title', 'table_text', 'paragraph', 'figure_caption']`
- **Conceptual**: `['title', 'heading', 'paragraph', 'figure_caption', 'table_text', 'list_item']`
- **Troubleshooting**: `['heading', 'list_item', 'table_text', 'paragraph', 'title', 'figure_caption']`

## Integration Examples

### Basic Enhanced RAG Query

```typescript
import { assembleEnhancedContext, createContextAwareSystemPrompt } from '@/lib/ai/context-formatter';

const contextResult = await assembleEnhancedContext(query, userId, {
  elementTypes: ['paragraph', 'title', 'list_item'],
  prioritizeElementTypes: ['title', 'heading'],
  maxContextTokens: 4000,
});

const systemPrompt = createContextAwareSystemPrompt(contextResult);
```

### Query-Specific Element Prioritization

```typescript
import { getElementTypePrioritiesForQuery } from '@/lib/ai/enhanced-rag-integration';

const priorities = getElementTypePrioritiesForQuery("How do I install the software?");
// Returns: ['list_item', 'heading', 'title', 'table_text', 'paragraph', 'figure_caption']
```

### Context Quality Analysis

```typescript
import { analyzeContextQuality } from '@/lib/ai/enhanced-rag-integration';

const analysis = analyzeContextQuality(contextResult);
// Returns: { qualityScore: 0.8, strengths: [...], recommendations: [...] }
```

## Error Handling

The system includes comprehensive error types:

- `RagError`: Base error class for RAG-related issues
- `ChatError`: Chat-specific errors
- `SearchError`: Search operation errors
- `DocumentProcessingError`: Document processing failures

## Type Exports

All enhanced types are exported from `@/lib/types`:

```typescript
export type {
  EnhancedChatSource,
  ContextAssemblyResult,
  ChatSession,
  ChatMessage,
  DocumentProcessingJob,
  RagConfig,
  SearchOptions,
  ModelConfig,
  // ... and more
};
```

## Usage Guidelines

1. **Always use `assembleEnhancedContext`** for new implementations instead of the deprecated `retrieveContextAndSources`
2. **Leverage element type filtering** for domain-specific queries
3. **Use context-aware system prompts** to improve LLM responses
4. **Monitor context quality** using the analysis functions
5. **Handle structural metadata** appropriately in UI components

## Migration Notes

- The `ChatSource` interface remains unchanged for backward compatibility
- `EnhancedChatSource` extends the functionality without breaking existing code
- The `retrieveContextAndSources` function is deprecated but still functional
- New implementations should use `assembleEnhancedContext` for better type safety

## Testing

The enhanced types and functions include comprehensive test coverage:

- Unit tests for type validation
- Integration tests for the enhanced pipeline
- Error handling tests
- Performance validation

See `tests/unit/types-validation.test.ts` and `tests/integration/enhanced-rag-pipeline.test.ts` for examples.