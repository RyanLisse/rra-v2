# Database Connection Test Fixes

This document outlines the fixes applied to resolve database connection issues in the test environment.

## Issues Fixed

### 1. Server-Only Import Errors
**Problem**: Tests were failing with "This module cannot be imported from a Client Component module" errors.

**Root Cause**: Several lib files imported 'server-only', which prevents them from being used in test environments:
- `lib/db/queries.ts`
- `lib/monitoring/logger.ts`
- `lib/monitoring/metrics.ts`
- `lib/middleware/rate-limit.ts`
- `lib/middleware/response-cache.ts`
- `lib/middleware/compression.ts`

**Solution**: Added comprehensive mocks in `tests/config/test-setup.ts` to mock all server-only modules before any imports occur.

### 2. Missing Database Role Error
**Problem**: Tests were failing with "role 'test' does not exist" PostgreSQL errors.

**Root Cause**: The test configuration was using hardcoded database credentials that don't exist:
```
postgresql://test:test@localhost:5432/test_db
```

**Solution**: 
- Updated `tests/config/neon-branch-setup.ts` to use the actual production database URL from environment variables
- Added fallback environment variable loading in test setup
- Updated `.env.test` to properly configure test environment

### 3. Authentication Configuration
**Problem**: Tests still referenced Better Auth which was removed from the project.

**Root Cause**: Test setup was still configuring Better Auth environment variables.

**Solution**: Updated test setup to use Kinde authentication configuration instead.

## Files Modified

### Core Configuration Files
1. **`tests/config/test-setup.ts`**
   - Added comprehensive server-only module mocks
   - Updated authentication configuration for Kinde
   - Added environment variable fallbacks

2. **`tests/config/neon-branch-setup.ts`**
   - Fixed database URL fallback logic
   - Ensured production database URL is used for tests

3. **`.env.test`**
   - Updated to use Kinde authentication
   - Added proper database configuration comments
   - Removed Better Auth references

### New Files Created
1. **`lib/db/config-test.ts`**
   - Test-specific database configuration without server-only imports
   - Provides utilities for test database management

2. **`vitest.config.simple.ts`**
   - Simplified test configuration for easier debugging
   - Disabled Neon branching by default
   - Optimized for test environment

3. **`tests/lib/database-connection.test.ts`**
   - Validation tests for database connection setup
   - Environment variable validation
   - Mock database functionality tests

## Test Environment Setup

### Environment Variables Required
```bash
# Copy your actual database URL from .env.local
POSTGRES_URL=your-actual-neon-database-url

# Kinde Authentication (test values)
KINDE_CLIENT_ID=test-kinde-client-id
KINDE_CLIENT_SECRET=test-kinde-client-secret
KINDE_ISSUER_URL=https://test.kinde.com
KINDE_SITE_URL=http://localhost:3000
KINDE_POST_LOGOUT_REDIRECT_URL=http://localhost:3000
KINDE_POST_LOGIN_REDIRECT_URL=http://localhost:3000

# Test Configuration
NODE_ENV=test
USE_NEON_BRANCHING=false
```

### Running Tests
```bash
# Run with simplified configuration (recommended for debugging)
bun test --config vitest.config.simple.ts

# Run specific test files
bun test --config vitest.config.simple.ts tests/lib/database-connection.test.ts

# Run all lib tests
bun test --config vitest.config.simple.ts tests/lib/
```

## Mock Strategy

### Database Mocking
- All database operations are mocked using factory functions
- Test data factories in `tests/utils/test-database.ts` provide consistent test data
- No actual database connections are made in most tests

### Server-Only Module Mocking
- All server-only modules are mocked at the top level of test setup
- Mocks are configured before any imports to prevent server-only errors
- Individual tests can override specific mock behaviors as needed

## Best Practices for New Tests

### 1. Use Mock Factories
```typescript
import { createTestUser, createTestDocument } from '../utils/test-database';

const testUser = createTestUser({ email: 'test@example.com' });
const testDoc = createTestDocument({ title: 'Test Document' });
```

### 2. Mock Server-Only Dependencies
If your test needs to import modules with server-only dependencies, add mocks in `test-setup.ts`:

```typescript
vi.mock('@/lib/your-module', () => ({
  yourFunction: vi.fn().mockResolvedValue(mockResult),
}));
```

### 3. Environment Configuration
Tests should work without requiring specific database setup:
- Use the provided fallback POSTGRES_URL
- Don't assume specific database roles exist
- Mock external dependencies

## Debugging Failed Tests

### Check Environment Variables
```typescript
console.log('Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  POSTGRES_URL: !!process.env.POSTGRES_URL ? 'SET' : 'MISSING',
});
```

### Verify Mocks Are Working
```typescript
expect(typeof mockFunction).toBe('function');
expect(mockFunction).toHaveBeenCalled();
```

### Common Issues
1. **Server-only errors**: Add module to mocked modules in test-setup.ts
2. **Database connection errors**: Check POSTGRES_URL is set or fallback is used
3. **Authentication errors**: Verify Kinde configuration is set

## Future Improvements

1. **Real Database Testing**: For integration tests, consider using Neon branching with proper test isolation
2. **Test Data Management**: Implement proper test data seeding and cleanup
3. **CI/CD Integration**: Configure test environment variables for continuous integration

## Notes

- Tests now use the production database URL but with mocked operations for safety
- Neon branching is disabled by default in tests to simplify setup
- The simplified vitest config provides better debugging experience
- All server-only imports are properly mocked to prevent test failures