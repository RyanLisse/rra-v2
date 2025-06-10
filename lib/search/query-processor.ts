/**
 * Query Processing Module
 *
 * Handles all query manipulation, expansion, optimization, and context enhancement
 * for the vector search system. Provides intelligent query processing capabilities
 * including context extraction, query refinement, and optimization for different
 * search modes.
 */

import type { HybridSearchResult } from './types';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface QueryExpansionOptions {
  maxTerms?: number;
  includeContext?: boolean;
  technicalTermsOnly?: boolean;
}

export interface QueryOptimizationOptions {
  useAdvancedQuery?: boolean;
  addPrefixMatching?: boolean;
  normalizeWhitespace?: boolean;
  filterSpecialChars?: boolean;
}

export interface ContextExtractionOptions {
  maxMessages?: number;
  minTermLength?: number;
  maxTerms?: number;
  includeTechnicalTerms?: boolean;
  includeErrorCodes?: boolean;
}

export interface QueryRefinementOptions {
  maxRefinementTerms?: number;
  topResultsCount?: number;
  excludeOriginalTerms?: boolean;
}

/**
 * Main query processing class providing comprehensive query manipulation capabilities
 */
export class QueryProcessor {
  private readonly technicalTermPatterns = [
    /^(error|config|setup|install|calibrat|connect|roborail|pmac)/i,
    /\d/, // Contains numbers
    /^[A-Z]{2,}$/, // Acronyms
    /\w+\.\w+/, // Dotted notation (e.g., system.config)
    /\w+[-_]\w+/, // Hyphenated or underscored terms
  ];

  private readonly stopWords = new Set([
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'up',
    'about',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'among',
    'an',
    'a',
    'as',
    'are',
    'was',
    'were',
    'been',
    'be',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'can',
    'this',
    'that',
    'these',
    'those',
    'is',
    'it',
    'its',
    'they',
    'them',
    'their',
    'what',
    'which',
    'who',
    'when',
    'where',
    'why',
    'how',
  ]);

  /**
   * Extract key terms from conversation context for query enhancement
   */
  extractContextTerms(
    context: ConversationMessage[],
    options: ContextExtractionOptions = {},
  ): string[] {
    const {
      maxMessages = 6,
      minTermLength = 4,
      maxTerms = 5,
      includeTechnicalTerms = true,
      includeErrorCodes = true,
    } = options;

    if (!context || context.length === 0) {
      return [];
    }

    // Get recent messages (last 3 exchanges)
    const recentMessages = context.slice(-maxMessages);
    const allText = recentMessages.map((msg) => msg.content).join(' ');

    // Extract potential terms based on length
    const terms =
      allText
        .toLowerCase()
        .match(new RegExp(`\\b[a-z]{${minTermLength},}\\b`, 'g')) || [];

    // Filter terms based on criteria
    const importantTerms = terms.filter((term) => {
      // Skip stop words
      if (this.stopWords.has(term)) {
        return false;
      }

      // Include technical terms if enabled
      if (includeTechnicalTerms && this.isTechnicalTerm(term)) {
        return true;
      }

      // Include terms with numbers (likely error codes, model numbers)
      if (includeErrorCodes && /\d/.test(term)) {
        return true;
      }

      // Include longer terms (likely more specific)
      if (term.length > 6) {
        return true;
      }

      return false;
    });

    // Deduplicate and limit
    return [...new Set(importantTerms)].slice(0, maxTerms);
  }

  /**
   * Check if a term is technical based on patterns
   */
  private isTechnicalTerm(term: string): boolean {
    return this.technicalTermPatterns.some((pattern) => pattern.test(term));
  }

  /**
   * Enhance query with context terms
   */
  buildContextEnhancedQuery(
    originalQuery: string,
    contextTerms: string[],
    weight = 0.3,
  ): string {
    if (contextTerms.length === 0) {
      return originalQuery;
    }

    // Weight context terms lower than original query
    const weightedContext = contextTerms
      .map((term) => `${term}^${weight}`)
      .join(' ');
    return `${originalQuery} ${weightedContext}`;
  }

  /**
   * Optimize query for PostgreSQL full-text search
   */
  optimizeQueryForFullText(
    query: string,
    options: QueryOptimizationOptions = {},
  ): string {
    const {
      useAdvancedQuery = true,
      addPrefixMatching = true,
      normalizeWhitespace = true,
      filterSpecialChars = true,
    } = options;

    if (!useAdvancedQuery) {
      return query;
    }

    let optimizedQuery = query;

    // Remove special characters if enabled
    if (filterSpecialChars) {
      optimizedQuery = optimizedQuery.replace(/[^\w\s]/g, ' ');
    }

    // Normalize whitespace if enabled
    if (normalizeWhitespace) {
      optimizedQuery = optimizedQuery.replace(/\s+/g, ' ').trim();
    }

    // Add prefix matching for technical terms if enabled
    if (addPrefixMatching) {
      const words = optimizedQuery.split(' ');
      const expandedWords = words.map((word) => {
        // Add prefix matching for words longer than 3 characters
        if (word.length > 3) {
          return `${word}:*`;
        }
        return word;
      });
      optimizedQuery = expandedWords.join(' & ');
    }

    return optimizedQuery;
  }

  /**
   * Expand query with synonyms and related terms
   */
  async expandQuery(
    query: string,
    options: QueryExpansionOptions = {},
  ): Promise<{ expandedQuery: string; expansions: string[] }> {
    const { maxTerms = 3, technicalTermsOnly = false } = options;

    // Domain-specific expansions for technical documentation
    const expansionMap = new Map([
      // RoboRail specific terms
      ['roborail', ['rail', 'robot', 'automation', 'positioning']],
      ['pmac', ['controller', 'motion', 'control', 'programming']],
      ['calibration', ['calibrate', 'alignment', 'setup', 'configuration']],
      ['measurement', ['measure', 'reading', 'data', 'sensor']],

      // General technical terms
      ['installation', ['install', 'setup', 'configuration', 'deployment']],
      ['configuration', ['config', 'setting', 'parameter', 'option']],
      ['troubleshooting', ['debug', 'problem', 'issue', 'error']],
      ['maintenance', ['service', 'repair', 'upkeep', 'inspection']],

      // Error and status terms
      ['error', ['fault', 'failure', 'problem', 'issue']],
      ['connection', ['connect', 'link', 'communication', 'interface']],
      ['system', ['device', 'equipment', 'hardware', 'software']],
      ['operation', ['function', 'process', 'procedure', 'method']],
    ]);

    const words = query.toLowerCase().split(/\s+/);
    const expansions: string[] = [];

    for (const word of words) {
      const synonyms = expansionMap.get(word);
      if (synonyms) {
        // Add relevant synonyms based on options
        const relevantSynonyms = technicalTermsOnly
          ? synonyms.filter((syn) => this.isTechnicalTerm(syn))
          : synonyms;

        expansions.push(...relevantSynonyms.slice(0, maxTerms));
      }
    }

    // Remove duplicates and limit
    const uniqueExpansions = [...new Set(expansions)].slice(0, maxTerms);

    const expandedQuery =
      uniqueExpansions.length > 0
        ? `${query} ${uniqueExpansions.join(' ')}`
        : query;

    return {
      expandedQuery,
      expansions: uniqueExpansions,
    };
  }

  /**
   * Refine query based on search results for iterative search
   */
  refineQueryFromResults(
    originalQuery: string,
    results: HybridSearchResult[],
    options: QueryRefinementOptions = {},
  ): string {
    const {
      maxRefinementTerms = 2,
      topResultsCount = 3,
      excludeOriginalTerms = true,
    } = options;

    if (results.length === 0) {
      return originalQuery;
    }

    // Extract common terms from top results
    const topResults = results.slice(0, topResultsCount);
    const commonTerms = new Map<string, number>();
    const originalWords = new Set(originalQuery.toLowerCase().split(/\s+/));

    topResults.forEach((result) => {
      // Extract meaningful words (4+ characters, not stop words)
      const words = result.content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];

      words.forEach((word) => {
        // Skip if it's in original query and we're excluding original terms
        if (excludeOriginalTerms && originalWords.has(word)) {
          return;
        }

        // Skip stop words
        if (this.stopWords.has(word)) {
          return;
        }

        // Count occurrences
        commonTerms.set(word, (commonTerms.get(word) || 0) + 1);
      });
    });

    // Get most frequent terms for refinement
    const refinementTerms = Array.from(commonTerms.entries())
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, maxRefinementTerms)
      .map(([term]) => term);

    return refinementTerms.length > 0
      ? `${originalQuery} ${refinementTerms.join(' ')}`
      : originalQuery;
  }

  /**
   * Extract technical concepts and error codes from text
   */
  extractTechnicalConcepts(text: string): {
    errorCodes: string[];
    modelNumbers: string[];
    technicalTerms: string[];
    systemComponents: string[];
  } {
    const errorCodes: string[] = [];
    const modelNumbers: string[] = [];
    const technicalTerms: string[] = [];
    const systemComponents: string[] = [];

    // Extract error codes (patterns like E001, ERR-123, etc.)
    const errorCodeMatches =
      text.match(/\b(?:E|ERR|ERROR)[-_]?\d{1,4}\b/gi) || [];
    errorCodes.push(...errorCodeMatches);

    // Extract model numbers (patterns like V2.2, RR-100, etc.)
    const modelMatches = text.match(/\b[A-Z]{1,3}[-_]?\d+(?:\.\d+)*\b/g) || [];
    modelNumbers.push(...modelMatches);

    // Extract technical terms (capitalized terms, acronyms)
    const techMatches = text.match(/\b[A-Z]{2,}\b/g) || [];
    technicalTerms.push(...techMatches.filter((term) => term.length <= 10));

    // Extract system components (common technical patterns)
    const componentPatterns = [
      /\b(?:sensor|actuator|controller|interface|module|unit|system|device)\b/gi,
      /\b(?:pmac|roborail|chuck|rail|motor|encoder|driver)\b/gi,
    ];

    componentPatterns.forEach((pattern) => {
      const matches = text.match(pattern) || [];
      systemComponents.push(...matches);
    });

    return {
      errorCodes: [...new Set(errorCodes)],
      modelNumbers: [...new Set(modelNumbers)],
      technicalTerms: [...new Set(technicalTerms)],
      systemComponents: [...new Set(systemComponents)],
    };
  }

  /**
   * Build query for specific search intent (troubleshooting, installation, etc.)
   */
  buildIntentSpecificQuery(
    query: string,
    intent:
      | 'troubleshooting'
      | 'installation'
      | 'operation'
      | 'maintenance'
      | 'general',
  ): string {
    const intentBoosts = {
      troubleshooting: ['error', 'problem', 'issue', 'fault', 'debug', 'fix'],
      installation: ['install', 'setup', 'configure', 'mount', 'connect'],
      operation: ['operate', 'run', 'use', 'procedure', 'step', 'process'],
      maintenance: ['maintain', 'service', 'clean', 'inspect', 'replace'],
      general: [],
    };

    const boostTerms = intentBoosts[intent];
    if (boostTerms.length === 0) {
      return query;
    }

    // Add intent-specific boost terms with lower weight
    const boostedTerms = boostTerms.map((term) => `${term}^0.2`).join(' ');
    return `${query} ${boostedTerms}`;
  }

  /**
   * Clean and normalize query for consistent processing
   */
  normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ') // Keep hyphens for technical terms
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate alternative query phrasings for better recall
   */
  generateQueryVariations(query: string, maxVariations = 3): string[] {
    const variations: string[] = [query];
    const words = query.split(/\s+/);

    if (words.length > 1) {
      // Add individual important words as separate queries
      const importantWords = words.filter(
        (word) =>
          word.length > 3 &&
          !this.stopWords.has(word.toLowerCase()) &&
          this.isTechnicalTerm(word),
      );

      variations.push(...importantWords.slice(0, maxVariations - 1));
    }

    return variations.slice(0, maxVariations);
  }

  /**
   * Score query relevance to document types
   */
  scoreQueryDocumentRelevance(
    query: string,
    documentTypes: string[],
  ): Record<string, number> {
    const scores: Record<string, number> = {};
    const queryLower = query.toLowerCase();

    const typeIndicators = {
      manual: ['manual', 'guide', 'instruction', 'procedure', 'step'],
      faq: ['faq', 'question', 'answer', 'problem', 'issue', 'how'],
      specification: ['spec', 'specification', 'parameter', 'value', 'range'],
      troubleshooting: ['error', 'problem', 'fault', 'debug', 'fix', 'issue'],
      installation: ['install', 'setup', 'mount', 'connect', 'configure'],
    };

    documentTypes.forEach((docType) => {
      const indicators =
        typeIndicators[docType as keyof typeof typeIndicators] || [];
      const matches = indicators.filter((indicator) =>
        queryLower.includes(indicator),
      );
      scores[docType] = matches.length / indicators.length;
    });

    return scores;
  }
}

// Export singleton instance
export const queryProcessor = new QueryProcessor();

// Convenience functions
export function extractContextTerms(
  context: ConversationMessage[],
  options?: ContextExtractionOptions,
): string[] {
  return queryProcessor.extractContextTerms(context, options);
}

export function buildContextEnhancedQuery(
  originalQuery: string,
  contextTerms: string[],
  weight?: number,
): string {
  return queryProcessor.buildContextEnhancedQuery(
    originalQuery,
    contextTerms,
    weight,
  );
}

export function optimizeQueryForFullText(
  query: string,
  options?: QueryOptimizationOptions,
): string {
  return queryProcessor.optimizeQueryForFullText(query, options);
}

export function refineQueryFromResults(
  originalQuery: string,
  results: HybridSearchResult[],
  options?: QueryRefinementOptions,
): string {
  return queryProcessor.refineQueryFromResults(originalQuery, results, options);
}

export async function expandQuery(
  query: string,
  options?: QueryExpansionOptions,
): Promise<{ expandedQuery: string; expansions: string[] }> {
  return queryProcessor.expandQuery(query, options);
}
