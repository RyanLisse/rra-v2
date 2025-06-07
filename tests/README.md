# Testing Documentation

This directory contains comprehensive tests for the RAG Chat Application. The testing strategy follows a multi-layered approach covering unit tests, integration tests, performance tests, and end-to-end tests.

## 🚀 Enhanced Testing Infrastructure

We now support **Enhanced Neon Branching Strategy** for superior test isolation and debugging capabilities. See [Enhanced Testing Summary](./ENHANCED_TESTING_SUMMARY.md) for a complete overview.

### Quick Start with Enhanced Testing

```typescript
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { TestDataFactory } from './utils/enhanced-test-factories';
import { NeonTestUtils } from './utils/neon-test-utils';

describe('My Feature (Enhanced)', () => {
  let testBranch: TestBranchInfo | null = null;
  let neonClient, testUtils, factory;

  beforeEach(async () => {
    neonClient = getNeonApiClient();
    testUtils = new NeonTestUtils(neonClient);
    factory = new TestDataFactory();

    const branchResult = await neonClient.createTestBranch({
      testSuite: 'my-feature',
      purpose: 'testing',
      tags: ['enhanced']
    });

    if (branchResult.success) {
      testBranch = branchResult.data;
      await testUtils.setupTestSchema(testBranch.branchId);
    }
  });

  afterEach(async () => {
    if (testBranch) {
      await neonClient.deleteTestBranch(testBranch.branchName);
    }
  });

  it('should test with real database isolation', async () => {
    const user = factory.createUser();
    await testUtils.insertUser(user, testBranch!.branchId);
    // Your test code here
  });
});
```

### Enhanced Testing Documentation

- 📋 [**Enhanced Testing Summary**](./ENHANCED_TESTING_SUMMARY.md) - Complete overview of new capabilities
- 📖 [**Migration Guide**](./migration-guide.md) - Step-by-step upgrade instructions  
- 📄 [**Test Template**](./templates/enhanced-test-template.ts) - Copy-paste template for new tests

### Enhanced Test Examples

- 🔐 [**Auth API Enhanced**](./api/auth-enhanced.test.ts) - Authentication with real database validation
- 🔄 [**RAG Pipeline Enhanced**](./integration/rag-pipeline-enhanced.test.ts) - End-to-end workflow testing
- ⚡ [**Vector Search Enhanced**](./performance/vector-search-enhanced.test.ts) - Performance testing with scaling analysis

## Test Structure

```
tests/
├── api/                    # API route tests
├── components/             # React component tests
├── integration/            # Integration tests
├── performance/            # Performance benchmarks
├── lib/                    # Library/utility tests
├── utils/                  # Test utilities and helpers
├── fixtures/               # Test data and fixtures
├── e2e/                    # End-to-end tests (Playwright)
├── routes/                 # Route-level integration tests (Playwright)
└── config/                 # Test configuration
```

## Test Categories

### 1. API Route Tests (`tests/api/`)

Tests for all API endpoints including:
- **Authentication**: Login, registration, session management
- **Document Upload**: File validation, processing, error handling
- **Chat API**: Message handling, streaming, rate limiting
- **Search API**: Vector search functionality
- **Document Processing**: Text extraction, chunking, embedding

**Key Features Tested:**
- Authentication and authorization
- Input validation and sanitization
- Error handling and edge cases
- Rate limiting and security
- File upload and processing workflows

### 2. Integration Tests (`tests/integration/`)

End-to-end testing of major system workflows:
- **RAG Pipeline**: Complete document processing pipeline
- **Auth Middleware**: Session management and security
- **Database Operations**: CRUD operations with real PostgreSQL
- **File Processing**: Document extraction and embedding workflow

**Key Features Tested:**
- Database transaction integrity
- Cascading deletes and referential integrity
- Concurrent operations
- Error recovery and resilience
- Multi-document operations

### 3. Performance Tests (`tests/performance/`)

Performance benchmarks and scalability tests:
- **Vector Search**: Embedding storage and similarity search performance
- **API Response Times**: Response time measurements under load
- **Memory Usage**: Memory leak detection and optimization
- **Concurrent Operations**: Performance under concurrent load

**Performance Criteria:**
- API responses < 3 seconds
- Vector searches < 1 second average
- Memory usage < 500MB for large operations
- Concurrent request handling up to 50 requests

### 4. Component Tests (`tests/components/`)

React component testing with Testing Library:
- **Document Uploader**: File selection, drag-and-drop, validation
- **Chat Interface**: Message rendering, streaming responses
- **Auth Forms**: Login/registration forms
- **Navigation**: Sidebar and menu components

**Key Features Tested:**
- User interactions and event handling
- Accessibility (ARIA labels, keyboard navigation)
- Responsive design
- Performance with large datasets
- Error states and loading states

### 5. Library Tests (`tests/lib/`)

Unit tests for utility functions and core libraries:
- **Database helpers**: Query functions and schema validation
- **Utils**: Utility functions like `cn()` for class merging
- **Auth helpers**: Session validation and user management
- **AI helpers**: Model configuration and prompt management

## Test Database Setup

### PostgreSQL with pgvector

The test suite requires a PostgreSQL database with the pgvector extension for vector similarity search functionality. A dedicated test database configuration is provided via Docker Compose.

#### Starting the Test Database

```bash
# Start the test database (PostgreSQL with pgvector)
bun test:db:up

# Wait for the database to be ready
bun test:db:wait

# Or use the combined setup command
bun test:setup
```

#### Test Database Configuration

- **Host**: localhost
- **Port**: 5433 (different from main DB to avoid conflicts)
- **Database**: test_db
- **User**: test
- **Password**: test
- **Connection URL**: `postgresql://test:test@localhost:5433/test_db`

#### Managing the Test Database

```bash
# Stop the test database (preserves data)
bun test:db:stop

# Remove the test database (deletes all data)
bun test:db:down

# Clean up everything including volumes
bun test:db:clean

# View database logs
bun test:db:logs

# Run tests with automatic database setup/teardown
bun test:with-db
```

#### Docker Compose Configuration

The test database is configured in `docker-compose.test.yml`:
- Uses PostgreSQL 16 with pgvector extension pre-installed
- Configured with optimal settings for testing
- Includes health checks for reliable startup
- Separate volumes to isolate test data
- Redis instance for testing caching functionality

## Test Utilities

### Test Database Helper (`tests/utils/test-db.ts`)

Provides database setup and teardown for tests:
- Creates isolated test database connection
- Runs migrations before each test
- Cleans up data after each test
- Supports transaction-based testing
- Uses `TEST_DATABASE_URL` environment variable or defaults to test database

### Test Helpers (`tests/utils/test-helpers.ts`)

Common testing utilities:
- **Request Mocking**: Create mock NextRequest objects
- **Auth Mocking**: Mock authentication states
- **Performance Measurement**: Measure execution time and memory usage
- **Response Assertions**: Common response validation helpers
- **File System Mocking**: Mock file operations

### Test Fixtures (`tests/fixtures/test-data.ts`)

Standardized test data generators:
- **User Fixtures**: Test users with different roles
- **Document Fixtures**: Test documents and content
- **File Fixtures**: Mock file objects for upload testing
- **Session Fixtures**: Authentication session data
- **API Request Fixtures**: Standardized request payloads

## Running Tests

### Unit Tests
```bash
# Run all unit tests
bun test:unit

# Run specific test categories
bun test:api           # API route tests
bun test:components    # Component tests
bun test:lib          # Library tests
bun test:utils        # Utility tests

# Watch mode for development
bun test:watch
```

### Integration Tests
```bash
# Run integration tests
bun test:integration

# Run performance tests
bun test:performance
```

### End-to-End Tests
```bash
# Run all E2E tests
bun test:e2e

# Run with UI for debugging
bun test:e2e:ui

# Run specific test projects
bun test:e2e:chromium  # E2E tests in Chrome
bun test:e2e:routes    # Route-level tests
```

### Coverage Reports
```bash
# Generate coverage report
bun test:coverage

# Coverage thresholds:
# - Branches: 80%
# - Functions: 80%
# - Lines: 80%
# - Statements: 80%
```

### CI Pipeline
```bash
# Complete CI test suite
bun test:ci
```

## Test Configuration

### Vitest Configuration (`vitest.config.ts`)

- **Environment**: jsdom for React component testing
- **Timeout**: 30 seconds for performance tests
- **Coverage**: v8 provider with HTML reports
- **Threading**: Optimized for CI environments

### Playwright Configuration (`playwright.config.ts`)

- **Browsers**: Chrome, Firefox, Safari support
- **Timeouts**: 120 seconds for complex interactions
- **Retry**: Automatic retry on CI failures
- **Traces**: Collected on failure for debugging

### Test Setup (`tests/config/test-setup.ts`)

- **Mocks**: Next.js router, next-auth, AI SDK
- **Global Setup**: Environment variables and console filtering
- **Cleanup**: Automatic cleanup after tests

## Best Practices

### Writing Tests

1. **Test Structure**: Follow Arrange-Act-Assert pattern
2. **Naming**: Descriptive test names explaining behavior
3. **Isolation**: Each test should be independent
4. **Mocking**: Mock external dependencies appropriately
5. **Cleanup**: Always clean up resources (files, database)

### Performance Testing

1. **Realistic Data**: Use realistic data volumes
2. **Memory Monitoring**: Track memory usage for leaks
3. **Concurrent Testing**: Test under concurrent load
4. **Baseline Measurements**: Establish performance baselines

### Component Testing

1. **User-Centric**: Test from user perspective
2. **Accessibility**: Include accessibility testing
3. **Edge Cases**: Test error states and edge cases
4. **Responsive**: Test on different viewport sizes

### Integration Testing

1. **Real Dependencies**: Use real database when possible
2. **Error Scenarios**: Test failure recovery
3. **Data Integrity**: Verify database constraints
4. **Transaction Testing**: Test rollback scenarios

## Debugging Tests

### Common Issues

1. **Test Timeouts**: Increase timeout for slow operations
2. **Database Cleanup**: Ensure proper test isolation
3. **Mock Conflicts**: Check for conflicting mocks
4. **Memory Leaks**: Monitor memory usage in performance tests

### Debugging Tools

1. **Vitest UI**: `bun test --ui` for interactive debugging
2. **Playwright UI**: `bun test:e2e:ui` for E2E debugging
3. **Coverage Reports**: Identify untested code paths
4. **Performance Profiling**: Use built-in performance measurement

## Coverage Goals

- **API Routes**: 95% coverage (critical business logic)
- **Components**: 85% coverage (user-facing functionality)
- **Integration**: 90% coverage (workflow validation)
- **Utilities**: 95% coverage (shared logic)

## Continuous Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Nightly performance benchmarks
- Release candidate validation

The CI pipeline includes:
1. Unit tests with coverage
2. Integration tests
3. Performance benchmarks
4. E2E tests across browsers
5. Security testing
6. Accessibility validation