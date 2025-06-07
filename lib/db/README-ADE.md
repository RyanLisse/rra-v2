# ADE Schema Documentation

## Overview

This document describes the database schema enhancements for Slice 17 - Enriched LLM Prompts Using Structured ADE Output. The changes enable the storage and utilization of Advanced Document Extraction (ADE) metadata to improve RAG context quality.

## Schema Changes

### DocumentChunk Table Enhancements

The `DocumentChunk` table has been extended with three new nullable fields to store ADE metadata:

```sql
-- New fields added to DocumentChunk table
ALTER TABLE "DocumentChunk" ADD COLUMN "element_type" text;
ALTER TABLE "DocumentChunk" ADD COLUMN "page_number" integer;
ALTER TABLE "DocumentChunk" ADD COLUMN "bbox" jsonb;
```

#### Field Descriptions

- **`elementType`** (`text`, nullable): Stores the semantic type of the document element
  - Valid values: `'paragraph'`, `'title'`, `'figure_caption'`, `'table_text'`, `'list_item'`, `'header'`, `'footer'`, `'footnote'`
  - Used for context-aware chunk selection and prompt enrichment

- **`pageNumber`** (`integer`, nullable): Stores the page number where the element appears
  - Enables page-based filtering and spatial context awareness
  - Useful for maintaining document structure in RAG responses

- **`bbox`** (`jsonb`, nullable): Stores bounding box coordinates
  - Supports two formats:
    - Array format: `[x1, y1, x2, y2]` (simple coordinates)
    - Object format: `{x1, y1, x2, y2, confidence?}` (with optional confidence score)
  - Enables spatial querying and layout-aware processing

### Indexes Added

The following indexes have been created to optimize queries on the new fields:

```sql
CREATE INDEX "document_chunk_element_type_idx" ON "DocumentChunk" ("element_type");
CREATE INDEX "document_chunk_page_number_idx" ON "DocumentChunk" ("page_number");
CREATE INDEX "document_chunk_doc_page_idx" ON "DocumentChunk" ("documentId", "page_number");
```

## Helper Functions

The `ADEChunkHelpers` class provides convenient methods for working with ADE-enhanced chunks:

### Core Operations

```typescript
// Create chunk with ADE metadata
await ADEChunkHelpers.createChunkWithADE({
  documentId: 'doc-id',
  chunkIndex: '1',
  content: 'Chapter 1: Introduction',
  elementType: 'title',
  pageNumber: 1,
  bbox: [100, 200, 300, 250]
});

// Query by element type
const titles = await ADEChunkHelpers.getChunksByElementType('doc-id', 'title');

// Query by page number
const page1Chunks = await ADEChunkHelpers.getChunksByPage('doc-id', 1);
```

### Document Structure Analysis

```typescript
// Get document structure overview
const { titles, headers, structure } = await ADEChunkHelpers.getDocumentStructure('doc-id');

// Generate enriched context for LLM prompts
const context = await ADEChunkHelpers.generateEnrichedContext('doc-id', {
  includePageNumbers: true,
  includeElementTypes: true,
  includeStructuralContext: true,
  maxChunks: 50
});
```

### Spatial Queries

```typescript
// Get chunks in specific region of a page
const regionChunks = await ADEChunkHelpers.getChunksInRegion('doc-id', 1, {
  minX: 100,
  maxX: 400,
  minY: 200,
  maxY: 600
});
```

## Backward Compatibility

- All new fields are nullable, ensuring existing chunks continue to work
- Legacy chunks without ADE metadata will have `null` values for the new fields
- Existing queries and operations remain unaffected
- Helper functions gracefully handle both ADE and legacy chunks

## Usage Examples

### For Document Processing Agents

```typescript
// When processing ADE output, populate metadata
await ADEChunkHelpers.createChunkWithADE({
  documentId: document.id,
  chunkIndex: String(index),
  content: extractedText,
  elementType: adeOutput.element_type,
  pageNumber: adeOutput.page_number,
  bbox: adeOutput.bounding_box
});
```

### For Chat/RAG Agents

```typescript
// Get structured context for better prompts
const enrichedContext = await ADEChunkHelpers.generateEnrichedContext(documentId, {
  includeStructuralContext: true,
  includeElementTypes: true,
  maxChunks: 30
});

// Use structural elements for outline generation
const { titles, headers } = await ADEChunkHelpers.getDocumentStructure(documentId);
const outline = titles.map(title => ({
  content: title.content,
  page: title.pageNumber
}));
```

### For UI/Frontend Agents

```typescript
// Display page-based navigation
const pages = await Promise.all([1, 2, 3].map(page => 
  ADEChunkHelpers.getChunksByPage(documentId, page)
));

// Show document structure in sidebar
const { structure } = await ADEChunkHelpers.getDocumentStructure(documentId);
```

## Type Definitions

```typescript
export type ADEElementType = 
  | 'paragraph'
  | 'title'
  | 'figure_caption'
  | 'table_text'
  | 'list_item'
  | 'header'
  | 'footer'
  | 'footnote'
  | null;

export type BoundingBox = 
  | [number, number, number, number] 
  | { x1: number; y1: number; x2: number; y2: number; confidence?: number }
  | null;
```

## Migration Status

- **Migration File**: `0013_chunky_colonel_america.sql`
- **Applied**: ✅ Successfully applied
- **Tested**: ✅ Comprehensive test coverage
- **Backward Compatible**: ✅ All existing functionality preserved

## Testing

The implementation includes comprehensive tests covering:

- Backward compatibility with legacy chunks
- Creation and querying of ADE-enhanced chunks
- All helper functions
- Type validation
- Spatial queries
- Document structure analysis

Run tests with:
```bash
bun test tests/lib/ade-schema.test.ts tests/lib/ade-helpers.test.ts
```

## Next Steps for Other Agents

1. **Document Processing Agent**: Integrate ADE output parsing to populate the new metadata fields
2. **Chat Agent**: Use `generateEnrichedContext()` to create better prompts with structural awareness
3. **UI Agent**: Leverage page numbers and element types for enhanced document navigation
4. **Search Agent**: Implement element-type-aware ranking and filtering

The foundation is now ready for building enriched LLM prompts using structured ADE output!