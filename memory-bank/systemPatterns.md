# System Patterns & Architecture

## Architectural Overview

**Multi-Agent Microservice Architecture** built on Next.js 15 with specialized agents handling distinct system concerns. The architecture follows a **Document-Centric RAG Pipeline** where documents flow through processing stages: Upload → Text Extraction → Chunking → Embedding → Vector Storage → Retrieval.

### Core Architecture Layers
1. **Presentation Layer**: React components with Shadcn UI and real-time streaming
2. **API Layer**: Next.js API routes with authentication and validation
3. **Business Logic Layer**: Document processing, AI integration, and RAG orchestration
4. **Data Layer**: PostgreSQL with PGVector for hybrid vector/relational storage
5. **AI Services Layer**: Google Gemini, Cohere embeddings, and reranking

## Key Design Patterns

### Multi-Agent Pattern
- **Frontend Agent**: React/Next.js UI components and user interactions
- **Backend Agent**: API routes, authentication, and business logic
- **Document Processing Agent**: PDF extraction, text processing, and chunking
- **AI/Embeddings Agent**: Vector operations, search, and embedding generation
- **Testing Agent**: Quality assurance, evaluation, and performance monitoring

### Repository Pattern with Drizzle ORM
- **Database Abstraction**: Schema-first approach with type-safe queries
- **Migration Management**: Version-controlled schema evolution
- **Relationship Modeling**: Proper foreign key constraints and cascading deletes

### Pipeline Pattern for Document Processing
```
Document Upload → Status: 'uploaded'
     ↓
Text Extraction → Status: 'text_extracted'
     ↓
ADE Structural Analysis → Extract elements with bbox coordinates
     ↓
Semantic Chunking → Status: 'chunked' (with elementType, pageNumber)
     ↓
Embedding Generation → Status: 'embedded'
     ↓
Vector Storage → Status: 'processed'
```

### Enhanced RAG Pattern with Structural Metadata
```
User Query → Vector Search (with element filtering)
     ↓
Retrieve Chunks → Include elementType, pageNumber, bbox
     ↓
Context Assembly → Structure-aware prompt with element hierarchy
     ↓
LLM Response → Enhanced citations with precise source attribution
```

### Streaming Response Pattern
- **Resumable Streams**: Redis-backed stream state for reliability
- **Real-time Updates**: AI SDK React hooks for live response streaming
- **Error Recovery**: Graceful handling of connection interruptions

## Modularity Strategy

### Separation of Concerns
```
/app/(auth)/          # Authentication logic isolated
/app/(chat)/api/      # API routes with clear responsibilities
/components/ui/       # Reusable UI components
/lib/db/             # Database layer abstraction
/lib/ai/             # AI service integrations
/artifacts/          # Document processing modules
```

### Agent Boundaries
- **Clear Interfaces**: Each agent has defined API contracts
- **Independent Deployment**: Agents can be developed and tested separately
- **Shared Resources**: Common database and authentication layer
- **Event-Driven Communication**: Status updates and pipeline coordination

### Component Modularity
- **Atomic Components**: Single responsibility UI components
- **Composition Patterns**: Higher-order components for complex interactions
- **Hook Abstractions**: Custom hooks for state management and API calls

## Data Flow

### Document Processing Flow
```
User Upload → FormData → API Route → File System → Database Record
     ↓
PDF Parse → Text Extraction → Document Content Table
     ↓
Semantic Chunking → Chunk Generation → Document Chunk Table
     ↓
Cohere API → Embedding Generation → Document Embedding Table
     ↓
PGVector → Vector Storage → Search Index
```

### Chat Interaction Flow
```
User Query → Vector Search (with element filtering) → Structured Chunk Retrieval
     ↓
Context Assembly (structure-aware) → Enhanced Prompts → AI Provider (OpenAI/Anthropic/Gemini)
     ↓
RAG Response → Enhanced Citation Parsing (elementType + pageNumber) → Streaming UI
```

### Database Relationships
```
User (1:N) → RAGDocument (1:1) → DocumentContent
RAGDocument (1:N) → DocumentChunk (enhanced with elementType, pageNumber, bbox) (1:1) → DocumentEmbedding
User (1:N) → Chat (1:N) → Message
```

### Authentication Flow
```
User Request → NextAuth Middleware → Session Validation → Route Handler
     ↓
Database Query → User Scope → Resource Access Control
```

### Error Handling Pattern
- **Structured Errors**: Custom error classes with context
- **Graceful Degradation**: Fallback strategies for AI service failures
- **Status Tracking**: Document processing state management
- **User Feedback**: Clear error messages and recovery instructions

## Testing Patterns

### Test Isolation Pattern
```
Test Suite → Create Neon Branch → Run Migrations → Seed Data
     ↓
Execute Tests → Parallel Test Execution → Collect Results
     ↓
Teardown → Delete Branch → Cleanup Resources
```

### Factory Pattern for Test Data
- **User Factory**: Generate authenticated users with sessions
- **Document Factory**: Create documents with various processing states
- **Chunk Factory**: Generate semantic chunks with embeddings
- **Embedding Factory**: Create vector embeddings with metadata

### Test Branch Lifecycle
```
GitHub Action Trigger → Branch Creation (test-feature-timestamp)
     ↓
Database Setup → Migration Run → Seed Data Population
     ↓
Test Execution → Unit Tests → Integration Tests → E2E Tests
     ↓
Results Collection → Branch Deletion → Resource Cleanup
```

### Performance Optimization Patterns
- **Connection Pooling**: Reuse database connections across tests
- **Parallel Execution**: Run independent test suites concurrently
- **Branch Caching**: Reuse branches for related test runs
- **Lazy Loading**: Only create resources when needed

### CI/CD Integration Pattern
```
Pull Request → Create Test Branch → Run Test Suite
     ↓
Code Coverage → Performance Metrics → Test Results
     ↓
Merge Decision → Automatic Cleanup → Deploy to Production
```

### Structural Metadata Patterns (Slice 17)

#### Element-Aware Document Processing
```
ADE Extraction → Element Classification (paragraph, table, figure, list, heading)
     ↓
Chunk Creation → Include elementType, pageNumber, bbox coordinates
     ↓
Vector Embedding → Preserve structural context in vector space
     ↓
Search & Retrieval → Filter by element types for targeted results
```

#### Enhanced Citation System
```
Document Chunk → Extract sourceId, elementType, pageNumber, bbox
     ↓
Context Assembly → Structure-aware prompt generation
     ↓
LLM Response → Precise citations with element-specific attribution
     ↓
User Interface → Display source type and page for verification
```

#### Backward Compatibility Strategy
- **Database Migrations**: Non-breaking schema additions with default values
- **API Versioning**: Maintain existing endpoints while adding enhanced features
- **Progressive Enhancement**: New features work alongside existing functionality
- **Graceful Degradation**: System functions without structural metadata when unavailable

### Best Practices
- **Naming Conventions**: Clear, consistent naming for test branches and structural elements
- **Resource Management**: Automatic cleanup of test resources and metadata
- **Error Recovery**: Graceful handling of test infrastructure and ADE processing failures
- **Documentation**: Comprehensive guides for test setup, structural metadata, and troubleshooting
- **Schema Evolution**: Backward-compatible database changes with migration validation
- **Element Type Consistency**: Standardized element classification across ADE and chunking systems
