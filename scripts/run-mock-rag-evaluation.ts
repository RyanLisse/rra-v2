#!/usr/bin/env bun

/**
 * Mock RAG Evaluation Script
 *
 * Demonstrates the RAG evaluation framework using mock data
 * when the actual RAG pipeline components are not available.
 */

import { RAGEvaluator } from '@/lib/evaluation/rag-evaluator';
import {
  getTestDataset,
  type EvaluationConfig,
} from '@/lib/evaluation/rag-test-dataset';
import { runMockRAGPipelineBatch } from '@/lib/evaluation/mock-rag-pipeline-runner';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

interface EvaluationResults {
  timestamp: string;
  config: EvaluationConfig;
  summary: {
    totalTests: number;
    testsPassed: number;
    testsPassedPercentage: number;
  };
  results: Array<{
    testCaseId: string;
    query: string;
    actualOutput: string;
    retrievalContext: string[];
    metrics: any;
    overallScore: number;
    timestamp: string;
  }>;
}

async function runMockRAGEvaluation(): Promise<void> {
  console.log('🚀 Starting Mock RAG Evaluation...');

  // Configuration
  const config: EvaluationConfig = {
    maxTestCases: 10,
    categories: [], // Empty = all categories
    difficulties: ['easy', 'medium'],
    thresholds: {
      contextualRelevance: 0.6,
      faithfulness: 0.7,
      answerRelevance: 0.6,
    },
    model: 'gemini-1.5-flash',
  };

  console.log('Configuration:', config);

  // Get test dataset
  const testCases = getTestDataset({
    maxCases: config.maxTestCases,
    categories: config.categories,
    difficulties: config.difficulties,
  });

  console.log(`📝 Selected ${testCases.length} test cases for evaluation`);

  // Run queries through mock RAG pipeline
  console.log('🔍 Running queries through Mock RAG pipeline...');
  const queries = testCases.map((tc) => tc.query);
  const ragOutputs = await runMockRAGPipelineBatch(queries);

  // Initialize evaluator
  console.log('📊 Evaluating RAG outputs...');
  const evaluator = new RAGEvaluator(
    0.7, // contextualRelevanceThreshold
    0.8, // faithfulnessThreshold
    0.7, // answerRelevanceThreshold
    config.model,
  );

  // Run evaluation for each test case
  const results: EvaluationResults['results'] = [];

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const ragOutput = ragOutputs[i];

    try {
      const evaluation = await evaluator.evaluateTestCase(testCase, ragOutput);

      results.push({
        testCaseId: testCase.id,
        query: testCase.query,
        actualOutput: ragOutput.actualOutput,
        retrievalContext: ragOutput.retrievalContext,
        metrics: evaluation.metrics,
        overallScore: evaluation.overallScore,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`Failed to evaluate test case ${testCase.id}:`, error);

      // Record failure
      results.push({
        testCaseId: testCase.id,
        query: testCase.query,
        actualOutput: ragOutput.actualOutput,
        retrievalContext: ragOutput.retrievalContext,
        metrics: {
          contextualRelevance: {
            score: 0,
            threshold: config.thresholds.contextualRelevance,
            passed: false,
            reason: `Evaluation failed: ${error}`,
          },
          faithfulness: {
            score: 0,
            threshold: config.thresholds.faithfulness,
            passed: false,
            reason: `Evaluation failed: ${error}`,
          },
          answerRelevance: {
            score: 0,
            threshold: config.thresholds.answerRelevance,
            passed: false,
            reason: `Evaluation failed: ${error}`,
          },
        },
        overallScore: 0,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Calculate summary statistics
  const testsPassed = results.filter((r) => r.overallScore >= 0.6).length; // Average of thresholds
  const summary = {
    totalTests: results.length,
    testsPassed,
    testsPassedPercentage:
      Math.round((testsPassed / results.length) * 100 * 10) / 10,
  };

  // Prepare final results
  const evaluationResults: EvaluationResults = {
    timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
    config,
    summary,
    results,
  };

  // Display results
  console.log('\n=== MOCK RAG EVALUATION RESULTS ===');
  console.log(`Total Tests: ${summary.totalTests}`);
  console.log(
    `Tests Passed: ${summary.testsPassed} (${summary.testsPassedPercentage}%)`,
  );

  // Calculate average scores
  const avgScores = {
    overall:
      results.reduce((sum, r) => sum + r.overallScore, 0) / results.length,
    contextualRelevance:
      results.reduce(
        (sum, r) => sum + (r.metrics.contextualRelevance?.score || 0),
        0,
      ) / results.length,
    faithfulness:
      results.reduce(
        (sum, r) => sum + (r.metrics.faithfulness?.score || 0),
        0,
      ) / results.length,
    answerRelevance:
      results.reduce(
        (sum, r) => sum + (r.metrics.answerRelevance?.score || 0),
        0,
      ) / results.length,
  };

  console.log('\nAverage Scores:');
  console.log(`  Overall: ${avgScores.overall.toFixed(3)}`);
  console.log(
    `  Contextual Relevance: ${avgScores.contextualRelevance.toFixed(3)}`,
  );
  console.log(`  Faithfulness: ${avgScores.faithfulness.toFixed(3)}`);
  console.log(`  Answer Relevance: ${avgScores.answerRelevance.toFixed(3)}`);

  // Calculate pass rates
  const passRates = {
    contextualRelevance:
      (results.filter((r) => r.metrics.contextualRelevance?.passed).length /
        results.length) *
      100,
    faithfulness:
      (results.filter((r) => r.metrics.faithfulness?.passed).length /
        results.length) *
      100,
    answerRelevance:
      (results.filter((r) => r.metrics.answerRelevance?.passed).length /
        results.length) *
      100,
  };

  console.log('\nPass Rates:');
  console.log(
    `  Contextual Relevance: ${passRates.contextualRelevance.toFixed(1)}%`,
  );
  console.log(`  Faithfulness: ${passRates.faithfulness.toFixed(1)}%`);
  console.log(`  Answer Relevance: ${passRates.answerRelevance.toFixed(1)}%`);

  // Show failed tests
  const failedTests = results.filter((r) => r.overallScore < 0.6);
  if (failedTests.length > 0) {
    console.log(
      `\n❌ ${failedTests.length} test(s) failed to meet thresholds:\n`,
    );

    failedTests.forEach((test) => {
      console.log(`  Test: ${test.testCaseId}`);
      console.log(`  Query: ${test.query}`);
      console.log(`  Overall Score: ${test.overallScore.toFixed(3)}`);
      console.log('  Failed Metrics:');

      Object.entries(test.metrics).forEach(
        ([metric, result]: [string, any]) => {
          if (!result.passed) {
            console.log(
              `    - ${metric.charAt(0).toUpperCase() + metric.slice(1)}: ${result.score.toFixed(3)} (threshold: ${result.threshold})`,
            );
          }
        },
      );
      console.log('');
    });
  } else {
    console.log('\n✅ All tests passed!');
  }

  // Save detailed report
  const reportPath = path.join(
    process.cwd(),
    'mock-rag-evaluation-report.json',
  );
  writeFileSync(reportPath, JSON.stringify(evaluationResults, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}`);

  console.log('\n✅ Mock RAG Evaluation completed!');
}

// Run the evaluation
runMockRAGEvaluation().catch(console.error);
