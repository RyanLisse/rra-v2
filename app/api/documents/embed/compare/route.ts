import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/kinde';
import { cohereService } from '@/lib/ai/cohere-client';
import { z } from 'zod';

const compareRequestSchema = z.object({
  text: z.string().min(1, 'Text is required').max(5000, 'Text too long'),
  includePerformanceMetrics: z.boolean().optional(),
  iterations: z.number().min(1).max(10).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate input
    const validation = compareRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid request parameters',
          details: validation.error.errors,
        },
        { status: 400 },
      );
    }

    const {
      text,
      includePerformanceMetrics = false,
      iterations = 1,
    } = validation.data;

    if (includePerformanceMetrics && iterations > 1) {
      // Run multiple iterations for performance comparison
      const v3Times: number[] = [];
      const v4Times: number[] = [];
      let lastComparison: any;

      for (let i = 0; i < iterations; i++) {
        const comparison = await cohereService.compareEmbeddingModels(text);
        lastComparison = comparison;
        v3Times.push(comparison.processingTime1);
        v4Times.push(comparison.processingTime2);

        // Small delay between iterations
        if (i < iterations - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      const avgV3Time =
        v3Times.reduce((sum, time) => sum + time, 0) / v3Times.length;
      const avgV4Time =
        v4Times.reduce((sum, time) => sum + time, 0) / v4Times.length;
      const v3StdDev = Math.sqrt(
        v3Times.reduce((sum, time) => sum + Math.pow(time - avgV3Time, 2), 0) /
          v3Times.length,
      );
      const v4StdDev = Math.sqrt(
        v4Times.reduce((sum, time) => sum + Math.pow(time - avgV4Time, 2), 0) /
          v4Times.length,
      );

      return NextResponse.json({
        comparison: lastComparison,
        performanceAnalysis: {
          iterations,
          v3Performance: {
            avgTimeMs: Math.round(avgV3Time),
            minTimeMs: Math.min(...v3Times),
            maxTimeMs: Math.max(...v3Times),
            stdDevMs: Math.round(v3StdDev),
            allTimes: v3Times,
          },
          v4Performance: {
            avgTimeMs: Math.round(avgV4Time),
            minTimeMs: Math.min(...v4Times),
            maxTimeMs: Math.max(...v4Times),
            stdDevMs: Math.round(v4StdDev),
            allTimes: v4Times,
          },
          speedComparison: {
            fasterModel: avgV3Time < avgV4Time ? 'v3.0' : 'v4.0',
            speedDifferenceMs: Math.abs(avgV3Time - avgV4Time),
            speedDifferencePercent: Math.round(
              (Math.abs(avgV3Time - avgV4Time) /
                Math.max(avgV3Time, avgV4Time)) *
                100,
            ),
          },
        },
        recommendation: generateModelRecommendation(
          lastComparison,
          avgV3Time,
          avgV4Time,
        ),
        textAnalysis: {
          length: text.length,
          wordCount: text.split(/\s+/).length,
          complexity: analyzeTextComplexity(text),
        },
      });
    } else {
      // Single comparison
      const comparison = await cohereService.compareEmbeddingModels(text);

      return NextResponse.json({
        comparison,
        recommendation: generateModelRecommendation(
          comparison,
          comparison.processingTime1,
          comparison.processingTime2,
        ),
        textAnalysis: {
          length: text.length,
          wordCount: text.split(/\s+/).length,
          complexity: analyzeTextComplexity(text),
        },
      });
    }
  } catch (error) {
    console.error('Embedding comparison error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Cohere')) {
        return NextResponse.json(
          {
            error: 'Embedding service unavailable',
            details: 'Unable to generate embeddings for comparison',
          },
          { status: 503 },
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
}

function generateModelRecommendation(
  comparison: any,
  v3Time: number,
  v4Time: number,
): {
  recommendedModel: 'v3.0' | 'v4.0';
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  factors: string[];
} {
  const factors: string[] = [];
  let score3 = 0;
  let score4 = 0;

  // Accuracy factor (similarity between models indicates consistency)
  if (comparison.similarity > 0.95) {
    factors.push('High similarity between models (>95%)');
    // If very similar, prefer newer model
    score4 += 1;
  } else if (comparison.similarity > 0.9) {
    factors.push('Good similarity between models (90-95%)');
    score4 += 0.5;
  } else {
    factors.push('Moderate similarity between models (<90%)');
  }

  // Performance factor
  const speedDifference = Math.abs(v3Time - v4Time);
  const speedDifferencePercent =
    (speedDifference / Math.max(v3Time, v4Time)) * 100;

  if (speedDifferencePercent > 20) {
    if (v3Time < v4Time) {
      factors.push(
        `v3.0 significantly faster (${Math.round(speedDifferencePercent)}% faster)`,
      );
      score3 += 2;
    } else {
      factors.push(
        `v4.0 significantly faster (${Math.round(speedDifferencePercent)}% faster)`,
      );
      score4 += 2;
    }
  } else if (speedDifferencePercent > 10) {
    if (v3Time < v4Time) {
      factors.push(
        `v3.0 moderately faster (${Math.round(speedDifferencePercent)}% faster)`,
      );
      score3 += 1;
    } else {
      factors.push(
        `v4.0 moderately faster (${Math.round(speedDifferencePercent)}% faster)`,
      );
      score4 += 1;
    }
  } else {
    factors.push('Similar performance between models');
  }

  // Dimension factor (higher dimensions often mean better representations)
  if (comparison.dimensions2 > comparison.dimensions1) {
    factors.push(
      `v4.0 has higher dimensions (${comparison.dimensions2} vs ${comparison.dimensions1})`,
    );
    score4 += 1;
  } else if (comparison.dimensions1 > comparison.dimensions2) {
    factors.push(
      `v3.0 has higher dimensions (${comparison.dimensions1} vs ${comparison.dimensions2})`,
    );
    score3 += 1;
  } else {
    factors.push('Same dimensions for both models');
  }

  // Default preference for newer model when close
  if (Math.abs(score3 - score4) < 1) {
    factors.push('v4.0 preferred as latest model');
    score4 += 0.5;
  }

  const recommendedModel = score4 > score3 ? 'v4.0' : 'v3.0';
  const scoreDifference = Math.abs(score4 - score3);

  let confidence: 'high' | 'medium' | 'low';
  let reason: string;

  if (scoreDifference >= 2) {
    confidence = 'high';
    reason =
      score4 > score3
        ? 'v4.0 clearly outperforms v3.0 in most metrics'
        : 'v3.0 clearly outperforms v4.0 in most metrics';
  } else if (scoreDifference >= 1) {
    confidence = 'medium';
    reason =
      score4 > score3
        ? 'v4.0 has slight advantages over v3.0'
        : 'v3.0 has slight advantages over v4.0';
  } else {
    confidence = 'low';
    reason = 'Both models perform similarly for this text';
  }

  return {
    recommendedModel,
    reason,
    confidence,
    factors,
  };
}

function analyzeTextComplexity(text: string): 'low' | 'medium' | 'high' {
  const wordCount = text.split(/\s+/).length;
  const avgWordLength = text.replace(/\s+/g, '').length / wordCount;
  const sentenceCount = text.split(/[.!?]+/).length;
  const avgSentenceLength = wordCount / sentenceCount;

  // Simple complexity heuristic
  let complexityScore = 0;

  if (avgWordLength > 6) complexityScore += 1;
  if (avgSentenceLength > 20) complexityScore += 1;
  if (wordCount > 100) complexityScore += 1;
  if (/[A-Z]{2,}/.test(text)) complexityScore += 1; // Acronyms
  if (/\d+/.test(text)) complexityScore += 1; // Numbers

  if (complexityScore >= 4) return 'high';
  if (complexityScore >= 2) return 'medium';
  return 'low';
}
