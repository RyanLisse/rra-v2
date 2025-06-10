/**
 * Result Processing Module
 *
 * Handles all result processing operations including combining vector and text results,
 * reranking, adaptive scoring, and result optimization for the vector search system.
 * Provides sophisticated algorithms for merging and ranking search results.
 */

import { cohereService } from '@/lib/ai/cohere-client';
import type { SearchResult, HybridSearchResult } from './types';

export interface ResultCombinationOptions {
  algorithm: 'weighted' | 'rrf' | 'adaptive';
  vectorWeight?: number;
  textWeight?: number;
  k?: number; // RRF parameter
}

export interface AdaptiveScoringWeights {
  vectorWeight: number;
  textWeight: number;
  algorithm: string;
}

export interface RerankingOptions {
  topK: number;
  includeDocumentContext?: boolean;
  weightOriginalScore?: number;
}

/**
 * Comprehensive result processing service for search operations
 */
export class ResultProcessor {
  /**
   * Combine vector and text search results using weighted scoring
   */
  combineResults(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    vectorWeight: number,
    textWeight: number,
  ): HybridSearchResult[] {
    const resultMap = new Map<string, HybridSearchResult>();

    // Add vector results
    vectorResults.forEach((result, index) => {
      const normalizedScore = 1 - index / vectorResults.length; // Normalize by rank
      resultMap.set(result.chunkId, {
        ...result,
        vectorScore: result.similarity,
        textScore: 0,
        hybridScore: vectorWeight * normalizedScore,
      });
    });

    // Add text results
    textResults.forEach((result, index) => {
      const normalizedScore = 1 - index / textResults.length; // Normalize by rank
      const existing = resultMap.get(result.chunkId);

      if (existing) {
        existing.textScore = result.similarity;
        existing.hybridScore =
          vectorWeight * (existing.vectorScore || 0) +
          textWeight * normalizedScore;
      } else {
        resultMap.set(result.chunkId, {
          ...result,
          vectorScore: 0,
          textScore: result.similarity,
          hybridScore: textWeight * normalizedScore,
        });
      }
    });

    return Array.from(resultMap.values());
  }

  /**
   * Reciprocal Rank Fusion (RRF) for combining search results
   */
  combineResultsRRF(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    k = 60,
  ): HybridSearchResult[] {
    const resultMap = new Map<string, HybridSearchResult>();

    // Add vector results with RRF scoring
    vectorResults.forEach((result, index) => {
      const rrfScore = 1 / (k + index + 1);
      resultMap.set(result.chunkId, {
        ...result,
        vectorScore: result.similarity,
        textScore: 0,
        hybridScore: rrfScore,
      });
    });

    // Add text results with RRF scoring
    textResults.forEach((result, index) => {
      const rrfScore = 1 / (k + index + 1);
      const existing = resultMap.get(result.chunkId);

      if (existing) {
        existing.textScore = result.similarity;
        existing.hybridScore += rrfScore;
      } else {
        resultMap.set(result.chunkId, {
          ...result,
          vectorScore: 0,
          textScore: result.similarity,
          hybridScore: rrfScore,
        });
      }
    });

    return Array.from(resultMap.values());
  }

  /**
   * Adaptive scoring that adjusts weights based on query characteristics
   */
  adaptiveScoring(
    query: string,
    vectorResults: SearchResult[],
    textResults: SearchResult[],
  ): AdaptiveScoringWeights {
    // Analyze query characteristics
    const hasSpecificTerms = /\b(error|issue|problem|fix|solve)\b/i.test(query);
    const hasNumbers = /\d+/.test(query);
    const isLongQuery = query.length > 50;
    const wordCount = query.split(/\s+/).length;

    let vectorWeight = 0.7;
    let textWeight = 0.3;

    // Adjust weights based on query analysis
    if (hasSpecificTerms || hasNumbers) {
      // Favor text search for specific technical terms and numbers
      textWeight = 0.5;
      vectorWeight = 0.5;
    }

    if (isLongQuery || wordCount > 10) {
      // Favor vector search for conceptual/longer queries
      vectorWeight = 0.8;
      textWeight = 0.2;
    }

    // Analyze result quality to further adjust
    const vectorAvgScore =
      vectorResults.length > 0
        ? vectorResults.reduce((sum, r) => sum + r.similarity, 0) /
          vectorResults.length
        : 0;
    const textAvgScore =
      textResults.length > 0
        ? textResults.reduce((sum, r) => sum + r.similarity, 0) /
          textResults.length
        : 0;

    // If one method significantly outperforms, adjust weights
    if (vectorAvgScore > textAvgScore * 1.5) {
      vectorWeight = Math.min(0.9, vectorWeight + 0.1);
      textWeight = 1 - vectorWeight;
    } else if (textAvgScore > vectorAvgScore * 1.5) {
      textWeight = Math.min(0.9, textWeight + 0.1);
      vectorWeight = 1 - textWeight;
    }

    return { vectorWeight, textWeight, algorithm: 'adaptive' };
  }

  /**
   * Enhanced rerank results using Cohere Rerank with confidence scoring
   */
  async rerankResults(
    query: string,
    results: HybridSearchResult[],
    options: RerankingOptions = { topK: 10 },
  ): Promise<HybridSearchResult[]> {
    if (results.length <= 1) return results;

    const {
      topK,
      includeDocumentContext = true,
      weightOriginalScore = 0.2,
    } = options;

    try {
      // Prepare documents with enhanced context
      const documents = results.map((result) => {
        if (includeDocumentContext) {
          // Include document title and metadata for better reranking
          return `${result.documentTitle}: ${result.content}`;
        }
        return result.content;
      });

      const rerankResponse = await cohereService.rerankDocuments(
        query,
        documents,
        Math.min(topK * 2, 20), // Get more candidates for better selection
      );

      // Map rerank results back with enhanced scoring
      const rerankedResults = rerankResponse.results.map((rerankResult) => {
        const originalResult = results[rerankResult.index];

        // Combine rerank score with original hybrid score
        const combinedScore =
          rerankResult.relevanceScore * (1 - weightOriginalScore) +
          originalResult.hybridScore * weightOriginalScore;

        return {
          ...originalResult,
          rerankScore: rerankResult.relevanceScore,
          hybridScore: combinedScore,
        };
      });

      // Return top K results
      return rerankedResults.slice(0, topK);
    } catch (error) {
      console.error('Reranking error:', error);
      // Fall back to original ordering if reranking fails
      return results.slice(0, topK);
    }
  }

  /**
   * Apply confidence-based filtering to results
   */
  filterByConfidence(
    results: HybridSearchResult[],
    minConfidence = 0.1,
    adaptiveThreshold = true,
  ): HybridSearchResult[] {
    if (results.length === 0) return results;

    let threshold = minConfidence;

    // Adaptive threshold based on result distribution
    if (adaptiveThreshold) {
      const scores = results.map((r) => r.hybridScore);
      const mean =
        scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const std = Math.sqrt(
        scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
          scores.length,
      );

      // Use one standard deviation below mean as threshold
      threshold = Math.max(minConfidence, mean - std);
    }

    return results.filter((result) => result.hybridScore >= threshold);
  }

  /**
   * Normalize scores across different search algorithms
   */
  normalizeScores(results: HybridSearchResult[]): HybridSearchResult[] {
    if (results.length === 0) return results;

    // Find min and max scores
    const scores = results.map((r) => r.hybridScore);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore;

    if (scoreRange === 0) return results;

    // Normalize to 0-1 range
    return results.map((result) => ({
      ...result,
      hybridScore: (result.hybridScore - minScore) / scoreRange,
    }));
  }

  /**
   * Apply diversity filtering to avoid similar results
   */
  async diversifyResults(
    results: HybridSearchResult[],
    diversityThreshold = 0.8,
    maxResults = 10,
  ): Promise<HybridSearchResult[]> {
    if (results.length <= maxResults) return results;

    const diverseResults: HybridSearchResult[] = [];
    const used = new Set<string>();

    for (const result of results) {
      if (diverseResults.length >= maxResults) break;

      // Check similarity with already selected results
      let isDiverse = true;
      for (const selected of diverseResults) {
        const similarity = this.calculateTextSimilarity(
          result.content,
          selected.content,
        );
        if (similarity > diversityThreshold) {
          isDiverse = false;
          break;
        }
      }

      if (isDiverse && !used.has(result.chunkId)) {
        diverseResults.push(result);
        used.add(result.chunkId);
      }
    }

    return diverseResults;
  }

  /**
   * Calculate simple text similarity using Jaccard index
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Boost results based on metadata signals
   */
  applyMetadataBoosts(
    results: HybridSearchResult[],
    boostConfig: {
      elementTypeBoosts?: Record<string, number>;
      pageBoosts?: Record<number, number>;
      documentBoosts?: Record<string, number>;
      recencyBoost?: number;
    } = {},
  ): HybridSearchResult[] {
    const {
      elementTypeBoosts = {},
      pageBoosts = {},
      documentBoosts = {},
      recencyBoost = 0,
    } = boostConfig;

    return results.map((result) => {
      let boost = 1.0;

      // Element type boost
      if (result.elementType && elementTypeBoosts[result.elementType]) {
        boost *= elementTypeBoosts[result.elementType];
      }

      // Page number boost
      if (result.pageNumber && pageBoosts[result.pageNumber]) {
        boost *= pageBoosts[result.pageNumber];
      }

      // Document boost
      if (documentBoosts[result.documentId]) {
        boost *= documentBoosts[result.documentId];
      }

      // Recency boost (assuming chunk index correlates with document position)
      if (recencyBoost > 0) {
        const recencyFactor = 1 + recencyBoost * (1 - result.chunkIndex / 100);
        boost *= recencyFactor;
      }

      return {
        ...result,
        hybridScore: result.hybridScore * boost,
      };
    });
  }

  /**
   * Sort results by multiple criteria
   */
  sortResults(
    results: HybridSearchResult[],
    criteria: Array<{
      field:
        | 'hybridScore'
        | 'vectorScore'
        | 'textScore'
        | 'similarity'
        | 'chunkIndex'
        | 'pageNumber';
      direction: 'asc' | 'desc';
      weight?: number;
    }>,
  ): HybridSearchResult[] {
    return [...results].sort((a, b) => {
      for (const criterion of criteria) {
        const { field, direction, weight = 1 } = criterion;

        const aValue = this.getFieldValue(a, field);
        const bValue = this.getFieldValue(b, field);

        if (aValue === bValue) continue;

        const comparison =
          direction === 'desc' ? bValue - aValue : aValue - bValue;
        if (comparison !== 0) {
          return comparison * weight;
        }
      }
      return 0;
    });
  }

  /**
   * Get field value for sorting
   */
  private getFieldValue(result: HybridSearchResult, field: string): number {
    switch (field) {
      case 'hybridScore':
        return result.hybridScore;
      case 'vectorScore':
        return result.vectorScore || 0;
      case 'textScore':
        return result.textScore || 0;
      case 'similarity':
        return result.similarity;
      case 'chunkIndex':
        return result.chunkIndex;
      case 'pageNumber':
        return result.pageNumber || 0;
      default:
        return 0;
    }
  }

  /**
   * Merge overlapping results from same document
   */
  mergeOverlappingResults(
    results: HybridSearchResult[],
    overlapThreshold = 0.5,
  ): HybridSearchResult[] {
    const merged: HybridSearchResult[] = [];
    const processed = new Set<string>();

    for (const result of results) {
      if (processed.has(result.chunkId)) continue;

      const overlapping = results.filter(
        (r) =>
          r.documentId === result.documentId &&
          !processed.has(r.chunkId) &&
          Math.abs(r.chunkIndex - result.chunkIndex) <= 2, // Adjacent chunks
      );

      if (overlapping.length > 1) {
        // Merge overlapping results
        const mergedResult = this.mergeResultGroup(overlapping);
        merged.push(mergedResult);
        overlapping.forEach((r) => processed.add(r.chunkId));
      } else {
        merged.push(result);
        processed.add(result.chunkId);
      }
    }

    return merged;
  }

  /**
   * Merge a group of results into a single result
   */
  private mergeResultGroup(results: HybridSearchResult[]): HybridSearchResult {
    // Sort by chunk index
    const sorted = results.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Take the highest scoring result as base
    const best = results.reduce((prev, current) =>
      current.hybridScore > prev.hybridScore ? current : prev,
    );

    return {
      ...best,
      content: sorted.map((r) => r.content).join(' ... '),
      hybridScore: Math.max(...results.map((r) => r.hybridScore)),
      vectorScore: Math.max(...results.map((r) => r.vectorScore || 0)),
      textScore: Math.max(...results.map((r) => r.textScore || 0)),
    };
  }

  /**
   * Calculate result quality score based on multiple factors
   */
  calculateQualityScore(result: HybridSearchResult): number {
    let score = result.hybridScore;

    // Boost based on content length (longer chunks might be more informative)
    const lengthBoost = Math.min(1.2, 1 + result.content.length / 1000);
    score *= lengthBoost;

    // Boost based on element type importance
    const elementTypeBoosts = {
      title: 1.3,
      heading: 1.2,
      table_text: 1.1,
      list_item: 1.05,
      paragraph: 1.0,
      figure_caption: 0.9,
    };

    if (
      result.elementType &&
      elementTypeBoosts[result.elementType as keyof typeof elementTypeBoosts]
    ) {
      score *=
        elementTypeBoosts[result.elementType as keyof typeof elementTypeBoosts];
    }

    // Penalize very short content
    if (result.content.length < 50) {
      score *= 0.8;
    }

    return score;
  }

  /**
   * Filter results to maintain context coherence
   */
  maintainContextCoherence(
    results: HybridSearchResult[],
    maxContextSwitch = 3,
  ): HybridSearchResult[] {
    if (results.length === 0) return results;

    const coherentResults: HybridSearchResult[] = [];
    let currentDocument = '';
    let documentSwitches = 0;

    for (const result of results) {
      if (result.documentId !== currentDocument) {
        if (
          documentSwitches >= maxContextSwitch &&
          coherentResults.length > 0
        ) {
          break; // Stop if we've switched too many times
        }
        currentDocument = result.documentId;
        documentSwitches++;
      }
      coherentResults.push(result);
    }

    return coherentResults;
  }
}

// Export singleton instance
export const resultProcessor = new ResultProcessor();
