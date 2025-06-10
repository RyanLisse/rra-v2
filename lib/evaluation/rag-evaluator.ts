/**
 * RAG Evaluation Framework - TypeScript Implementation
 *
 * Inspired by DeepEval's methodology but built for TypeScript/Node.js environments.
 * Evaluates RAG systems on key metrics: Contextual Relevance, Faithfulness, and Answer Relevance.
 */

import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Initialize AI client for evaluation
const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export interface RAGTestCase {
  id: string;
  query: string;
  expectedOutput: string;
  idealContext?: string[];
  documentId?: string;
  metadata?: Record<string, any>;
}

export interface RAGEvaluationResult {
  testCaseId: string;
  query: string;
  actualOutput: string;
  retrievalContext: string[];
  metrics: {
    contextualRelevance: MetricScore;
    faithfulness: MetricScore;
    answerRelevance: MetricScore;
  };
  overallScore: number;
  timestamp: string;
}

export interface MetricScore {
  score: number; // 0-1 scale
  threshold: number;
  passed: boolean;
  reason: string;
  details?: Record<string, any>;
}

export interface RAGSystemOutput {
  actualOutput: string;
  retrievalContext: string[];
  sources?: any[];
}

/**
 * Contextual Relevance Metric
 * Evaluates how relevant the retrieved context is to the given query
 */
export class ContextualRelevanceMetric {
  private threshold: number;
  private model: string;

  constructor(threshold = 0.7, model = 'gemini-1.5-flash') {
    this.threshold = threshold;
    this.model = model;
  }

  async evaluate(
    query: string,
    retrievalContext: string[],
  ): Promise<MetricScore> {
    const prompt = `
You are an expert evaluator for RAG (Retrieval-Augmented Generation) systems.

Task: Evaluate the contextual relevance of retrieved passages to a given query.

Query: "${query}"

Retrieved Context:
${retrievalContext.map((ctx, i) => `[${i + 1}] ${ctx}`).join('\n\n')}

Instructions:
1. Assess how relevant each retrieved passage is to answering the given query
2. Consider both direct relevance and potential usefulness for generating a comprehensive answer
3. Assign a relevance score from 0.0 (completely irrelevant) to 1.0 (perfectly relevant)
4. Provide a clear explanation for your scoring

Format your response as:
SCORE: [0.0-1.0]
REASONING: [Detailed explanation of why you assigned this score, analyzing each passage's relevance]
`;

    try {
      const response = await generateText({
        model: google(this.model),
        prompt,
        temperature: 0.1, // Low temperature for consistent evaluation
      });

      const scoreMatch = response.text.match(/SCORE:\s*([\d.]+)/);
      const reasoningMatch = response.text.match(/REASONING:\s*(.*)/s);

      const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : 0;
      const reason = reasoningMatch
        ? reasoningMatch[1].trim()
        : 'No reasoning provided';

      return {
        score: Math.max(0, Math.min(1, score)), // Clamp to 0-1
        threshold: this.threshold,
        passed: score >= this.threshold,
        reason,
        details: {
          contextPassagesCount: retrievalContext.length,
          evaluationModel: this.model,
        },
      };
    } catch (error) {
      return {
        score: 0,
        threshold: this.threshold,
        passed: false,
        reason: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
      };
    }
  }
}

/**
 * Faithfulness Metric
 * Evaluates whether the generated answer is faithful to the provided context
 */
export class FaithfulnessMetric {
  private threshold: number;
  private model: string;

  constructor(threshold = 0.8, model = 'gemini-1.5-flash') {
    this.threshold = threshold;
    this.model = model;
  }

  async evaluate(
    answer: string,
    retrievalContext: string[],
  ): Promise<MetricScore> {
    const prompt = `
You are an expert evaluator for RAG (Retrieval-Augmented Generation) systems.

Task: Evaluate the faithfulness of a generated answer to its source context.

Generated Answer: "${answer}"

Source Context:
${retrievalContext.map((ctx, i) => `[${i + 1}] ${ctx}`).join('\n\n')}

Instructions:
1. Check if the generated answer is supported by the provided context
2. Identify any claims in the answer that are not supported by the context (hallucinations)
3. Assess if the answer extrapolates beyond what's stated in the context
4. Assign a faithfulness score from 0.0 (completely unfaithful/hallucinatory) to 1.0 (perfectly faithful)

Criteria:
- 1.0: All claims in the answer are directly supported by the context
- 0.8-0.9: Most claims supported, minor acceptable inferences
- 0.6-0.7: Some unsupported claims or significant extrapolation
- 0.4-0.5: Major unsupported claims or contradictions
- 0.0-0.3: Answer is largely fabricated or contradicts the context

Format your response as:
SCORE: [0.0-1.0]
REASONING: [Detailed explanation of faithfulness assessment, highlighting any unsupported claims]
`;

    try {
      const response = await generateText({
        model: google(this.model),
        prompt,
        temperature: 0.1,
      });

      const scoreMatch = response.text.match(/SCORE:\s*([\d.]+)/);
      const reasoningMatch = response.text.match(/REASONING:\s*(.*)/s);

      const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : 0;
      const reason = reasoningMatch
        ? reasoningMatch[1].trim()
        : 'No reasoning provided';

      return {
        score: Math.max(0, Math.min(1, score)),
        threshold: this.threshold,
        passed: score >= this.threshold,
        reason,
        details: {
          answerLength: answer.length,
          contextPassagesCount: retrievalContext.length,
          evaluationModel: this.model,
        },
      };
    } catch (error) {
      return {
        score: 0,
        threshold: this.threshold,
        passed: false,
        reason: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
      };
    }
  }
}

/**
 * Answer Relevance Metric
 * Evaluates how well the generated answer addresses the original query
 */
export class AnswerRelevanceMetric {
  private threshold: number;
  private model: string;

  constructor(threshold = 0.7, model = 'gemini-1.5-flash') {
    this.threshold = threshold;
    this.model = model;
  }

  async evaluate(query: string, answer: string): Promise<MetricScore> {
    const prompt = `
You are an expert evaluator for RAG (Retrieval-Augmented Generation) systems.

Task: Evaluate how relevant and helpful the generated answer is to the original query.

Original Query: "${query}"

Generated Answer: "${answer}"

Instructions:
1. Assess how directly and completely the answer addresses the query
2. Consider if the answer provides the information the user was seeking
3. Evaluate clarity, completeness, and usefulness of the response
4. Assign a relevance score from 0.0 (completely irrelevant) to 1.0 (perfectly relevant and helpful)

Criteria:
- 1.0: Answer directly and completely addresses the query with clear, helpful information
- 0.8-0.9: Answer addresses the query well with minor gaps or tangential information
- 0.6-0.7: Answer partially addresses the query but missing key information or clarity
- 0.4-0.5: Answer only tangentially related to the query
- 0.0-0.3: Answer is largely irrelevant to the query

Format your response as:
SCORE: [0.0-1.0]
REASONING: [Detailed explanation of relevance assessment, noting what the answer does/doesn't address]
`;

    try {
      const response = await generateText({
        model: google(this.model),
        prompt,
        temperature: 0.1,
      });

      const scoreMatch = response.text.match(/SCORE:\s*([\d.]+)/);
      const reasoningMatch = response.text.match(/REASONING:\s*(.*)/s);

      const score = scoreMatch ? Number.parseFloat(scoreMatch[1]) : 0;
      const reason = reasoningMatch
        ? reasoningMatch[1].trim()
        : 'No reasoning provided';

      return {
        score: Math.max(0, Math.min(1, score)),
        threshold: this.threshold,
        passed: score >= this.threshold,
        reason,
        details: {
          queryLength: query.length,
          answerLength: answer.length,
          evaluationModel: this.model,
        },
      };
    } catch (error) {
      return {
        score: 0,
        threshold: this.threshold,
        passed: false,
        reason: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: { error: true },
      };
    }
  }
}

/**
 * Main RAG Evaluator class
 * Orchestrates the evaluation of RAG systems using multiple metrics
 */
export class RAGEvaluator {
  private contextualRelevanceMetric: ContextualRelevanceMetric;
  private faithfulnessMetric: FaithfulnessMetric;
  private answerRelevanceMetric: AnswerRelevanceMetric;

  constructor(
    contextualRelevanceThreshold = 0.7,
    faithfulnessThreshold = 0.8,
    answerRelevanceThreshold = 0.7,
    model = 'gemini-1.5-flash',
  ) {
    this.contextualRelevanceMetric = new ContextualRelevanceMetric(
      contextualRelevanceThreshold,
      model,
    );
    this.faithfulnessMetric = new FaithfulnessMetric(
      faithfulnessThreshold,
      model,
    );
    this.answerRelevanceMetric = new AnswerRelevanceMetric(
      answerRelevanceThreshold,
      model,
    );
  }

  /**
   * Evaluate a single RAG test case
   */
  async evaluateTestCase(
    testCase: RAGTestCase,
    ragOutput: RAGSystemOutput,
  ): Promise<RAGEvaluationResult> {
    const { actualOutput, retrievalContext } = ragOutput;

    // Run all metrics in parallel for efficiency
    const [contextualRelevance, faithfulness, answerRelevance] =
      await Promise.all([
        this.contextualRelevanceMetric.evaluate(
          testCase.query,
          retrievalContext,
        ),
        this.faithfulnessMetric.evaluate(actualOutput, retrievalContext),
        this.answerRelevanceMetric.evaluate(testCase.query, actualOutput),
      ]);

    // Calculate overall score as weighted average
    const overallScore =
      contextualRelevance.score * 0.3 +
      faithfulness.score * 0.4 +
      answerRelevance.score * 0.3;

    return {
      testCaseId: testCase.id,
      query: testCase.query,
      actualOutput,
      retrievalContext,
      metrics: {
        contextualRelevance,
        faithfulness,
        answerRelevance,
      },
      overallScore,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Evaluate multiple test cases
   */
  async evaluateTestSuite(
    testCases: RAGTestCase[],
    ragOutputs: RAGSystemOutput[],
  ): Promise<RAGEvaluationResult[]> {
    if (testCases.length !== ragOutputs.length) {
      throw new Error('Test cases and RAG outputs must have the same length');
    }

    const results: RAGEvaluationResult[] = [];

    // Evaluate test cases sequentially to avoid overwhelming the LLM API
    for (let i = 0; i < testCases.length; i++) {
      const result = await this.evaluateTestCase(testCases[i], ragOutputs[i]);
      results.push(result);

      // Small delay to respect API rate limits
      if (i < testCases.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Generate evaluation summary statistics
   */
  generateSummary(results: RAGEvaluationResult[]) {
    if (results.length === 0) {
      return {
        totalTests: 0,
        averageScores: {
          contextualRelevance: 0,
          faithfulness: 0,
          answerRelevance: 0,
          overall: 0,
        },
        passRates: {
          contextualRelevance: 0,
          faithfulness: 0,
          answerRelevance: 0,
        },
        testsPassed: 0,
        testsPassedPercentage: 0,
      };
    }

    const totalTests = results.length;

    const averageScores = {
      contextualRelevance:
        results.reduce(
          (sum, r) => sum + r.metrics.contextualRelevance.score,
          0,
        ) / totalTests,
      faithfulness:
        results.reduce((sum, r) => sum + r.metrics.faithfulness.score, 0) /
        totalTests,
      answerRelevance:
        results.reduce((sum, r) => sum + r.metrics.answerRelevance.score, 0) /
        totalTests,
      overall: results.reduce((sum, r) => sum + r.overallScore, 0) / totalTests,
    };

    const passRates = {
      contextualRelevance:
        results.filter((r) => r.metrics.contextualRelevance.passed).length /
        totalTests,
      faithfulness:
        results.filter((r) => r.metrics.faithfulness.passed).length /
        totalTests,
      answerRelevance:
        results.filter((r) => r.metrics.answerRelevance.passed).length /
        totalTests,
    };

    const testsPassed = results.filter(
      (r) =>
        r.metrics.contextualRelevance.passed &&
        r.metrics.faithfulness.passed &&
        r.metrics.answerRelevance.passed,
    ).length;

    return {
      totalTests,
      averageScores,
      passRates,
      testsPassed,
      testsPassedPercentage: (testsPassed / totalTests) * 100,
    };
  }
}

// Export default evaluator instance
export const ragEvaluator = new RAGEvaluator();
