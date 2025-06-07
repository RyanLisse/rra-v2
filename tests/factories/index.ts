/**
 * Test Data Factory System
 *
 * This module provides a comprehensive factory system for creating test data
 * that works with the enhanced Neon API client and branching infrastructure.
 *
 * Features:
 * - Type-safe factory methods for all database entities
 * - Relationship factories for complex data scenarios
 * - Realistic data generation with proper constraints
 * - Performance optimizations for large datasets
 * - Branch-aware seeding capabilities
 */

export * from './user-factory';
export * from './chat-factory';
export * from './document-factory';
export * from './rag-factory';
export * from './relationship-factory';
export * from './performance-factory';
export * from './base-factory';

// Re-export commonly used types
export type {
  FactoryOptions,
  BatchFactoryOptions,
  RelationshipOptions,
  PerformanceDataOptions,
} from './types';
