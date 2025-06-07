import { describe, it, expect } from 'vitest';
import { ADEChunkHelpers } from '@/lib/db/ade-helpers';

describe('ADE Helpers Unit Tests', () => {
  describe('Validation Functions', () => {
    it('should validate bounding boxes correctly', () => {
      // Test array format
      expect(ADEChunkHelpers.validateBoundingBox([10, 20, 100, 200])).toBe(true);
      
      // Test object format
      expect(ADEChunkHelpers.validateBoundingBox({ x1: 10, y1: 20, x2: 100, y2: 200 })).toBe(true);
      
      // Test null
      expect(ADEChunkHelpers.validateBoundingBox(null)).toBe(true);
      
      // Test invalid formats
      expect(ADEChunkHelpers.validateBoundingBox('invalid')).toBe(false);
      expect(ADEChunkHelpers.validateBoundingBox([1, 2, 3])).toBe(false); // Too few elements
      expect(ADEChunkHelpers.validateBoundingBox([1, 2, 3, 4, 5])).toBe(false); // Too many elements
      expect(ADEChunkHelpers.validateBoundingBox([1, 2, 'invalid', 4])).toBe(false); // Non-numeric
      expect(ADEChunkHelpers.validateBoundingBox({ x1: 10, y1: 20 })).toBe(false); // Missing coordinates
      expect(ADEChunkHelpers.validateBoundingBox({ x1: 'invalid', y1: 20, x2: 100, y2: 200 })).toBe(false);
    });

    it('should validate element types correctly', () => {
      // Valid types
      expect(ADEChunkHelpers.isValidElementType('paragraph')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('title')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('figure_caption')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('table_text')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('list_item')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('header')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('footer')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType('footnote')).toBe(true);
      expect(ADEChunkHelpers.isValidElementType(null)).toBe(true);
      
      // Invalid types
      expect(ADEChunkHelpers.isValidElementType('invalid_type')).toBe(false);
      expect(ADEChunkHelpers.isValidElementType(123)).toBe(false);
      expect(ADEChunkHelpers.isValidElementType(undefined)).toBe(false);
      expect(ADEChunkHelpers.isValidElementType({})).toBe(false);
      expect(ADEChunkHelpers.isValidElementType([])).toBe(false);
    });
  });

  describe('Type Definitions', () => {
    it('should have correct ADEElementType values', () => {
      // This test ensures our type definitions are working correctly
      // by checking that the validation function accepts all expected types
      const validTypes = [
        'paragraph',
        'title', 
        'figure_caption',
        'table_text',
        'list_item',
        'header',
        'footer',
        'footnote',
        null
      ];

      validTypes.forEach(type => {
        expect(ADEChunkHelpers.isValidElementType(type)).toBe(true);
      });
    });

    it('should handle bounding box type variations', () => {
      // Array format with proper numbers
      const arrayBbox = [0, 0, 100, 100];
      expect(ADEChunkHelpers.validateBoundingBox(arrayBbox)).toBe(true);

      // Object format with proper numbers
      const objectBbox = { x1: 0, y1: 0, x2: 100, y2: 100 };
      expect(ADEChunkHelpers.validateBoundingBox(objectBbox)).toBe(true);

      // Object format with confidence (extra property should be fine)
      const objectBboxWithConfidence = { x1: 0, y1: 0, x2: 100, y2: 100, confidence: 0.95 };
      expect(ADEChunkHelpers.validateBoundingBox(objectBboxWithConfidence)).toBe(true);

      // Edge case: negative coordinates (should be valid)
      const negativeBbox = [-10, -10, 50, 50];
      expect(ADEChunkHelpers.validateBoundingBox(negativeBbox)).toBe(true);

      // Edge case: zero-size bbox (should be valid)
      const zeroSizeBbox = [50, 50, 50, 50];
      expect(ADEChunkHelpers.validateBoundingBox(zeroSizeBbox)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed bounding box data gracefully', () => {
      const malformedInputs = [
        undefined,
        '',
        'string',
        42,
        true,
        false,
        [],
        [1],
        [1, 2],
        [1, 2, 3],
        [1, 2, 3, 4, 5, 6],
        {},
        { x1: 1 },
        { x1: 1, y1: 2 },
        { x1: 1, y1: 2, x2: 3 },
        { x: 1, y: 2, w: 3, h: 4 }, // Wrong property names
        { x1: null, y1: 2, x2: 3, y2: 4 },
        { x1: undefined, y1: 2, x2: 3, y2: 4 },
      ];

      malformedInputs.forEach(input => {
        expect(ADEChunkHelpers.validateBoundingBox(input)).toBe(false);
      });
    });

    it('should handle malformed element type data gracefully', () => {
      const malformedInputs = [
        undefined,
        '',
        'PARAGRAPH', // Wrong case
        'Title', // Wrong case
        123,
        true,
        false,
        [],
        {},
        'unknown_element',
        'random_string',
      ];

      malformedInputs.forEach(input => {
        expect(ADEChunkHelpers.isValidElementType(input)).toBe(false);
      });
    });
  });
});