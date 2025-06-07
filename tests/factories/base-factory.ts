import { randomUUID } from 'crypto';
import { faker } from '@faker-js/faker';
import type { FactoryOptions, BatchFactoryOptions } from './types';

/**
 * Base factory class providing common functionality for all factories
 */
export abstract class BaseFactory<T> {
  protected seed?: string;

  constructor(seed?: string) {
    this.seed = seed;
    if (seed) {
      faker.seed(this.hashSeed(seed));
    }
  }

  /**
   * Create a single instance
   */
  abstract create(options?: FactoryOptions): T;

  /**
   * Create multiple instances
   */
  createBatch(options: BatchFactoryOptions): T[] {
    const { count, customizer, ...factoryOptions } = options;
    const items: T[] = [];

    for (let i = 0; i < count; i++) {
      const itemOptions = {
        ...factoryOptions,
        overrides: {
          ...factoryOptions.overrides,
          ...(customizer?.(i) || {}),
        },
      };
      items.push(this.create(itemOptions));
    }

    return items;
  }

  /**
   * Generate deterministic UUID based on seed and index
   */
  protected generateId(index?: number): string {
    if (this.seed && index !== undefined) {
      return this.deterministicUUID(`${this.seed}-${index}`);
    }
    return randomUUID();
  }

  /**
   * Generate realistic timestamps with proper chronological order
   */
  protected generateTimestamp(
    baseTime: Date = new Date(),
    offsetMinutes: number = 0
  ): Date {
    return new Date(baseTime.getTime() + offsetMinutes * 60 * 1000);
  }

  /**
   * Generate realistic file sizes
   */
  protected generateFileSize(type: 'small' | 'medium' | 'large' = 'medium'): string {
    const sizes = {
      small: faker.number.int({ min: 1024, max: 100 * 1024 }), // 1KB-100KB
      medium: faker.number.int({ min: 100 * 1024, max: 10 * 1024 * 1024 }), // 100KB-10MB
      large: faker.number.int({ min: 10 * 1024 * 1024, max: 100 * 1024 * 1024 }), // 10MB-100MB
    };
    return sizes[type].toString();
  }

  /**
   * Generate realistic embeddings
   */
  protected generateEmbedding(dimensions: number = 1536): number[] {
    return Array.from({ length: dimensions }, () => faker.number.float({ min: -1, max: 1 }));
  }

  /**
   * Apply overrides to generated data
   */
  protected applyOverrides<D>(data: D, overrides?: Record<string, any>): D {
    if (!overrides) return data;
    return { ...data, ...overrides };
  }

  /**
   * Generate realistic content based on type
   */
  protected generateContent(type: 'chat' | 'document' | 'chunk' | 'email'): string {
    switch (type) {
      case 'chat':
        return faker.helpers.arrayElement([
          "Hello! How can I help you today?",
          "I'm looking for information about...",
          "Can you explain how to...",
          "What's the best way to...",
          "I need assistance with...",
        ]);
      
      case 'document':
        return faker.lorem.paragraphs(faker.number.int({ min: 3, max: 10 }), '\n\n');
      
      case 'chunk':
        return faker.lorem.paragraph(faker.number.int({ min: 3, max: 8 }));
      
      case 'email':
        return faker.internet.email();
      
      default:
        return faker.lorem.sentence();
    }
  }

  /**
   * Generate realistic metadata
   */
  protected generateMetadata(type: 'document' | 'chunk' | 'user'): Record<string, any> {
    switch (type) {
      case 'document':
        return {
          language: faker.helpers.arrayElement(['en', 'es', 'fr', 'de']),
          format: faker.helpers.arrayElement(['pdf', 'docx', 'txt']),
          hasImages: faker.datatype.boolean(),
          hasTables: faker.datatype.boolean(),
          processingVersion: '1.0.0',
          extractedAt: new Date().toISOString(),
        };
      
      case 'chunk':
        return {
          chunkMethod: 'semantic',
          overlapTokens: faker.number.int({ min: 0, max: 50 }),
          semanticScore: faker.number.float({ min: 0.1, max: 1.0, fractionDigits: 3 }),
          containsCodeBlocks: faker.datatype.boolean(),
          containsTables: faker.datatype.boolean(),
        };
      
      case 'user':
        return {
          preferences: {
            theme: faker.helpers.arrayElement(['light', 'dark', 'auto']),
            language: faker.helpers.arrayElement(['en', 'es', 'fr']),
            notifications: faker.datatype.boolean(),
          },
          onboarding: {
            completed: faker.datatype.boolean(),
            step: faker.number.int({ min: 1, max: 5 }),
          },
        };
      
      default:
        return {};
    }
  }

  /**
   * Create deterministic UUID from string
   */
  private deterministicUUID(input: string): string {
    const hash = this.hashSeed(input);
    const hex = hash.toString(16).padStart(32, '0');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      '4' + hex.slice(12, 15), // Version 4 UUID
      ((parseInt(hex.slice(15, 16), 16) & 0x3) | 0x8).toString(16) + hex.slice(16, 19),
      hex.slice(19, 31),
    ].join('-');
  }

  /**
   * Simple hash function for seed generation
   */
  private hashSeed(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Factory registry for managing all factories
 */
export class FactoryRegistry {
  private static factories: Map<string, BaseFactory<any>> = new Map();

  static register<T>(name: string, factory: BaseFactory<T>): void {
    this.factories.set(name, factory);
  }

  static get<T>(name: string): BaseFactory<T> {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Factory '${name}' not found. Available factories: ${Array.from(this.factories.keys()).join(', ')}`);
    }
    return factory;
  }

  static list(): string[] {
    return Array.from(this.factories.keys());
  }

  static clear(): void {
    this.factories.clear();
  }
}

/**
 * Performance-optimized batch creation utilities
 */
export class BatchCreator {
  /**
   * Create large batches with memory optimization
   */
  static async createLargeBatch<T>(
    factory: BaseFactory<T>,
    totalCount: number,
    batchSize: number = 1000,
    onBatch?: (batch: T[], progress: number) => Promise<void>
  ): Promise<T[]> {
    const allItems: T[] = [];
    const batches = Math.ceil(totalCount / batchSize);

    for (let i = 0; i < batches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, totalCount);
      const count = end - start;

      const batch = factory.createBatch({
        count,
        customizer: (index) => ({ 
          batchIndex: i,
          itemIndex: start + index,
        }),
      });

      allItems.push(...batch);

      if (onBatch) {
        await onBatch(batch, (i + 1) / batches);
      }

      // Allow garbage collection between batches
      if (i < batches - 1) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return allItems;
  }

  /**
   * Create data in parallel with concurrency control
   */
  static async createParallel<T>(
    factory: BaseFactory<T>,
    counts: number[],
    concurrency: number = 3
  ): Promise<T[][]> {
    const results: T[][] = [];
    
    for (let i = 0; i < counts.length; i += concurrency) {
      const batch = counts.slice(i, i + concurrency);
      const promises = batch.map(count => 
        Promise.resolve(factory.createBatch({ count }))
      );
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return results;
  }
}