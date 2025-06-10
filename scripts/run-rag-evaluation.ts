#!/usr/bin/env bun
/**
 * RAG Evaluation Script
 *
 * Standalone script to run RAG evaluation and generate comprehensive reports.
 * This can be used for continuous monitoring of RAG system performance.
 */

import { RAGEvaluator } from '@/lib/evaluation/rag-evaluator';
import { runRAGPipelineBatch } from '@/lib/evaluation/rag-pipeline-runner';
import { roboRailTestDataset } from '@/lib/evaluation/rag-test-dataset';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface EvaluationConfig {
  maxTestCases?: number;
  categories?: string[];
  difficulties?: Array<'easy' | 'medium' | 'hard'>;
  outputDir?: string;
  contextualRelevanceThreshold?: number;
  faithfulnessThreshold?: number;
  answerRelevanceThreshold?: number;
  model?: string;
}

async function runRAGEvaluation(config: EvaluationConfig = {}) {
  const {
    maxTestCases = 10,
    categories = [],
    difficulties = ['easy', 'medium'],
    outputDir = './evaluation-results',
    contextualRelevanceThreshold = 0.6,
    faithfulnessThreshold = 0.7,
    answerRelevanceThreshold = 0.6,
    model = 'gemini-1.5-flash',
  } = config;

  console.log('🚀 Starting RAG Evaluation...');
  console.log('Configuration:', {
    maxTestCases,
    categories,
    difficulties,
    thresholds: {
      contextualRelevance: contextualRelevanceThreshold,
      faithfulness: faithfulnessThreshold,
      answerRelevance: answerRelevanceThreshold,
    },
    model,
  });

  // Check environment
  if (
    !process.env.GEMINI_API_KEY &&
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    throw new Error(
      'GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable is required',
    );
  }

  // Initialize evaluator
  const ragEvaluator = new RAGEvaluator(
    contextualRelevanceThreshold,
    faithfulnessThreshold,
    answerRelevanceThreshold,
    model,
  );

  // Select test cases
  let testCases = roboRailTestDataset;

  if (categories.length > 0) {
    testCases = testCases.filter((tc) =>
      categories.includes(tc.metadata?.category || ''),
    );
  }

  if (difficulties.length > 0) {
    testCases = testCases.filter((tc) =>
      difficulties.includes(tc.metadata?.difficulty as any),
    );
  }

  testCases = testCases.slice(0, maxTestCases);

  console.log(`📝 Selected ${testCases.length} test cases for evaluation`);

  // Run queries through RAG pipeline
  console.log('🔍 Running queries through RAG pipeline...');
  const queries = testCases.map((tc) => tc.query);
  const ragOutputs = await runRAGPipelineBatch(queries);

  console.log('📊 Evaluating RAG outputs...');

  // Evaluate all test cases
  const evaluationResults = await ragEvaluator.evaluateTestSuite(
    testCases,
    ragOutputs,
  );

  // Generate summary
  const summary = ragEvaluator.generateSummary(evaluationResults);

  // Print results to console
  console.log('\n=== RAG EVALUATION RESULTS ===');
  console.log(`Total Tests: ${summary.totalTests}`);
  console.log(
    `Tests Passed: ${summary.testsPassed} (${summary.testsPassedPercentage.toFixed(1)}%)`,
  );
  console.log('\nAverage Scores:');
  console.log(`  Overall: ${summary.averageScores.overall.toFixed(3)}`);
  console.log(
    `  Contextual Relevance: ${summary.averageScores.contextualRelevance.toFixed(3)}`,
  );
  console.log(
    `  Faithfulness: ${summary.averageScores.faithfulness.toFixed(3)}`,
  );
  console.log(
    `  Answer Relevance: ${summary.averageScores.answerRelevance.toFixed(3)}`,
  );
  console.log('\nPass Rates:');
  console.log(
    `  Contextual Relevance: ${(summary.passRates.contextualRelevance * 100).toFixed(1)}%`,
  );
  console.log(
    `  Faithfulness: ${(summary.passRates.faithfulness * 100).toFixed(1)}%`,
  );
  console.log(
    `  Answer Relevance: ${(summary.passRates.answerRelevance * 100).toFixed(1)}%`,
  );

  // Show detailed results for failed tests
  const failedTests = evaluationResults.filter(
    (result) =>
      !result.metrics.contextualRelevance.passed ||
      !result.metrics.faithfulness.passed ||
      !result.metrics.answerRelevance.passed,
  );

  if (failedTests.length > 0) {
    console.log(
      `\n❌ ${failedTests.length} test(s) failed to meet thresholds:`,
    );
    failedTests.forEach((result) => {
      console.log(`\n  Test: ${result.testCaseId}`);
      console.log(`  Query: ${result.query}`);
      console.log(`  Overall Score: ${result.overallScore.toFixed(3)}`);
      console.log(`  Failed Metrics:`);
      if (!result.metrics.contextualRelevance.passed) {
        console.log(
          `    - Contextual Relevance: ${result.metrics.contextualRelevance.score.toFixed(3)} (threshold: ${result.metrics.contextualRelevance.threshold})`,
        );
      }
      if (!result.metrics.faithfulness.passed) {
        console.log(
          `    - Faithfulness: ${result.metrics.faithfulness.score.toFixed(3)} (threshold: ${result.metrics.faithfulness.threshold})`,
        );
      }
      if (!result.metrics.answerRelevance.passed) {
        console.log(
          `    - Answer Relevance: ${result.metrics.answerRelevance.score.toFixed(3)} (threshold: ${result.metrics.answerRelevance.threshold})`,
        );
      }
    });
  }

  // Save detailed results to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportData = {
    timestamp,
    config: {
      maxTestCases,
      categories,
      difficulties,
      thresholds: {
        contextualRelevance: contextualRelevanceThreshold,
        faithfulness: faithfulnessThreshold,
        answerRelevance: answerRelevanceThreshold,
      },
      model,
    },
    summary,
    results: evaluationResults,
  };

  try {
    const reportPath = join(process.cwd(), 'rag-evaluation-report.json');
    await writeFile(reportPath, JSON.stringify(reportData, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.warn('Could not save report file:', error);
  }

  console.log('\n✅ RAG Evaluation completed!');

  return {
    summary,
    results: evaluationResults,
    report: reportData,
  };
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  const config: EvaluationConfig = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-tests':
        config.maxTestCases = Number.parseInt(args[++i]);
        break;
      case '--categories':
        config.categories = args[++i].split(',');
        break;
      case '--difficulties':
        config.difficulties = args[++i].split(',') as any;
        break;
      case '--model':
        config.model = args[++i];
        break;
      case '--help':
        console.log(`
RAG Evaluation Script

Usage: bun run scripts/run-rag-evaluation.ts [options]

Options:
  --max-tests <number>     Maximum number of test cases to run (default: 10)
  --categories <list>      Comma-separated list of categories to test
  --difficulties <list>   Comma-separated list of difficulties (easy,medium,hard)
  --model <string>        AI model to use for evaluation (default: gemini-1.5-flash)
  --help                  Show this help message

Examples:
  bun run scripts/run-rag-evaluation.ts --max-tests 5
  bun run scripts/run-rag-evaluation.ts --categories factual,procedural --difficulties easy,medium
  bun run scripts/run-rag-evaluation.ts --model gemini-2.0-flash
        `);
        process.exit(0);
    }
  }

  try {
    await runRAGEvaluation(config);
    process.exit(0);
  } catch (error) {
    console.error('❌ RAG Evaluation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runRAGEvaluation };
