# ADE Integration for Enhanced Document Processing

This document explains how the Advanced Document Extraction (ADE) integration enhances the document chunking and embedding generation process.

## Overview

The ADE integration provides structured document understanding by:

1. **Intelligent Chunking**: Creating chunks based on document structure (titles, paragraphs, tables, etc.) rather than just text length
2. **Enhanced Metadata**: Adding element type, page number, and bounding box information to each chunk
3. **Enriched Embeddings**: Including structural context in embedding generation for better retrieval
4. **Graceful Fallback**: Seamlessly falling back to traditional chunking when ADE is unavailable

## Key Components

### 1. DocumentProcessor Enhanced Methods

#### `createChunks()` - Now ADE-Aware
```typescript
await processor.createChunks({
  documentId,
  content: extractedText,
  db,
  filePath: document.filePath,
  useADE: true, // Enable ADE processing
});
```

**Features:**
- Automatically attempts ADE processing for PDF files
- Falls back to traditional chunking if ADE fails
- Creates chunks with enriched metadata

#### `generateEmbeddings()` - Context-Enhanced
```typescript
await processor.generateEmbeddings({
  chunks: chunkData,
  db,
});
```

**Features:**
- Automatically enriches text with ADE metadata before embedding
- Includes element type and page context
- Maintains backward compatibility

#### `processDocumentComplete()` - End-to-End Pipeline
```typescript
const result = await processor.processDocumentComplete({
  documentId,
  db,
  useADE: true,
  generateEmbeddings: true,
});
```

**Features:**
- Complete document processing pipeline
- Text extraction → ADE processing → Chunking → Embedding generation
- Comprehensive error handling and fallback

### 2. ADEChunkHelpers Utility Class

#### Creating ADE-Enhanced Chunks
```typescript
const chunk = await ADEChunkHelpers.createChunkWithADE({
  documentId,
  chunkIndex: '0',
  content: 'Document Title',
  elementType: 'title',
  pageNumber: 1,
  bbox: [50, 50, 500, 80],
  metadata: { is_primary_title: true },
});
```

#### Querying by Structure
```typescript
// Get all titles in the document
const titles = await ADEChunkHelpers.getChunksByElementType(documentId, 'title');

// Get all chunks on page 2
const page2Chunks = await ADEChunkHelpers.getChunksByPage(documentId, 2);

// Get document structure overview
const structure = await ADEChunkHelpers.getDocumentStructure(documentId);
```

#### Enhanced Context Generation
```typescript
const enrichedContext = await ADEChunkHelpers.generateEnrichedContext(documentId, {
  includePageNumbers: true,
  includeElementTypes: true,
  includeStructuralContext: true,
  maxChunks: 20,
});
```

## ADE Element Type Mapping

The system maps Landing AI ADE element types to our standardized schema:

| ADE Type | Schema Type | Description |
|----------|-------------|-------------|
| `paragraph` | `paragraph` | Regular text paragraphs |
| `title` | `title` | Document and section titles |
| `header` | `header` | Page headers and section headers |
| `footer` | `footer` | Page footers |
| `table` / `table_text` | `table_text` | Table content |
| `figure` / `caption` | `figure_caption` | Figure captions and descriptions |
| `list_item` | `list_item` | Bulleted or numbered list items |
| `footnote` | `footnote` | Footnotes and references |
| Unknown types | `paragraph` | Fallback for unrecognized types |

## Enhanced Embedding Context

When generating embeddings, the system enriches the text with structural context:

### Before (Traditional)
```
"This is the main title of the document"
```

### After (ADE-Enhanced)
```
"[TITLE] Page 1: This is the main title of the document"
```

### Special Context Markers
- `[DOCUMENT TITLE]` - Primary document title
- `[TABLE DATA]` - Table content
- Element type prefixes: `[TITLE]`, `[PARAGRAPH]`, `[TABLE_TEXT]`, etc.
- Page number context: `Page X:`

## Usage Examples

### Example 1: Basic ADE Processing
```typescript
import { DocumentProcessor } from '@/lib/document-processing/document-processor';
import { db } from '@/lib/db';

const processor = new DocumentProcessor();

// Process document with ADE
const result = await processor.processDocumentComplete({
  documentId: 'doc-123',
  db,
  useADE: true,
  generateEmbeddings: true,
});

console.log(`Created ${result.chunks.length} chunks`);
console.log(`ADE data available: ${result.chunks.some(c => c.elementType !== null)}`);
```

### Example 2: Working with ADE Chunks
```typescript
import { ADEChunkHelpers } from '@/lib/db/ade-helpers';

// Get document structure
const structure = await ADEChunkHelpers.getDocumentStructure(documentId);

// Generate enriched context for RAG
const context = await ADEChunkHelpers.generateEnrichedContext(documentId, {
  includeElementTypes: true,
  includePageNumbers: true,
  maxChunks: 30,
});

// Use context in RAG pipeline
const ragPrompt = `
Based on the following document context:

${context}

Answer the user's question: ${userQuestion}
`;
```

### Example 3: Fallback Handling
```typescript
const processor = new DocumentProcessor();

try {
  // Try ADE processing
  const result = await processor.processDocumentComplete({
    documentId,
    db,
    useADE: true,
  });
  
  const hasAdeData = result.chunks.some(c => c.elementType !== null);
  
  if (hasAdeData) {
    console.log('✓ ADE processing successful');
  } else {
    console.log('⚠ Fell back to traditional chunking');
  }
} catch (error) {
  console.error('Processing failed:', error);
  // Could implement additional fallback logic here
}
```

## Database Schema

The enhanced chunks include the following ADE metadata fields:

```sql
CREATE TABLE "DocumentChunk" (
  -- Existing fields
  id uuid PRIMARY KEY,
  documentId uuid NOT NULL,
  chunkIndex text NOT NULL,
  content text NOT NULL,
  
  -- ADE metadata fields
  element_type text, -- 'paragraph', 'title', 'table_text', etc.
  page_number integer, -- Page where element appears
  bbox jsonb, -- Bounding box coordinates [x1, y1, x2, y2]
  
  -- Other fields
  metadata json,
  tokenCount text,
  createdAt timestamp
);
```

## Error Handling and Fallbacks

### ADE Processing Failures
1. **Network/API Errors**: Falls back to traditional chunking
2. **Invalid PDF**: Falls back to traditional chunking
3. **Empty ADE Output**: Falls back to traditional chunking
4. **Processing Timeout**: Falls back to traditional chunking

### Graceful Degradation
- Embedding generation works with or without ADE metadata
- Existing documents without ADE data remain fully functional
- Search and retrieval work regardless of chunking method

## Performance Considerations

### ADE Processing
- **Time**: Adds 1-3 seconds per document
- **Memory**: Minimal overhead for metadata storage
- **API Calls**: One call per document to Landing AI

### Embedding Enhancement
- **Context Size**: Slightly larger text due to prefixes
- **Quality**: Improved due to structural context
- **Backward Compatibility**: Fully maintained

## Testing

The integration includes comprehensive tests:

- **Unit Tests**: ADE helper functions and validation
- **Integration Tests**: End-to-end document processing
- **Fallback Tests**: Error scenarios and graceful degradation
- **Performance Tests**: Processing time and memory usage

Run tests with:
```bash
bun test tests/lib/ade-helpers-unit.test.ts
bun test tests/lib/ade-simple-integration.test.ts
```

## Configuration

### Environment Variables
```bash
# Landing AI ADE API (optional - falls back to simulation)
LANDING_AI_API_KEY=your_api_key_here
LANDING_AI_ENDPOINT=https://api.landing.ai/v1/ade

# ADE Processing Options
ADE_TIMEOUT=30000
ADE_MAX_FILE_SIZE=52428800  # 50MB
ADE_RETRIES=3
```

### Simulation Mode
When `LANDING_AI_API_KEY` is not set or in test environment, the system uses realistic simulation:

- Generates mock ADE elements based on document characteristics
- Provides realistic processing delays
- Creates structured elements (titles, paragraphs, tables)
- Maintains full API compatibility

## Monitoring and Debugging

### Log Messages
- `[ADE] Processing document {id} with ADE` - Starting ADE processing
- `[ADE] Successfully processed document {id}, found {n} elements` - Success
- `[ADE] Failed to get ADE output for document {id}` - Fallback to traditional
- `[ADE] Created {n} chunks with ADE metadata` - Successful chunking
- `[ADE] Generated embeddings for batch {n}` - Embedding progress

### Health Checks
Monitor ADE integration health through:
- Document processing success rates
- ADE vs traditional chunking ratios
- Average processing times
- Error rates and types

## Future Enhancements

Planned improvements include:
1. **Multi-language Support**: Enhanced language detection and processing
2. **Image Extraction**: Processing figures and charts from documents
3. **Table Understanding**: Better handling of complex table structures
4. **Cross-Document Linking**: Connecting related content across documents
5. **Real-time Processing**: Stream-based processing for large documents