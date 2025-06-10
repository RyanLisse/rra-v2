# Multimodal Document Processing Database Schema Implementation

## Overview

This document outlines the comprehensive database schema updates implemented to support multimodal document processing with Landing AI ADE integration. The changes enable the system to handle PDF-to-image conversion, store document images, and create embeddings for both text and visual content.

## Schema Changes Summary

### 1. Enhanced RAGDocument Status Enum

**Added new status values:**
- `images_extracted` - Document pages converted to images
- `ade_processing` - Currently processing with Landing AI ADE
- `ade_processed` - ADE processing completed
- `error_image_extraction` - Error during image extraction
- `error_ade_processing` - Error during ADE processing

**Processing Pipeline Flow:**
```
uploaded → processing → text_extracted → images_extracted → ade_processing → ade_processed → chunked → embedded → processed
```

### 2. New DocumentImage Table

**Purpose:** Store PDF page images for multimodal processing and ADE integration.

```typescript
export const documentImage = pgTable('DocumentImage', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  documentId: uuid('documentId').notNull().references(() => ragDocument.id, { onDelete: 'cascade' }),
  pageNumber: integer('pageNumber').notNull(),
  imagePath: text('imagePath').notNull(), // Local file path to the image
  imageUrl: text('imageUrl'), // Optional URL for cloud storage
  width: integer('width'), // Image width in pixels
  height: integer('height'), // Image height in pixels
  fileSize: integer('fileSize'), // Image file size in bytes
  mimeType: text('mimeType').notNull().default('image/png'), // MIME type
  extractedBy: varchar('extractedBy', { 
    enum: ['pdf_conversion', 'landing_ai_ade', 'manual_upload'] 
  }).notNull().default('pdf_conversion'),
  extractionMetadata: jsonb('extractionMetadata'), // Additional extraction details
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});
```

**Key Features:**
- Links images to specific document pages
- Supports multiple extraction methods (PDF conversion, ADE, manual upload)
- Stores image metadata (dimensions, file size, MIME type)
- Prevents duplicate images per document page via unique constraint
- Comprehensive indexing for efficient queries

### 3. Enhanced DocumentChunk Table

**Added ADE metadata fields:**
```typescript
confidence: decimal('confidence', { precision: 3, scale: 2 }), // ADE confidence score 0.00-1.00
adeElementId: text('ade_element_id'), // Original ADE element ID for traceability
```

**Purpose:** 
- Store ADE confidence scores for quality assessment
- Maintain traceability to original ADE processing results
- Enable filtering and ranking based on extraction confidence

### 4. Multimodal DocumentEmbedding Table

**Complete redesign for multimodal support:**

```typescript
export const documentEmbedding = pgTable('DocumentEmbedding', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  documentId: uuid('documentId').notNull().references(() => ragDocument.id, { onDelete: 'cascade' }),
  // Either chunkId OR imageId must be set (for text or image embeddings)
  chunkId: uuid('chunkId').references(() => documentChunk.id, { onDelete: 'cascade' }),
  imageId: uuid('imageId').references(() => documentImage.id, { onDelete: 'cascade' }),
  embeddingType: varchar('embeddingType', { 
    enum: ['text', 'image', 'multimodal'] 
  }).notNull().default('text'),
  embedding: text('embedding').notNull(), // JSON array of floats
  model: text('model').notNull().default('cohere-embed-v4.0'),
  dimensions: integer('dimensions').notNull().default(1024), // Embedding vector size
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});
```

**Key Features:**
- Supports both text and image embeddings in the same table
- Either `chunkId` OR `imageId` is populated (mutual exclusivity)
- `embeddingType` field enables filtering by content type
- Direct `documentId` reference for efficient document-level queries
- Extensive indexing for multimodal search operations

## Database Relationships

### Updated Relations Schema

```typescript
// RAGDocument Relations
export const ragDocumentRelations = relations(ragDocument, ({ one, many }) => ({
  content: one(documentContent),
  chunks: many(documentChunk),
  images: many(documentImage), // NEW: Image relations
  embeddings: many(documentEmbedding), // NEW: Direct embedding access
}));

// DocumentImage Relations  
export const documentImageRelations = relations(documentImage, ({ one, many }) => ({
  document: one(ragDocument),
  embeddings: many(documentEmbedding), // NEW: Image embedding relations
}));

// DocumentChunk Relations
export const documentChunkRelations = relations(documentChunk, ({ one, many }) => ({
  document: one(ragDocument),
  embeddings: many(documentEmbedding), // UPDATED: Multiple embeddings per chunk
}));

// DocumentEmbedding Relations
export const documentEmbeddingRelations = relations(documentEmbedding, ({ one }) => ({
  document: one(ragDocument),
  chunk: one(documentChunk), // Optional for text embeddings
  image: one(documentImage), // Optional for image embeddings  
}));
```

## Migration Commands

### Generate Migration
```bash
bun run db:generate
```

### Apply Migration
```bash
bun run db:migrate
```

### Verify Migration (Optional)
```bash
bun run db:studio
```

## Data Constraints and Validation

### DocumentEmbedding Constraints
The table design ensures data integrity through:

1. **Mutual Exclusivity:** Either `chunkId` OR `imageId` must be populated, not both
2. **Type Consistency:** `embeddingType` must match the populated foreign key
3. **Document Reference:** All embeddings maintain direct document relationship

### Recommended Database Constraint (Add via Raw SQL)
```sql
ALTER TABLE "DocumentEmbedding" 
ADD CONSTRAINT embedding_type_consistency 
CHECK (
  (embedding_type = 'text' AND chunk_id IS NOT NULL AND image_id IS NULL) OR
  (embedding_type = 'image' AND image_id IS NOT NULL AND chunk_id IS NULL) OR
  (embedding_type = 'multimodal' AND (chunk_id IS NOT NULL OR image_id IS NOT NULL))
);
```

## Performance Optimizations

### Indexing Strategy

**DocumentImage Indexes:**
- `document_id` - Document-level image queries
- `page_number` - Page-specific lookups
- `(document_id, page_number, extracted_by)` - Unique constraint and fast lookups
- `extracted_by` - Filter by extraction method
- `created_at` - Temporal queries

**DocumentEmbedding Indexes:**
- `document_id` - Document-level embedding queries
- `embedding_type` - Filter by content type
- `(document_id, embedding_type)` - Composite multimodal queries
- `chunk_id` - Text embedding lookups
- `image_id` - Image embedding lookups
- `model` - Model-specific queries

### Query Performance Considerations

1. **Multimodal Search:** Use composite indexes for efficient filtering
2. **Type-Specific Queries:** Leverage `embeddingType` index for focused searches
3. **Document-Level Aggregation:** Direct `documentId` relationships enable fast joins
4. **Confidence Filtering:** New confidence field enables quality-based ranking

## Integration Points

### Landing AI ADE Integration
- `DocumentImage.extractedBy = 'landing_ai_ade'` identifies ADE-processed images
- `DocumentChunk.adeElementId` links chunks to original ADE elements
- `DocumentChunk.confidence` stores ADE confidence scores
- `DocumentImage.extractionMetadata` stores ADE processing details

### Cohere Embed-v4.0 Multimodal Embeddings
- Text embeddings: `embeddingType = 'text'`, `chunkId` populated
- Image embeddings: `embeddingType = 'image'`, `imageId` populated
- Unified storage enables hybrid text-image search capabilities

### File System Integration
- `DocumentImage.imagePath` stores local file paths
- `DocumentImage.imageUrl` supports future cloud storage migration
- `DocumentImage.extractionMetadata` can store cloud storage references

## Next Steps

1. **Run Migration:** Execute `bun run db:generate && bun run db:migrate`
2. **Implement PDF-to-Image Conversion:** Create Inngest functions for image extraction
3. **ADE Integration:** Implement Landing AI ADE API client and processor
4. **Multimodal Embeddings:** Update embedding generation to support images
5. **Search Enhancement:** Modify search logic for multimodal queries
6. **Testing:** Create comprehensive test suite for new schema

## Schema Files Modified

- `/lib/db/schema.ts` - Primary schema updates
- Migration files generated in `/lib/db/migrations/`

## Compatibility Notes

- **Backward Compatible:** Existing text-only embeddings continue to work
- **Migration Safe:** All new fields are optional or have defaults
- **Extensible Design:** Schema supports future multimodal enhancements

This implementation provides a robust foundation for multimodal document processing while maintaining compatibility with existing text-based RAG functionality.