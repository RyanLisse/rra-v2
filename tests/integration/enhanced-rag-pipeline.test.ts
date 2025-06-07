import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { assembleEnhancedContext, createContextAwareSystemPrompt } from '@/lib/ai/context-formatter';
import { ragSystemPrompt, enhancedRagSystemPrompt } from '@/lib/ai/prompts';
import type { EnhancedChatSource, ContextAssemblyResult } from '@/lib/types';

describe('Enhanced RAG Pipeline Integration', () => {
  const mockUserId = 'test-user-123';

  it('should include enhanced system prompts', () => {
    // Test basic RAG system prompt
    expect(ragSystemPrompt).toContain('document structure');
    expect(ragSystemPrompt).toContain('CORE INSTRUCTIONS');
    expect(ragSystemPrompt).toContain('UNDERSTANDING DOCUMENT STRUCTURE');
    
    // Test enhanced RAG system prompt
    const enhancedPrompt = enhancedRagSystemPrompt(true, ['title', 'paragraph', 'table']);
    expect(enhancedPrompt).toContain('ENHANCED CONTEXT AVAILABLE');
    expect(enhancedPrompt).toContain('title, paragraph, table');
    
    // Test enhanced RAG system prompt without structural data
    const basicPrompt = enhancedRagSystemPrompt(false);
    expect(basicPrompt).toContain('basic text search');
  });

  it('should create context-aware system prompt from context result', () => {
    const mockContextResult: ContextAssemblyResult = {
      formattedContext: 'Mock context',
      sources: [] as EnhancedChatSource[],
      totalTokens: 100,
      searchStats: {
        totalResults: 5,
        searchTimeMs: 150,
        algorithm: 'hybrid',
      },
      truncated: false,
      elementTypeDistribution: {
        'title': 2,
        'paragraph': 3,
        'table': 1,
      },
    };

    const systemPrompt = createContextAwareSystemPrompt(mockContextResult);
    expect(systemPrompt).toContain('ENHANCED CONTEXT AVAILABLE');
    expect(systemPrompt).toContain('title, paragraph, table');
  });

  it('should handle enhanced chat sources properly', () => {
    const mockEnhancedSource: EnhancedChatSource = {
      id: 'chunk-123',
      title: 'Test Document',
      content: 'This is test content from a paragraph element.',
      chunkIndex: 1,
      similarity: 0.85,
      elementType: 'paragraph',
      pageNumber: 2,
      bbox: [10, 20, 100, 50],
      documentId: 'doc-456',
      contextIndex: 0,
      tokenCount: 12,
      wasReranked: true,
      rerankScore: 0.92,
      confidence: 0.95,
    };

    expect(mockEnhancedSource.elementType).toBe('paragraph');
    expect(mockEnhancedSource.pageNumber).toBe(2);
    expect(mockEnhancedSource.contextIndex).toBe(0);
    expect(mockEnhancedSource.wasReranked).toBe(true);
  });

  it('should validate enhanced types work with existing interfaces', () => {
    // Test that EnhancedChatSource includes all required properties
    const source: EnhancedChatSource = {
      id: 'test-id',
      title: 'Test Title',
      content: 'Test content',
      chunkIndex: 0,
      similarity: 0.8,
      elementType: 'paragraph',
      pageNumber: 1,
      documentId: 'doc-id',
      contextIndex: 0,
    };

    // Should be compatible with ChatSource interface through conversion
    const basicSource = {
      id: source.id,
      title: source.title,
      content: source.content,
      chunkIndex: source.chunkIndex,
      similarity: source.similarity,
      elementType: source.elementType,
      pageNumber: source.pageNumber,
      bbox: source.bbox,
    };

    expect(basicSource.id).toBe(source.id);
    expect(basicSource.elementType).toBe('paragraph');
  });

  it('should handle context assembly result properties', () => {
    const result: ContextAssemblyResult = {
      formattedContext: 'Test context',
      sources: [],
      totalTokens: 50,
      searchStats: {
        totalResults: 3,
        searchTimeMs: 100,
        algorithm: 'hybrid',
      },
      truncated: false,
      elementTypeDistribution: {
        'paragraph': 2,
        'title': 1,
      },
    };

    expect(result.elementTypeDistribution.paragraph).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.searchStats.algorithm).toBe('hybrid');
  });

  it('should handle empty element type distribution', () => {
    const result: ContextAssemblyResult = {
      formattedContext: 'Test context',
      sources: [],
      totalTokens: 50,
      searchStats: {
        totalResults: 0,
        searchTimeMs: 100,
        algorithm: 'hybrid',
      },
      truncated: false,
      elementTypeDistribution: {},
    };

    const systemPrompt = createContextAwareSystemPrompt(result);
    expect(systemPrompt).toContain('basic text search');
  });
});