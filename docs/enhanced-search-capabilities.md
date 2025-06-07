# Enhanced Search Capabilities with ADE Metadata

This document describes the enhanced search functionality that leverages Advanced Document Engineering (ADE) structural metadata to provide more intelligent and contextual search results.

## Overview

The enhanced search system extends the existing RAG search infrastructure to include structural metadata from document processing, enabling:

- **Element-type filtering**: Search specifically within titles, paragraphs, tables, etc.
- **Page-based search**: Filter results by specific page numbers
- **Spatial search**: Find content within specific regions of pages using bounding box coordinates
- **Enhanced context**: Provide richer metadata for improved citation and context assembly

## Enhanced SearchResult Interface

The `SearchResult` interface now includes additional ADE metadata fields:

```typescript
export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  similarity: number;
  metadata: any;
  chunkIndex: number;
  // Enhanced ADE structural metadata
  elementType?: string | null; // e.g., 'paragraph', 'title', 'figure_caption', 'table_text', 'list_item'
  pageNumber?: number | null; // page number where the element appears
  bbox?: any; // optional bounding box coordinates as [x1, y1, x2, y2]
}
```

## API Enhancements

### Faceted Search Options

The search API now supports enhanced facets in addition to existing document-level filters:

```typescript
{
  "query": "calibration process",
  "searchType": "hybrid",
  "facets": {
    // Traditional facets
    "documentTypes": ["pdf"],
    "dateRange": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-12-31T23:59:59Z"
    },
    "sources": ["manual.pdf"],
    "minChunkLength": 50,
    "maxChunkLength": 1000,
    
    // Enhanced ADE facets
    "elementTypes": ["paragraph", "title", "table_text"],
    "pageNumbers": [1, 2, 3],
    "spatialSearch": {
      "pageNumber": 2,
      "bbox": [100, 200, 400, 350] // [x1, y1, x2, y2]
    }
  }
}
```

### Element Type Filtering

Filter search results by document structure elements:

```typescript
// Search only in titles and paragraphs
{
  "query": "troubleshooting",
  "facets": {
    "elementTypes": ["title", "paragraph"]
  }
}
```

Common element types:
- `paragraph`: Regular text paragraphs
- `title`: Section headers and titles
- `table_text`: Content from tables
- `list_item`: Items from bulleted or numbered lists
- `figure_caption`: Image and figure captions
- `header`: Page headers
- `footer`: Page footers

### Page Number Filtering

Search within specific pages of documents:

```typescript
// Search only on pages 5, 6, and 7
{
  "query": "calibration steps",
  "facets": {
    "pageNumbers": [5, 6, 7]
  }
}
```

### Spatial Search

Find content within specific regions of a page using bounding box coordinates:

```typescript
// Search within a specific area of page 3
{
  "query": "error codes",
  "facets": {
    "spatialSearch": {
      "pageNumber": 3,
      "bbox": [100, 200, 400, 350] // [x1, y1, x2, y2]
    }
  }
}
```

The bounding box coordinates represent:
- `x1, y1`: Top-left corner coordinates
- `x2, y2`: Bottom-right corner coordinates

Spatial search uses bounding box intersection to find content that overlaps with the specified region.

## Database-Level Filtering

For optimal performance, element type and page number filtering is applied at the database level using SQL `ANY` operators:

```sql
-- Element type filtering
WHERE element_type = ANY(['paragraph', 'title'])

-- Page number filtering  
WHERE page_number = ANY([1, 2, 3])
```

This ensures that filtering happens before result ranking and reduces the amount of data processed in the application layer.

## Facet Counts and Analytics

The API provides counts for available facets to help users understand the data distribution:

```typescript
{
  "facets": {
    "available": {
      "elementTypes": {
        "paragraph": 250,
        "title": 45,
        "table_text": 30,
        "list_item": 120
      },
      "pageNumbers": {
        "1": 50,
        "2": 75,
        "3": 60,
        "4": 40
      }
    }
  }
}
```

## Search Flow Integration

The enhanced search capabilities integrate seamlessly with all existing search types:

### Vector Search
```typescript
const results = await vectorSearchService.vectorSearch(query, userId, {
  elementTypes: ['paragraph', 'title'],
  pageNumbers: [1, 2],
});
```

### Hybrid Search
```typescript
const results = await vectorSearchService.hybridSearch(query, userId, {
  elementTypes: ['table_text'],
  pageNumbers: [5],
});
```

### Context-Aware Search
```typescript
const results = await vectorSearchService.contextAwareSearch(
  query, 
  userId, 
  conversationContext, 
  {
    elementTypes: ['paragraph'],
    pageNumbers: [2, 3, 4],
  }
);
```

## Use Cases

### Technical Documentation Search

Search specifically in procedure titles:
```typescript
{
  "query": "maintenance procedure",
  "facets": {
    "elementTypes": ["title"]
  }
}
```

### Troubleshooting Table Lookup

Find error codes in tables:
```typescript
{
  "query": "error 404",
  "facets": {
    "elementTypes": ["table_text"]
  }
}
```

### Page-Specific Search

Search within a specific section of a manual:
```typescript
{
  "query": "calibration settings",
  "facets": {
    "pageNumbers": [15, 16, 17, 18, 19]
  }
}
```

### Spatial Content Discovery

Find content in the header or footer regions:
```typescript
{
  "query": "revision date",
  "facets": {
    "spatialSearch": {
      "pageNumber": 1,
      "bbox": [0, 0, 1000, 100] // Top of page
    }
  }
}
```

## Backward Compatibility

The enhanced search system maintains full backward compatibility:

- Existing search requests without ADE facets continue to work unchanged
- Legacy documents without ADE metadata return `null` for the new fields
- All existing search types and options remain functional

## Performance Considerations

1. **Database Indexing**: The system includes indexes on `element_type` and `page_number` for efficient filtering
2. **Query Optimization**: Filters are applied at the database level before similarity calculation
3. **Caching**: Enhanced search results are cached with the same mechanisms as traditional search
4. **Memory Usage**: Minimal additional memory overhead for the new metadata fields

## Testing

The enhanced search functionality includes comprehensive tests:

- Unit tests for filtering logic
- Integration tests for API validation
- Database query structure verification
- Spatial search intersection logic
- Backward compatibility verification

Run tests with:
```bash
bun test tests/lib/search-metadata-integration.test.ts
bun test tests/api/search-facets-validation.test.ts
bun test tests/integration/search-enhancement-integration.test.ts
```

## Future Enhancements

Potential future improvements to the enhanced search system:

1. **Relevance Scoring by Element Type**: Weight different element types differently in search results
2. **Semantic Element Classification**: Use ML to better classify document elements
3. **Cross-Page Spatial Search**: Search across multiple pages with spatial constraints
4. **Visual Search Integration**: Combine text and visual element matching
5. **Reading Order Awareness**: Consider document reading flow in result ranking