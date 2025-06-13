# OpenAI Vector Store Setup Guide

This guide covers the complete setup and configuration of the OpenAI Vector Store provider for the RoboRail RAG chat application.

## Overview

The OpenAI Vector Store provider integrates OpenAI's Assistants API with Vector Store capabilities to provide:

- **Semantic Search**: Advanced AI-powered document understanding
- **File Citations**: Direct references to source documents
- **Conversational AI**: Natural language processing with context
- **Automatic Embeddings**: Handled by OpenAI infrastructure
- **Fallback Support**: High availability with NeonDB fallback

## Prerequisites

1. **OpenAI API Key**: Required for all OpenAI services
2. **Existing Documents**: Documents should already be processed and available in NeonDB
3. **Environment Configuration**: Proper environment variables setup

## Quick Start

### 1. Environment Variables

Add the following variables to your `.env.local` file:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here

# Vector Search Configuration
VECTOR_SEARCH_PROVIDER=openai  # or 'neondb' for primary provider
VECTOR_DIMENSIONS=3072  # for text-embedding-3-large

# OpenAI Vector Store Configuration
OPENAI_VECTOR_INDEX=roborail-docs
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
OPENAI_VECTOR_STORE_ID=  # Optional: pre-existing vector store ID
OPENAI_ASSISTANT_ID=     # Optional: pre-existing assistant ID

# Redis Configuration (recommended for caching)
REDIS_URL=redis://localhost:6379
```

### 2. Provider Configuration

The system supports multiple configuration patterns:

#### Option A: Automatic Setup (Recommended)
The provider will automatically create the vector store and assistant on first use:

```typescript
import { vectorSearchFactory } from '@/lib/search/providers/factory';

const provider = vectorSearchFactory.createProvider({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  indexName: 'roborail-docs',
  embeddingModel: 'text-embedding-3-large',
  dimensions: 3072,
});
```

#### Option B: Enhanced Service with Fallback
Use both NeonDB and OpenAI with automatic fallback:

```typescript
import { enhancedSearchService } from '@/lib/search/enhanced-search-service';

// Automatically configured from environment variables
const searchResult = await enhancedSearchService.vectorSearch(
  'How to calibrate RoboRail?',
  userId
);
```

### 3. Database Selector Update

The database selector automatically includes OpenAI as an option when properly configured. Users can switch between providers in the UI.

## Migration from NeonDB

### Automatic Migration

Use the migration API to transfer documents from NeonDB to OpenAI:

```bash
# Migrate all documents
curl -X POST /api/documents/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "sourceProvider": "neondb",
    "targetProvider": "openai",
    "batchSize": 10,
    "dryRun": false
  }'
```

### Manual Migration

For more control, use the migration utilities directly:

```typescript
import { migrateNeonToOpenAI } from '@/lib/search/migration-utils';

const result = await migrateNeonToOpenAI({
  userId: 'user-id',
  documentIds: ['doc1', 'doc2'], // Optional: specific documents
  batchSize: 5,
  dryRun: false
});

console.log(`Migrated ${result.documentsSucceeded}/${result.documentsProcessed} documents`);
```

### Migration Status

Check migration progress:

```bash
curl "/api/documents/migrate?documentIds=doc1,doc2,doc3&sourceProvider=neondb&targetProvider=openai"
```

## Configuration Options

### Embedding Models

Choose from OpenAI's embedding models:

- `text-embedding-3-large` (3072 dimensions) - **Recommended**
- `text-embedding-3-small` (1536 dimensions) - Cost-effective
- `text-embedding-ada-002` (1536 dimensions) - Legacy

### Vector Store Settings

```typescript
const config = {
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  indexName: 'roborail-docs',
  embeddingModel: 'text-embedding-3-large',
  dimensions: 3072,
  // Optional: Use existing resources
  vectorStoreId: 'vs_abc123',
  assistantId: 'asst_def456',
};
```

### Search Options

Configure search behavior:

```typescript
const searchOptions = {
  limit: 10,
  threshold: 0.3,
  useCache: true,
  expandQuery: true,
  elementTypes: ['paragraph', 'procedure'],
  pageNumbers: [1, 2, 3],
};
```

## Provider Management

### Status Check

Monitor provider health:

```bash
curl /api/search/providers
```

Response includes:
- Provider availability
- Configuration validation
- Health status
- Feature capabilities
- Recommendations

### Switch Providers

Switch between primary and fallback providers:

```bash
curl -X PUT /api/search/providers \
  -H "Content-Type: application/json" \
  -d '{"action": "switch_providers"}'
```

### Reset Metrics

Clear performance metrics:

```bash
curl -X PUT /api/search/providers \
  -H "Content-Type: application/json" \
  -d '{"action": "reset_metrics"}'
```

## API Usage

### Basic Search

```typescript
import { vectorSearchService } from '@/lib/search/vector-search';

const results = await vectorSearchService.vectorSearch(
  'RoboRail calibration procedure',
  userId,
  { limit: 5 }
);
```

### Hybrid Search

```typescript
const results = await vectorSearchService.hybridSearch(
  'troubleshooting PMAC connection',
  userId,
  {
    limit: 10,
    useRerank: true,
    scoringAlgorithm: 'adaptive'
  }
);
```

### Context-Aware Search

```typescript
const conversationHistory = [
  { role: 'user', content: 'How do I start the system?' },
  { role: 'assistant', content: 'Follow the startup procedure...' },
  { role: 'user', content: 'What about calibration?' }
];

const results = await vectorSearchService.contextAwareSearch(
  'calibration steps',
  userId,
  conversationHistory,
  { contextWeight: 0.3 }
);
```

## Troubleshooting

### Common Issues

1. **Provider Not Available**
   - Check `OPENAI_API_KEY` is set correctly
   - Verify API key has sufficient credits
   - Ensure API key has access to Assistants API

2. **Vector Store Creation Failed**
   - Check OpenAI API limits
   - Verify Assistants API is enabled
   - Check for billing/credit issues

3. **Search Returns No Results**
   - Ensure documents are migrated to OpenAI
   - Check vector store has files uploaded
   - Verify assistant configuration

4. **Slow Response Times**
   - Enable Redis caching
   - Consider using smaller embedding model
   - Implement result pagination

### Debugging

Enable detailed logging:

```typescript
// Set environment variable
process.env.OPENAI_PROVIDER_DEBUG = 'true';

// Or use debug mode in code
const provider = new OpenAIVectorSearchProvider(config, {
  debugMode: true,
  logLevel: 'verbose'
});
```

### Validation

Validate your configuration:

```bash
curl -X POST /api/search/providers \
  -H "Content-Type: application/json" \
  -d '{
    "type": "openai",
    "apiKey": "sk-...",
    "indexName": "roborail-docs",
    "embeddingModel": "text-embedding-3-large",
    "dimensions": 3072
  }'
```

## Performance Optimization

### Caching Strategy

1. **Redis Caching**: Enable for frequent queries
2. **Query Expansion**: Balance between relevance and speed
3. **Result Limits**: Use appropriate limits for UI
4. **Batch Processing**: For bulk operations

### Cost Optimization

1. **Embedding Model**: Choose based on quality/cost needs
2. **Search Frequency**: Implement client-side caching
3. **Assistant Reuse**: Reuse assistant and vector store
4. **Query Optimization**: Avoid redundant searches

### Monitoring

Track key metrics:
- Search response time
- Token usage
- Error rates
- Cache hit rates
- Provider fallback frequency

## Security Considerations

1. **API Key Management**: Use environment variables only
2. **User Isolation**: Ensure proper user context
3. **Rate Limiting**: Implement for production use
4. **Data Privacy**: Review OpenAI data policies
5. **Access Control**: Secure API endpoints

## Migration Best Practices

1. **Test First**: Always use `dryRun: true` initially
2. **Batch Size**: Start with small batches (5-10 documents)
3. **Monitor Progress**: Use status endpoints
4. **Validate Results**: Check migration integrity
5. **Backup Strategy**: Keep NeonDB as fallback
6. **Rate Limits**: Respect OpenAI API limits

## Advanced Features

### Custom Assistant Instructions

Modify assistant behavior:

```typescript
const customInstructions = `
You are a RoboRail technical support assistant.
Focus on precise, actionable answers.
Always cite specific document sections.
Prioritize safety-related information.
`;
```

### Multi-Step Search

For complex queries:

```typescript
const results = await vectorSearchService.multiStepSearch(
  'complete calibration workflow',
  userId,
  {
    maxSteps: 3,
    minResultsPerStep: 5
  }
);
```

### Analytics Integration

Track search patterns:

```typescript
const analytics = await vectorSearchService.getSearchAnalytics(
  userId,
  'week'
);
```

## Support and Resources

- **OpenAI Documentation**: [OpenAI Assistants API](https://platform.openai.com/docs/assistants/overview)
- **Vector Stores Guide**: [OpenAI Vector Stores](https://platform.openai.com/docs/assistants/tools/file-search)
- **Embeddings Models**: [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- **Rate Limits**: [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits)

For issues specific to this implementation, check the application logs and provider status endpoints.