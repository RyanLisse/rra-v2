# Environment Variables Documentation

This document lists all required and optional environment variables for the RRA V2 application.

## Required Environment Variables

### Authentication & Security
- **BETTER_AUTH_SECRET** ✅
  - Description: Secret key for Better-auth session encryption
  - Example: `QHXDlK1Sc45a0a0vjPw3nYc0w686BJP1`
  - How to generate: Use https://generate-secret.vercel.app/32 or `openssl rand -base64 32`
  - Used in: `lib/auth/config.ts`

### Database
- **POSTGRES_URL** ✅ (same as DATABASE_URL)
  - Description: PostgreSQL connection string with PGVector support
  - Example: `postgresql://user:password@host:port/database?sslmode=require`
  - Used in: `lib/db/index.ts`, `lib/auth/config.ts`
  - Note: Both POSTGRES_URL and DATABASE_URL are configured with the same value

### AI Services

#### xAI (Grok Models) - PRIMARY CHAT MODEL
- **XAI_API_KEY** ❌ (MISSING - REQUIRED)
  - Description: API key for xAI's Grok models (chat and reasoning)
  - Models used: grok-2-vision-1212, grok-3-mini-beta, grok-2-1212
  - Get from: https://console.x.ai/
  - Used in: `app/api/health/route.ts`, chat routes
  - Note: This is the PRIMARY chat model and is REQUIRED for the application to function

#### Cohere (Embeddings & Reranking)
- **COHERE_API_KEY** ✅
  - Description: API key for Cohere embeddings and reranking
  - Models: embed-english-v4.0, rerank-english-v3.0
  - Get from: https://dashboard.cohere.ai/
  - Used in: `lib/ai/cohere-client.ts`

#### Google (Gemini RAG)
- **GOOGLE_API_KEY** ✅ (same as GEMINI_API_KEY)
  - Description: API key for Google Gemini models
  - Model: gemini-2.0-flash-exp
  - Get from: https://makersuite.google.com/app/apikey
  - Used in: `lib/ai/gemini-client.ts`

## Optional Environment Variables

### Redis (For Resumable Streams & Caching)
- **REDIS_URL** ❌ (OPTIONAL but recommended)
  - Description: Redis connection URL for resumable streams and search caching
  - Example: `redis://default:password@localhost:6379`
  - Used in: `lib/search/vector-search.ts`, chat routes
  - Features disabled without Redis:
    - Resumable chat streams
    - Search result caching
    - Search analytics

### Landing AI ADE (Advanced Document Extraction)
- **LANDING_AI_API_KEY** ❌ (OPTIONAL)
  - Description: API key for Landing AI's ADE service
  - Used in: `lib/ade/client.ts`
  - Note: Falls back to simulation mode if not provided

- **LANDING_AI_ENDPOINT** ❌ (OPTIONAL)
  - Description: Custom endpoint for Landing AI ADE
  - Default: `https://api.landing.ai/v1/ade`
  - Used in: `lib/ade/client.ts`

### Search Configuration
- **COHERE_EMBED_MODEL** (OPTIONAL)
  - Description: Choose between Cohere embedding models
  - Values: `v3.0` or `v4.0` (default: v4.0)
  - Used in: `lib/ai/cohere-client.ts`

- **SEARCH_CACHE_ENABLED** (OPTIONAL)
  - Description: Enable/disable search result caching
  - Default: `true` (if Redis is configured)
  - Used in: `lib/search/vector-search.ts`

- **SEARCH_CACHE_TTL** (OPTIONAL)
  - Description: Cache TTL in seconds
  - Default: `3600` (1 hour)
  - Used in: `lib/search/vector-search.ts`

- **QUERY_EXPANSION_ENABLED** (OPTIONAL)
  - Description: Enable query expansion with synonyms
  - Default: `true`
  - Used in: `lib/search/vector-search.ts`

- **SIMILARITY_ALGORITHM** (OPTIONAL)
  - Description: Vector similarity algorithm
  - Values: `cosine`, `euclidean`, `dot_product`
  - Default: `cosine`
  - Used in: `lib/search/vector-search.ts`

- **ADAPTIVE_THRESHOLD_ENABLED** (OPTIONAL)
  - Description: Enable adaptive similarity thresholds
  - Default: `true`
  - Used in: `lib/search/vector-search.ts`

- **CONTEXT_AWARE_SCORING_ENABLED** (OPTIONAL)
  - Description: Enable context-aware search scoring
  - Default: `true`
  - Used in: `lib/search/vector-search.ts`

### Error Tracking & Monitoring
- **NEXT_PUBLIC_ERROR_TRACKING_ENDPOINT** (OPTIONAL)
  - Description: Endpoint for error tracking service
  - Used in: `lib/error-tracking.ts`
  - Note: Errors are logged to console if not configured

- **LOG_ENDPOINT** (OPTIONAL)
  - Description: Endpoint for centralized logging
  - Used in: `lib/monitoring/logger.ts`

- **METRICS_ENDPOINT** (OPTIONAL)
  - Description: Endpoint for metrics collection
  - Used in: `lib/monitoring/metrics.ts`

### Development & Testing
- **NODE_ENV**
  - Description: Node environment
  - Values: `development`, `production`, `test`
  - Used throughout the application

- **PLAYWRIGHT_TEST_BASE_URL** (OPTIONAL)
  - Description: Base URL for Playwright tests
  - Used in: test files

- **BETTER_AUTH_URL** (OPTIONAL)
  - Description: Base URL for Better-auth API
  - Default: `http://localhost:3000` (in development)
  - Used in: auth configuration

## Status Summary

### Critical Missing Variables ❌
1. **XAI_API_KEY** - REQUIRED for chat functionality
   - Get from: https://console.x.ai/

### Recommended Optional Variables
1. **REDIS_URL** - Enables resumable streams and caching
2. **LANDING_AI_API_KEY** - Enables advanced document processing

### Currently Configured ✅
- BETTER_AUTH_SECRET
- POSTGRES_URL / DATABASE_URL
- COHERE_API_KEY
- GOOGLE_API_KEY / GEMINI_API_KEY
- Various other API keys (OpenAI, Anthropic, etc.) that are not currently used

## Next Steps

1. **Obtain XAI_API_KEY** from https://console.x.ai/
2. Add to .env.local: `XAI_API_KEY=your_key_here`
3. Consider setting up Redis for enhanced features
4. Consider obtaining Landing AI API key for better document processing

## Unused Environment Variables in .env.local

The following are configured but not currently used by the application:
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- PERPLEXITY_API_KEY
- FIRECRAWL_API_KEY
- DEEPEVAL_API_KEY
- UNSTRUCTURED_API_KEY
- UNSTRUCTURED_API_URL
- UNSTRUCTURED_WORKFLOW_URL
- LANGSMITH_API_KEY
- LANGSMITH_PROJECT
- LANGSMITH_TRACING
- GOOGLE_GENERATIVE_AI_API_KEY (duplicate of GOOGLE_API_KEY)
- VISION_AGENT_API_KEY
