# Pipeline Activation Guide

This guide explains how to activate and configure the integrated document processing pipeline in RRA_V2.

## Overview

The RRA_V2 system has a complete async document processing pipeline built with Inngest. By default, it's disabled for safety. This guide shows how to gradually enable features using feature flags.

## Feature Flags Configuration

Add these environment variables to your `.env.local` file:

```env
# Pipeline Processing
ENABLE_INNGEST_PIPELINE=false      # Enable async Inngest workflow
ENABLE_PDF_TO_IMAGE=false          # Convert PDFs to images
ENABLE_MULTIMODAL_EMBEDDINGS=false # Generate multimodal embeddings

# External APIs
ENABLE_REAL_ADE=false              # Use real Landing AI ADE (requires API key)
ENABLE_COHERE_IMAGES=false         # Use Cohere image embeddings (when available)

# Processing Configuration
MAX_CONCURRENT_DOCUMENTS=3         # Max documents processing simultaneously
ENABLE_BATCH_PROCESSING=false      # Enable batch document processing
BATCH_SIZE=10                      # Documents per batch

# Monitoring
ENABLE_DETAILED_LOGGING=false      # Verbose logging for debugging
ENABLE_PROCESSING_METRICS=false    # Collect processing metrics
```

## Pipeline Workflow

When fully enabled, documents flow through this pipeline:

```
1. Upload → document.uploaded event
   ↓
2. Text Extraction → document.text-extracted event
   ↓
3. PDF to Image Conversion → document.images-extracted event
   ↓
4. ADE Processing → document.ade-processed event
   ↓
5. Multimodal Embeddings → document ready for RAG
```

## Activation Steps

### Step 1: Basic Pipeline (Text Only)

Start with basic text extraction and processing:

```env
ENABLE_INNGEST_PIPELINE=true
ENABLE_PDF_TO_IMAGE=false
ENABLE_MULTIMODAL_EMBEDDINGS=false
ENABLE_REAL_ADE=false
```

This enables:
- Async text extraction
- Basic chunking and embeddings
- Simulated ADE processing

### Step 2: Add PDF to Image Conversion

Enable image generation for visual content:

```env
ENABLE_INNGEST_PIPELINE=true
ENABLE_PDF_TO_IMAGE=true
ENABLE_MULTIMODAL_EMBEDDINGS=false
ENABLE_REAL_ADE=false
```

This adds:
- PDF page to image conversion
- Image storage in database
- Preparation for multimodal processing

### Step 3: Enable Multimodal Embeddings

Generate combined text and image embeddings:

```env
ENABLE_INNGEST_PIPELINE=true
ENABLE_PDF_TO_IMAGE=true
ENABLE_MULTIMODAL_EMBEDDINGS=true
ENABLE_REAL_ADE=false
```

This enables:
- Combined text + image embeddings
- Enhanced search capabilities
- Better context understanding

### Step 4: Activate Real ADE Processing

Use Landing AI's real ADE API:

```env
ENABLE_INNGEST_PIPELINE=true
ENABLE_PDF_TO_IMAGE=true
ENABLE_MULTIMODAL_EMBEDDINGS=true
ENABLE_REAL_ADE=true

# Also required:
LANDING_AI_API_KEY=your_api_key_here
```

This provides:
- Real document structure extraction
- Accurate element classification
- Production-quality metadata

## Monitoring & Debugging

### Enable Detailed Logging

For troubleshooting:

```env
ENABLE_DETAILED_LOGGING=true
```

This shows:
- Pipeline stage transitions
- Processing decisions
- Feature flag evaluations

### View Inngest Dashboard

1. Start the development server:
   ```bash
   bun dev
   ```

2. Start Inngest Dev Server:
   ```bash
   bun run inngest:dev
   ```

3. Open http://localhost:8288 to view:
   - Function executions
   - Event history
   - Error logs
   - Processing timeline

## Testing the Pipeline

### 1. Upload a Test Document

```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files=@test.pdf"
```

### 2. Check Processing Status

Monitor the document status through the pipeline:

```bash
# Check document status
curl http://localhost:3000/api/documents/status/DOCUMENT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected status progression:
- `uploaded` → Document received
- `processing` → Pipeline started
- `text_extracted` → Text extraction complete
- `images_generated` → PDF conversion complete (if enabled)
- `ade_processed` → ADE analysis complete
- `embedded` → Ready for search

### 3. Verify Results

Check that all components were processed:

```sql
-- Check document status
SELECT status, ade_data FROM rag_document WHERE id = 'DOCUMENT_ID';

-- Check generated images (if enabled)
SELECT COUNT(*) FROM document_image WHERE document_id = 'DOCUMENT_ID';

-- Check embeddings
SELECT COUNT(*) FROM document_embedding WHERE document_id = 'DOCUMENT_ID';
```

## Rollback Procedure

If issues occur, disable features in reverse order:

1. Set `ENABLE_INNGEST_PIPELINE=false` to stop async processing
2. Documents will remain in `uploaded` status for manual processing
3. Use the direct API endpoints for immediate processing if needed

## Performance Tuning

### Adjust Concurrency

For high-volume processing:

```env
MAX_CONCURRENT_DOCUMENTS=10  # Increase parallel processing
ENABLE_BATCH_PROCESSING=true  # Process in batches
BATCH_SIZE=25                 # Larger batches
```

### Resource Limits

The Inngest functions have built-in limits:
- PDF conversion: 3 concurrent, 10/min rate limit
- ADE processing: 2 concurrent, 5/min rate limit
- Embeddings: 2 concurrent, 3/min rate limit

Adjust these in the function definitions if needed.

## Troubleshooting

### Pipeline Stuck

1. Check Inngest dashboard for failed functions
2. Look for errors in application logs
3. Verify external API keys are valid
4. Check database for documents stuck in `processing` status

### Memory Issues

If processing large PDFs causes memory issues:
1. Reduce `MAX_CONCURRENT_DOCUMENTS`
2. Enable batch processing with smaller batches
3. Consider increasing container memory limits

### External API Failures

The system includes fallbacks:
- ADE: Falls back to simulation if API fails
- Embeddings: Uses cached results when available
- Images: Continues without images if conversion fails

## Production Checklist

Before enabling in production:

- [ ] Test with sample documents in staging
- [ ] Verify external API rate limits are sufficient
- [ ] Set up monitoring and alerts
- [ ] Configure appropriate concurrency limits
- [ ] Enable gradual rollout (e.g., 10% → 50% → 100%)
- [ ] Have rollback plan ready
- [ ] Monitor costs for external APIs

## Conclusion

The integrated pipeline provides powerful document processing capabilities. Start with basic features and gradually enable advanced functionality as you verify stability and performance.