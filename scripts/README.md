# Enhanced Neon Test Branch Management Scripts

This directory contains comprehensive test branch management scripts that leverage the enhanced Neon API client utilities for production-ready database testing workflows.

## Overview

The enhanced test branch management system provides:

- **Automated test branch creation and cleanup**
- **Comprehensive health monitoring and alerting**
- **Parallel operations with rate limiting and retry logic**
- **CI/CD integration with batch operations**
- **Production-ready error handling and safety checks**

## Scripts

### 1. Main Management Script

**`neon-test-branch-manager.ts`** - Central management interface

```bash
# Show help
bun run test:branches:manager --help

# Create branches for all environments
bun run test:branches:manager create --suite=integration-tests --env=all --count=2

# Health check
bun run test:branches:manager health --verbose

# Show statistics
bun run test:branches:manager stats --format=json

# Cleanup with dry run
bun run test:branches:manager cleanup --max-age=24 --dry-run
```

### 2. Batch Branch Creation

**`create-test-branches.ts`** - Efficient batch creation with parallel execution

```bash
# Create branches for all environments (default: 2 per env)
bun run test:branches:create

# Create 5 unit test branches only
bun run test:branches:create --envs=unit --count=5

# CI workflow with custom prefix and high concurrency
bun run test:branches:create --prefix=ci-run --concurrency=10 --output=branches.json

# Dry run to preview what would be created
bun run test:branches:create --dry-run --verbose
```

### 3. Enhanced Cleanup

**`cleanup-old-branches.ts`** - Age-based cleanup policies with safety checks

```bash
# Interactive cleanup with confirmation
bun run test:branches:cleanup --interactive

# Emergency cleanup (branches older than 1 hour)
bun run test:branches:cleanup --policies=emergency --force

# Clean only unit test branches
bun run test:branches:cleanup --policies=unit-test --dry-run

# Full cleanup with detailed report
bun run test:branches:cleanup --output=cleanup-report.json --verbose
```

### 4. Status Monitoring

**`test-branch-status.ts`** - Comprehensive monitoring and health checks

```bash
# Basic status check
bun run test:branches:status

# Comprehensive health check
bun run test:branches:health --verbose

# Continuous monitoring
bun run test:branches:status monitor --interval=60

# Generate detailed report
bun run test:branches:status report --format=json --output=status.json

# Check for alerts
bun run test:branches:status alerts --filter-age=stale
```

## Package.json Scripts

For convenient CLI usage, these scripts are available:

```json
{
  "test:branches:manager": "Enhanced management interface",
  "test:branches:create": "Batch branch creation",
  "test:branches:cleanup": "Age-based cleanup",
  "test:branches:status": "Status monitoring",
  "test:branches:health": "Health checks"
}
```

## Features

### 🚀 Production-Ready

- **Rate Limiting**: Automatic API rate limiting with burst protection
- **Retry Logic**: Exponential backoff with configurable retry policies
- **Error Handling**: Comprehensive error tracking and recovery
- **Concurrent Operations**: Semaphore-controlled parallel execution
- **Safety Checks**: Multiple validation layers before destructive operations

### 📊 Monitoring & Alerting

- **Health Monitoring**: Real-time branch and system health assessment
- **Performance Metrics**: Operation timing and success rate tracking
- **Alert Conditions**: Configurable thresholds for automated alerting
- **Detailed Reporting**: JSON and tabular output formats

### 🔄 CI/CD Integration

- **Batch Operations**: Efficient creation and cleanup for CI workflows
- **Environment Targeting**: Support for unit, integration, and e2e environments
- **Dry Run Mode**: Safe preview of operations before execution
- **JSON Output**: Machine-readable output for automation

### 🛡️ Safety Features

- **Age-Based Policies**: Multiple cleanup policies based on branch age
- **Tag Protection**: Preserve branches with specific tags
- **Primary Branch Protection**: Never delete primary branches
- **Interactive Confirmation**: Optional user confirmation for large operations
- **Comprehensive Logging**: Detailed operation logs for auditing

## Configuration

### Environment Variables

Required:
```bash
NEON_PROJECT_ID=your-project-id
```

Optional (MCP-based authentication preferred):
```bash
NEON_API_KEY=your-api-key
```

### Default Cleanup Policies

1. **Emergency**: Branches older than 1 hour (`test-emergency-*`)
2. **Unit Test**: Unit test branches older than 6 hours
3. **Integration Test**: Integration test branches older than 12 hours
4. **E2E Test**: E2E test branches older than 24 hours
5. **General Test**: General test branches older than 24 hours
6. **Old Test**: Very old test branches (72+ hours)

### Alert Thresholds

- **Stale Branches**: 72 hours (configurable)
- **Large Branches**: 500MB (configurable)
- **Max Test Branches**: 20 (configurable)
- **Error Rate**: 10% (configurable)

## Usage Examples

### Development Workflow

```bash
# Start development session
bun run test:branches:create --envs=unit --count=1 --prefix=dev-session

# Check status during development
bun run test:branches:status --filter-env=unit

# Cleanup when done
bun run test:branches:cleanup --policies=unit-test
```

### CI/CD Pipeline

```bash
# Create test branches for CI run
bun run test:branches:create --prefix=ci-${CI_BUILD_ID} --parallel --output=branches.json

# Run tests with branches...

# Cleanup after tests
bun run test:branches:cleanup --policies=emergency,unit-test --force
```

### Production Monitoring

```bash
# Health check
bun run test:branches:health --format=json > health.json

# Continuous monitoring
bun run test:branches:status monitor --interval=300 # 5 minutes

# Alert check for automation
bun run test:branches:status alerts
```

## Advanced Usage

### Custom Branch Naming

The scripts support environment-based naming patterns:
- Unit tests: `test-{suite}-unit-{timestamp}-{uuid}`
- Integration: `test-{suite}-integration-{timestamp}-{uuid}`
- E2E: `test-{suite}-e2e-{timestamp}-{uuid}`

### Parallel Operations

Controlled concurrency with semaphores:
```bash
# High concurrency for CI
bun run test:branches:create --concurrency=15

# Conservative for development
bun run test:branches:create --concurrency=3
```

### Filtering and Targeting

Status monitoring supports advanced filtering:
```bash
# Filter by environment
bun run test:branches:status --filter-env=integration

# Filter by health status
bun run test:branches:status --filter-status=warning

# Filter by age
bun run test:branches:status --filter-age=stale
```

## Error Handling

The scripts include comprehensive error handling:

- **Network Failures**: Automatic retry with exponential backoff
- **Rate Limiting**: Intelligent backoff when hitting API limits
- **Concurrent Access**: Safe handling of parallel operations
- **State Conflicts**: Detection and handling of branch state issues
- **Resource Exhaustion**: Graceful handling of resource limits

## Best Practices

1. **Use dry-run mode** before destructive operations
2. **Monitor branch count** to avoid resource exhaustion
3. **Set appropriate cleanup policies** for your workflow
4. **Use tags** to protect important branches
5. **Regular health checks** to catch issues early
6. **Automate cleanup** in CI/CD pipelines
7. **Monitor costs** through size tracking

## Integration with Existing Infrastructure

These scripts work alongside the existing test infrastructure:

- **Compatible with existing test setup** (`lib/testing/neon-test-branches.ts`)
- **Extends current scripts** in the `scripts/` directory
- **Uses enhanced API client** (`lib/testing/neon-api-client.ts`)
- **Integrates with monitoring** (`lib/testing/neon-logger.ts`)

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure `NEON_PROJECT_ID` is set
2. **Rate Limiting**: Reduce concurrency or add delays
3. **Branch Stuck in Creating**: Check branch status and wait
4. **Large Number of Branches**: Run cleanup to reduce count
5. **Network Timeouts**: Increase timeout values in configuration

### Debug Mode

Enable verbose logging for troubleshooting:
```bash
bun run test:branches:manager health --verbose
```

### Health Checks

Regular health checks help identify issues:
```bash
# Quick health check
bun run test:branches:health

# Detailed system analysis
bun run test:branches:manager stats --verbose
```

## Future Enhancements

Planned improvements include:

- **Cost tracking integration** with actual Neon billing
- **Performance benchmarking** across operations
- **Advanced scheduling** for cleanup operations
- **Integration with monitoring systems** (Prometheus, Grafana)
- **Branch templates** for specific test scenarios
- **Automated scaling** based on workload