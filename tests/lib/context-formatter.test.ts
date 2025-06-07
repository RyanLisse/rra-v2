import { describe, it, expect } from 'vitest';
import { 
  formatContextForLLM, 
  createStructuredSystemPrompt,
  ELEMENT_TYPE_PRIORITIES 
} from '@/lib/ai/context-formatter';
import type { HybridSearchResult } from '@/lib/search/vector-search';

describe('Context Formatter', () => {
  const mockSearchResults: HybridSearchResult[] = [
    {
      chunkId: '1',
      documentId: 'doc1',
      documentTitle: 'Technical Manual',
      content: 'This is a paragraph about calibration procedures.',
      similarity: 0.8,
      metadata: {},
      chunkIndex: 1,
      elementType: 'paragraph',
      pageNumber: 1,
      bbox: [100, 200, 300, 250],
      vectorScore: 0.8,
      textScore: 0.7,
      hybridScore: 0.85,
    },
    {
      chunkId: '2', 
      documentId: 'doc1',
      documentTitle: 'Technical Manual',
      content: 'Calibration Steps',
      similarity: 0.7,
      metadata: {},
      chunkIndex: 2,
      elementType: 'title',
      pageNumber: 1,
      bbox: null,
      vectorScore: 0.7,
      textScore: 0.6,
      hybridScore: 0.75,
    },
    {
      chunkId: '3',
      documentId: 'doc2', 
      documentTitle: 'FAQ Document',
      content: 'Step 1: Power on the device\nStep 2: Connect to network\nStep 3: Run calibration',
      similarity: 0.9,
      metadata: {},
      chunkIndex: 1,
      elementType: 'list_item',
      pageNumber: 2,
      bbox: null,
      vectorScore: 0.9,
      textScore: 0.8,
      hybridScore: 0.95,
    },
  ];

  describe('formatContextForLLM', () => {
    it('should format context with structural prefixes', () => {
      const result = formatContextForLLM(mockSearchResults, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: false,
      });

      expect(result.sources).toHaveLength(3);
      expect(result.formattedContext).toContain('[Context 1]');
      expect(result.formattedContext).toContain('[PARAGRAPH (Page 1)]');
      expect(result.formattedContext).toContain('[TITLE (Page 1)]');
      expect(result.formattedContext).toContain('[LIST ITEM (Page 2)]');
      expect(result.formattedContext).toContain('Technical Manual');
      expect(result.formattedContext).toContain('calibration procedures');
    });

    it('should include metadata when requested', () => {
      const result = formatContextForLLM(mockSearchResults, {
        includeStructuralPrefixes: false,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: true,
      });

      expect(result.formattedContext).toContain('Source: Technical Manual');
      expect(result.formattedContext).toContain('Chunk: 1');
      expect(result.formattedContext).toContain('Relevance: 0.850');
      expect(result.formattedContext).toContain('Type: paragraph');
      expect(result.formattedContext).toContain('Page: 1');
      expect(result.formattedContext).toContain('Position: [100, 200, 300, 250]');
    });

    it('should respect token limits', () => {
      const result = formatContextForLLM(mockSearchResults, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: false,
        maxTokens: 50, // Very low limit
      });

      expect(result.totalTokens).toBeLessThanOrEqual(50);
      expect(result.sources.length).toBeLessThan(mockSearchResults.length);
    });

    it('should prioritize element types when specified', () => {
      const result = formatContextForLLM(mockSearchResults, {
        includeStructuralPrefixes: true,
        includeMetadata: false,
        includePageNumbers: false,
        includeBoundingBoxes: false,
        prioritizeElementTypes: ['title', 'list_item', 'paragraph'],
      });

      // The title should come first despite lower similarity
      expect(result.sources[0].elementType).toBe('title');
      expect(result.sources[1].elementType).toBe('list_item');
      expect(result.sources[2].elementType).toBe('paragraph');
    });

    it('should handle missing metadata gracefully', () => {
      const resultsWithoutMetadata: HybridSearchResult[] = [
        {
          chunkId: '1',
          documentId: 'doc1',
          documentTitle: 'Simple Document',
          content: 'Content without metadata',
          similarity: 0.8,
          metadata: {},
          chunkIndex: 1,
          elementType: null,
          pageNumber: null,
          bbox: null,
          vectorScore: 0.8,
          textScore: 0.7,
          hybridScore: 0.85,
        },
      ];

      const result = formatContextForLLM(resultsWithoutMetadata, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: true,
      });

      expect(result.sources).toHaveLength(1);
      expect(result.formattedContext).toContain('Content without metadata');
      expect(result.formattedContext).not.toContain('[PARAGRAPH');
      expect(result.formattedContext).not.toContain('Type:');
      expect(result.formattedContext).not.toContain('Page:');
      expect(result.formattedContext).not.toContain('Position:');
    });
  });

  describe('createStructuredSystemPrompt', () => {
    it('should create enhanced prompt when structural data is available', () => {
      const prompt = createStructuredSystemPrompt(true);
      
      expect(prompt).toContain('Pay attention to document structure');
      expect(prompt).toContain('titles, headings, tables, figures, and lists');
      expect(prompt).toContain('UNDERSTANDING DOCUMENT STRUCTURE');
      expect(prompt).toContain('[Context X]');
    });

    it('should create basic prompt when no structural data', () => {
      const prompt = createStructuredSystemPrompt(false);
      
      expect(prompt).not.toContain('Pay attention to document structure');
      expect(prompt).not.toContain('UNDERSTANDING DOCUMENT STRUCTURE');
      expect(prompt).toContain('[Context X]');
      expect(prompt).toContain('Base your answers on the provided context documents');
    });
  });

  describe('ELEMENT_TYPE_PRIORITIES', () => {
    it('should have priority arrays for different query types', () => {
      expect(ELEMENT_TYPE_PRIORITIES.technical).toContain('table_text');
      expect(ELEMENT_TYPE_PRIORITIES.procedural).toContain('list_item');
      expect(ELEMENT_TYPE_PRIORITIES.conceptual).toContain('title');
      expect(ELEMENT_TYPE_PRIORITIES.troubleshooting).toContain('heading');
      
      // Each priority array should contain all element types
      Object.values(ELEMENT_TYPE_PRIORITIES).forEach(priorities => {
        expect(priorities).toHaveLength(6);
        expect(priorities).toContain('title');
        expect(priorities).toContain('heading');
        expect(priorities).toContain('paragraph');
        expect(priorities).toContain('table_text');
        expect(priorities).toContain('figure_caption');
        expect(priorities).toContain('list_item');
      });
    });
  });
});