#!/usr/bin/env bun

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { parseArgs } from 'util';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface PerformanceResults {
  metrics: PerformanceMetric[];
  summary?: string;
  details?: Record<string, any>;
}

interface ComparisonResult {
  metric: string;
  baseline: number;
  current: number;
  difference: number;
  percentageChange: number;
  regression: boolean;
}

const REGRESSION_THRESHOLDS = {
  // API response times (milliseconds)
  'api.upload': 100,
  'api.search': 50,
  'api.chat': 200,

  // Build metrics
  'build.time': 10000, // 10 seconds
  'build.size': 1024 * 1024, // 1MB

  // Memory usage (MB)
  'memory.initial': 50,
  'memory.loaded': 100,

  // Default threshold
  default: 0.1, // 10% regression
};

async function readPerformanceResults(
  path: string,
): Promise<PerformanceResults> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

function compareMetrics(
  baseline: PerformanceMetric[],
  current: PerformanceMetric[],
): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  // Create a map of baseline metrics
  const baselineMap = new Map<string, PerformanceMetric>();
  baseline.forEach((metric) => {
    baselineMap.set(metric.name, metric);
  });

  // Compare each current metric with baseline
  current.forEach((currentMetric) => {
    const baselineMetric = baselineMap.get(currentMetric.name);

    if (baselineMetric) {
      const difference = currentMetric.value - baselineMetric.value;
      const percentageChange = (difference / baselineMetric.value) * 100;

      // Determine if this is a regression
      const threshold =
        REGRESSION_THRESHOLDS[currentMetric.name] ||
        REGRESSION_THRESHOLDS.default;
      let regression = false;

      if (typeof threshold === 'number' && threshold > 1) {
        // Absolute threshold
        regression = difference > threshold;
      } else {
        // Percentage threshold
        regression = percentageChange > threshold * 100;
      }

      results.push({
        metric: currentMetric.name,
        baseline: baselineMetric.value,
        current: currentMetric.value,
        difference,
        percentageChange,
        regression,
      });
    }
  });

  return results;
}

function generateSummary(comparisons: ComparisonResult[]): string {
  const regressions = comparisons.filter((c) => c.regression);
  const improvements = comparisons.filter((c) => c.percentageChange < -5);

  let summary = '';

  if (regressions.length === 0) {
    summary = '✅ No performance regressions detected';
  } else {
    summary = `⚠️ ${regressions.length} performance regression${regressions.length > 1 ? 's' : ''} detected:\n`;
    regressions.forEach((r) => {
      summary += `- ${r.metric}: ${r.percentageChange.toFixed(1)}% slower (${r.current} vs ${r.baseline})\n`;
    });
  }

  if (improvements.length > 0) {
    summary += `\n✨ ${improvements.length} performance improvement${improvements.length > 1 ? 's' : ''}:\n`;
    improvements.forEach((i) => {
      summary += `- ${i.metric}: ${Math.abs(i.percentageChange).toFixed(1)}% faster\n`;
    });
  }

  return summary;
}

function generateDetailedReport(
  comparisons: ComparisonResult[],
): Record<string, any> {
  const report: Record<string, any> = {
    timestamp: new Date().toISOString(),
    totalMetrics: comparisons.length,
    regressions: comparisons.filter((c) => c.regression).length,
    improvements: comparisons.filter((c) => c.percentageChange < -5).length,
    stable: comparisons.filter((c) => !c.regression && c.percentageChange >= -5)
      .length,
    metrics: {},
  };

  // Group metrics by category
  comparisons.forEach((comparison) => {
    const [category, ...metricParts] = comparison.metric.split('.');
    const metricName = metricParts.join('.');

    if (!report.metrics[category]) {
      report.metrics[category] = {};
    }

    report.metrics[category][metricName] = {
      baseline: comparison.baseline,
      current: comparison.current,
      change: `${comparison.percentageChange > 0 ? '+' : ''}${comparison.percentageChange.toFixed(1)}%`,
      regression: comparison.regression,
    };
  });

  return report;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      current: {
        type: 'string',
        short: 'c',
        default: 'performance-test-results.json',
      },
      baseline: {
        type: 'string',
        short: 'b',
        default: '.performance-baseline.json',
      },
      output: {
        type: 'string',
        short: 'o',
        default: 'performance-analysis.json',
      },
      'update-baseline': {
        type: 'boolean',
        default: false,
      },
    },
  });

  try {
    // Read current results
    const currentResults = await readPerformanceResults(values.current!);

    // Try to read baseline
    let baselineResults: PerformanceResults | null = null;
    try {
      baselineResults = await readPerformanceResults(values.baseline!);
    } catch (error) {
      console.log('No baseline found, creating new baseline');
    }

    let analysis: any;

    if (baselineResults) {
      // Compare with baseline
      const comparisons = compareMetrics(
        baselineResults.metrics,
        currentResults.metrics,
      );

      const summary = generateSummary(comparisons);
      const details = generateDetailedReport(comparisons);

      analysis = {
        summary,
        details,
        comparisons,
        hasRegressions: comparisons.some((c) => c.regression),
      };

      console.log(summary);
    } else {
      // No baseline, just return current results
      analysis = {
        summary: 'No baseline available for comparison',
        details: {
          currentMetrics: currentResults.metrics,
        },
        hasRegressions: false,
      };
    }

    // Write analysis results
    await writeFile(values.output!, JSON.stringify(analysis, null, 2));

    // Update baseline if requested and no regressions
    if (values['update-baseline'] && !analysis.hasRegressions) {
      await writeFile(
        values.baseline!,
        JSON.stringify(currentResults, null, 2),
      );
      console.log('✅ Baseline updated');
    }

    // Exit with error code if regressions detected
    if (analysis.hasRegressions) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error analyzing performance:', error);
    process.exit(1);
  }
}

main();
