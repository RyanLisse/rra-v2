/**
 * Database Seeding System
 * 
 * This module provides a comprehensive seeding system for populating test databases
 * with realistic data for different testing environments.
 * 
 * Features:
 * - Environment-specific seeders (unit, integration, e2e, performance)
 * - Branch-aware seeding for Neon database branching
 * - Performance monitoring and metrics
 * - Cleanup and rollback mechanisms
 * - Scenario-based data generation
 */

export * from './base-seeder';
export * from './unit-seeder';
export * from './integration-seeder';
export * from './e2e-seeder';
export * from './performance-seeder';
export * from './scenario-seeder';

// Re-export commonly used types
export type {
  SeederConfig,
  SeederResult,
  DatabaseSnapshot,
  DatabaseState,
} from '../factories/types';