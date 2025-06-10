/**
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import {
  formatContextForLLM,
  createStructuredSystemPrompt,
  ELEMENT_TYPE_PRIORITIES,
} from '@/lib/ai/context-formatter';
import type { HybridSearchResult } from '@/lib/search/vector-search';

describe('Context Assembly with ADE Metadata', () => {
  describe('formatContextForLLM', () => {
    const sampleResults: HybridSearchResult[] = [
      {
        chunkId: 'chunk-1',
        content: 'This is a paragraph about calibration procedures.',
        similarity: 0.85,
        hybridScore: 0.88,
        documentId: 'doc-1',
        documentTitle: 'RoboRail Manual',
        chunkIndex: 1,
        elementType: 'paragraph',
        pageNumber: 5,
        bbox: [100, 200, 400, 250],
      },
      {
        chunkId: 'chunk-2',
        content: '1. Connect the device\n2. Run calibration\n3. Verify results',
        similarity: 0.82,
        hybridScore: 0.85,
        documentId: 'doc-1',
        documentTitle: 'RoboRail Manual',
        chunkIndex: 3,
        elementType: 'list_item',
        pageNumber: 7,
        bbox: null,
      },
      {
        chunkId: 'chunk-3',
        content: 'Calibration Setup and Configuration',
        similarity: 0.9,
        hybridScore: 0.92,
        documentId: 'doc-1',
        documentTitle: 'RoboRail Manual',
        chunkIndex: 0,
        elementType: 'heading',
        pageNumber: 5,
        bbox: [50, 50, 550, 80],
      },
    ];

    it('should format context with structural prefixes', () => {
      const result = formatContextForLLM(sampleResults, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: false,
      });

      expect(result.formattedContext).toContain('[PARAGRAPH (Page 5)]');
      expect(result.formattedContext).toContain('[LIST ITEM (Page 7)]');
      expect(result.formattedContext).toContain('[HEADING (Page 5)]');
      expect(result.sources).toHaveLength(3);
    });

    it('should include ADE metadata in formatted output', () => {
      const result = formatContextForLLM(sampleResults, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: true,
      });

      expect(result.formattedContext).toContain('Type: paragraph');
      expect(result.formattedContext).toContain('Type: list_item');
      expect(result.formattedContext).toContain('Type: heading');
      expect(result.formattedContext).toContain('Page: 5');
      expect(result.formattedContext).toContain('Page: 7');
      expect(result.formattedContext).toContain(
        'Position: [100, 200, 400, 250]',
      );
      expect(result.formattedContext).toContain('Position: [50, 50, 550, 80]');
    });

    it('should properly handle missing ADE metadata', () => {
      const resultsWithMissingData: HybridSearchResult[] = [
        {
          chunkId: 'chunk-1',
          content: 'Some content without complete metadata',
          similarity: 0.8,
          documentId: 'doc-1',
          documentTitle: 'Test Doc',
          chunkIndex: 1,
          elementType: null,
          pageNumber: null,
          bbox: null,
        },
      ];

      const result = formatContextForLLM(resultsWithMissingData, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: true,
      });

      expect(result.formattedContext).not.toContain('Type:');
      expect(result.formattedContext).not.toContain('Page:');
      expect(result.formattedContext).not.toContain('Position:');
      expect(result.sources).toHaveLength(1);
    });

    it('should prioritize element types correctly', () => {
      const result = formatContextForLLM(sampleResults, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: false,
        prioritizeElementTypes: ['heading', 'list_item', 'paragraph'],
      });

      // Heading should come first despite lower original position
      expect(result.sources[0].elementType).toBe('heading');
      expect(result.sources[1].elementType).toBe('list_item');
      expect(result.sources[2].elementType).toBe('paragraph');
    });

    it('should respect token limits', () => {
      const result = formatContextForLLM(sampleResults, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: false,
        maxTokens: 100, // Very low limit
      });

      expect(result.totalTokens).toBeLessThanOrEqual(100);
      expect(result.sources.length).toBeLessThan(sampleResults.length);
    });

    it('should provide accurate token counting', () => {
      const result = formatContextForLLM(sampleResults, {
        includeStructuralPrefixes: true,
        includeMetadata: true,
        includePageNumbers: true,
        includeBoundingBoxes: false,
      });

      // Token count should be reasonable (roughly context length / 4)
      const expectedTokens = Math.ceil(result.formattedContext.length / 4);
      expect(result.totalTokens).toBeCloseTo(expectedTokens, -1); // Within 10% tolerance
    });
  });

  describe('createStructuredSystemPrompt', () => {
    it('should create enhanced prompt for data with structural information', () => {
      const prompt = createStructuredSystemPrompt(true);

      expect(prompt).toContain('Pay attention to document structure');
      expect(prompt).toContain('titles, headings, tables, figures, and lists');
      expect(prompt).toContain('According to the table on page');
      expect(prompt).toContain('UNDERSTANDING DOCUMENT STRUCTURE');
    });

    it('should create basic prompt for data without structural information', () => {
      const prompt = createStructuredSystemPrompt(false);

      expect(prompt).not.toContain('document structure');
      expect(prompt).not.toContain('UNDERSTANDING DOCUMENT STRUCTURE');
      expect(prompt).toContain(
        'Base your answers on the provided context documents',
      );
    });
  });

  describe('Element Type Priorities', () => {
    it('should define correct priorities for technical queries', () => {
      const priorities = ELEMENT_TYPE_PRIORITIES.technical;

      expect(priorities[0]).toBe('table_text'); // Technical data first
      expect(priorities[1]).toBe('figure_caption'); // Visual explanations second
      expect(priorities.includes('list_item')).toBe(true);
      expect(priorities.includes('heading')).toBe(true);
    });

    it('should define correct priorities for procedural queries', () => {
      const priorities = ELEMENT_TYPE_PRIORITIES.procedural;

      expect(priorities[0]).toBe('list_item'); // Steps first
      expect(priorities[1]).toBe('heading'); // Structure second
      expect(priorities.includes('table_text')).toBe(true);
    });

    it('should define correct priorities for conceptual queries', () => {
      const priorities = ELEMENT_TYPE_PRIORITIES.conceptual;

      expect(priorities[0]).toBe('title'); // Conceptual framing first
      expect(priorities[1]).toBe('heading'); // Structure second
      expect(priorities[2]).toBe('paragraph'); // Detailed explanations third
    });

    it('should define correct priorities for troubleshooting queries', () => {
      const priorities = ELEMENT_TYPE_PRIORITIES.troubleshooting;

      expect(priorities[0]).toBe('heading'); // Problem categories first
      expect(priorities[1]).toBe('list_item'); // Solution steps second
      expect(priorities.includes('table_text')).toBe(true);
    });
  });

  describe('Structural Prefix Generation', () => {
    it('should generate correct prefixes for different element types', () => {
      const testCases = [
        { elementType: 'title', pageNumber: 1, expected: '[TITLE (Page 1)] ' },
        {
          elementType: 'heading',
          pageNumber: 3,
          expected: '[HEADING (Page 3)] ',
        },
        {
          elementType: 'figure_caption',
          pageNumber: 5,
          expected: '[FIGURE CAPTION (Page 5)] ',
        },
        {
          elementType: 'table_text',
          pageNumber: 7,
          expected: '[TABLE (Page 7)] ',
        },
        {
          elementType: 'list_item',
          pageNumber: 9,
          expected: '[LIST ITEM (Page 9)] ',
        },
        {
          elementType: 'paragraph',
          pageNumber: 11,
          expected: '[PARAGRAPH (Page 11)] ',
        },
      ];

      testCases.forEach(({ elementType, pageNumber, expected }) => {
        const results: HybridSearchResult[] = [
          {
            chunkId: 'test',
            content: 'test content',
            similarity: 0.8,
            documentId: 'doc-1',
            documentTitle: 'Test',
            chunkIndex: 1,
            elementType,
            pageNumber,
            bbox: null,
          },
        ];

        const result = formatContextForLLM(results, {
          includeStructuralPrefixes: true,
          includeMetadata: false,
          includePageNumbers: false,
          includeBoundingBoxes: false,
        });

        expect(result.formattedContext).toContain(expected);
      });
    });

    it('should handle missing page numbers gracefully', () => {
      const results: HybridSearchResult[] = [
        {
          chunkId: 'test',
          content: 'test content',
          similarity: 0.8,
          documentId: 'doc-1',
          documentTitle: 'Test',
          chunkIndex: 1,
          elementType: 'heading',
          pageNumber: null,
          bbox: null,
        },
      ];

      const result = formatContextForLLM(results, {
        includeStructuralPrefixes: true,
        includeMetadata: false,
        includePageNumbers: false,
        includeBoundingBoxes: false,
      });

      expect(result.formattedContext).toContain('[HEADING] ');
      expect(result.formattedContext).not.toContain('(Page');
    });
  });
});
