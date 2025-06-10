#!/usr/bin/env tsx

/**
 * Performance Audit Script
 *
 * Audits the codebase for performance bottlenecks and provides optimization recommendations.
 * Run with: npx tsx scripts/performance-audit.ts
 */

import { performanceOptimizer } from '@/lib/monitoring/performance-optimizer';
import fs from 'node:fs/promises';
import path from 'node:path';

interface FileAnalysis {
  path: string;
  lines: number;
  size: number;
  complexity: number;
  issues: string[];
}

interface PerformanceAuditReport {
  timestamp: string;
  codebaseAnalysis: {
    largeFiles: FileAnalysis[];
    totalFiles: number;
    totalLines: number;
    averageFileSize: number;
  };
  databaseAnalysis: {
    connectionCount: number;
    cacheHitRatio: number;
    slowQueries: Array<{ query: string; duration: number; calls: number }>;
    indexUsage: Array<{ table: string; index: string; usage: number }>;
  };
  systemResources: {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    uptime: number;
  };
  recommendations: string[];
  performanceScore: number;
}

/**
 * Analyze file sizes and complexity
 */
async function analyzeCodebase(): Promise<
  PerformanceAuditReport['codebaseAnalysis']
> {
  const files: FileAnalysis[] = [];

  const analyzeDirectory = async (dir: string): Promise<void> => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          await analyzeDirectory(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
        ) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n').length;
            const size = content.length;
            const issues: string[] = [];

            // Calculate complexity score (simple heuristic)
            let complexity = 0;

            // Function complexity
            const functionMatches = content.match(/function|=>/g);
            complexity += (functionMatches?.length || 0) * 2;

            // Loop complexity
            const loopMatches = content.match(/for|while|forEach/g);
            complexity += (loopMatches?.length || 0) * 3;

            // Conditional complexity
            const conditionalMatches = content.match(/if|switch|case|\?/g);
            complexity += (conditionalMatches?.length || 0) * 1;

            // Database query complexity
            const dbMatches = content.match(
              /\.select|\.insert|\.update|\.delete/g,
            );
            complexity += (dbMatches?.length || 0) * 5;

            // Identify potential issues
            if (lines > 500) {
              issues.push(`Large file: ${lines} lines (recommend splitting)`);
            }

            if (
              content?.includes('any') &&
              (content.match(/:\s*any/g)?.length ?? 0) > 5
            ) {
              issues.push(
                'Multiple any types detected (reduce for better type safety)',
              );
            }

            if (
              content.includes('console.log') ||
              content.includes('console.error')
            ) {
              issues.push('Console statements found (use proper logging)');
            }

            if (
              content.includes('setTimeout') ||
              content.includes('setInterval')
            ) {
              issues.push('Timer usage detected (ensure proper cleanup)');
            }

            if (content.match(/for.*await|forEach.*await/g)) {
              issues.push(
                'Potential sequential async operations (consider Promise.all)',
              );
            }

            if (
              content.includes('JSON.parse') &&
              !content.includes('try') &&
              !content.includes('catch')
            ) {
              issues.push('Unsafe JSON.parse usage (add error handling)');
            }

            files.push({
              path: fullPath.replace(process.cwd(), ''),
              lines,
              size,
              complexity,
              issues,
            });
          } catch (error) {
            console.warn(`Failed to analyze file ${fullPath}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${dir}:`, error);
    }
  };

  await analyzeDirectory('lib');
  await analyzeDirectory('app');
  await analyzeDirectory('components');

  // Sort by size and complexity
  files.sort((a, b) => b.lines - a.lines);

  const totalLines = files.reduce((sum, f) => sum + f.lines, 0);
  const averageFileSize = files.length > 0 ? totalLines / files.length : 0;

  return {
    largeFiles: files.slice(0, 20), // Top 20 largest files
    totalFiles: files.length,
    totalLines,
    averageFileSize: Math.round(averageFileSize),
  };
}

/**
 * Run comprehensive performance audit
 */
async function runPerformanceAudit(): Promise<PerformanceAuditReport> {
  console.log('🔍 Starting performance audit...\n');

  // Start performance tracking
  const tracker = performanceOptimizer.startOperation('performance-audit');

  try {
    // Analyze codebase structure
    console.log('📁 Analyzing codebase structure...');
    const codebaseAnalysis = await analyzeCodebase();

    // Analyze database performance
    console.log('🗃️ Analyzing database performance...');
    const dbStats = await performanceOptimizer.getDatabasePerformanceStats();
    const queryOptimization =
      await performanceOptimizer.optimizeDatabaseQueries();

    // Get system resources
    console.log('💻 Analyzing system resources...');
    const systemResources = performanceOptimizer.getSystemResourceUsage();

    // Generate recommendations
    const recommendations: string[] = [];

    // Codebase recommendations
    const largeFiles = codebaseAnalysis.largeFiles.filter((f) => f.lines > 500);
    if (largeFiles.length > 0) {
      recommendations.push(
        `Split ${largeFiles.length} large files (>500 lines) into smaller modules`,
      );
    }

    const complexFiles = codebaseAnalysis.largeFiles.filter(
      (f) => f.complexity > 100,
    );
    if (complexFiles.length > 0) {
      recommendations.push(
        `Reduce complexity in ${complexFiles.length} highly complex files`,
      );
    }

    // Database recommendations
    if (dbStats.cacheHitRatio < 95) {
      recommendations.push(
        `Improve database cache hit ratio (currently ${dbStats.cacheHitRatio}%)`,
      );
    }

    if (queryOptimization.slowQueries.length > 0) {
      recommendations.push(
        `Optimize ${queryOptimization.slowQueries.length} slow database queries`,
      );
    }

    // Memory recommendations
    const memoryUsageMB = systemResources.memory.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 500) {
      recommendations.push(
        `High memory usage (${Math.round(memoryUsageMB)}MB) - consider memory optimization`,
      );
    }

    // Add query-specific recommendations
    recommendations.push(...queryOptimization.recommendations);

    // Calculate overall performance score
    let performanceScore = 100;

    // Deduct points for large files
    performanceScore -= Math.min(20, largeFiles.length * 2);

    // Deduct points for complexity
    performanceScore -= Math.min(15, complexFiles.length);

    // Deduct points for database issues
    if (dbStats.cacheHitRatio < 95) {
      performanceScore -= 10;
    }

    if (queryOptimization.slowQueries.length > 0) {
      performanceScore -= Math.min(
        15,
        queryOptimization.slowQueries.length * 2,
      );
    }

    // Deduct points for memory usage
    if (memoryUsageMB > 500) {
      performanceScore -= 10;
    }

    performanceScore = Math.max(0, performanceScore);

    const report: PerformanceAuditReport = {
      timestamp: new Date().toISOString(),
      codebaseAnalysis,
      databaseAnalysis: {
        connectionCount: dbStats.connectionCount,
        cacheHitRatio: dbStats.cacheHitRatio,
        slowQueries: queryOptimization.slowQueries,
        indexUsage: dbStats.indexUsage,
      },
      systemResources,
      recommendations,
      performanceScore,
    };

    tracker.end();

    return report;
  } catch (error) {
    tracker.end();
    throw error;
  }
}

/**
 * Display performance audit report
 */
function displayReport(report: PerformanceAuditReport): void {
  console.log('\n📊 PERFORMANCE AUDIT REPORT');
  console.log('============================\n');

  // Performance Score
  const scoreEmoji =
    report.performanceScore >= 80
      ? '🟢'
      : report.performanceScore >= 60
        ? '🟡'
        : '🔴';
  console.log(
    `${scoreEmoji} Overall Performance Score: ${report.performanceScore}/100\n`,
  );

  // Codebase Analysis
  console.log('📁 CODEBASE ANALYSIS');
  console.log('--------------------');
  console.log(`Total Files: ${report.codebaseAnalysis.totalFiles}`);
  console.log(
    `Total Lines: ${report.codebaseAnalysis.totalLines.toLocaleString()}`,
  );
  console.log(
    `Average File Size: ${report.codebaseAnalysis.averageFileSize} lines\n`,
  );

  console.log('🔍 Top 10 Largest Files:');
  report.codebaseAnalysis.largeFiles.slice(0, 10).forEach((file, index) => {
    const complexity =
      file.complexity > 100 ? '🔴' : file.complexity > 50 ? '🟡' : '🟢';
    console.log(
      `${index + 1}. ${file.path} (${file.lines} lines, complexity: ${complexity} ${file.complexity})`,
    );
    if (file.issues.length > 0) {
      file.issues.forEach((issue) => console.log(`   ⚠️  ${issue}`));
    }
  });

  // System Resources
  console.log('\n💻 SYSTEM RESOURCES');
  console.log('-------------------');
  const memoryMB = Math.round(
    report.systemResources.memory.heapUsed / 1024 / 1024,
  );
  const totalMemoryMB = Math.round(
    report.systemResources.memory.heapTotal / 1024 / 1024,
  );
  console.log(`Memory Usage: ${memoryMB}MB / ${totalMemoryMB}MB`);
  console.log(
    `Uptime: ${Math.round(report.systemResources.uptime / 60)} minutes`,
  );

  // Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('-------------------');
  if (report.recommendations.length === 0) {
    console.log('🎉 No major performance issues detected!');
  } else {
    report.recommendations.forEach((recommendation, index) => {
      console.log(`${index + 1}. ${recommendation}`);
    });
  }

  console.log(`\n📅 Report generated: ${report.timestamp}`);
}

/**
 * Save report to file
 */
async function saveReport(report: PerformanceAuditReport): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `performance-audit-${timestamp}.json`;
  const filepath = path.join('reports', filename);

  try {
    await fs.mkdir('reports', { recursive: true });
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${filepath}`);
  } catch (error) {
    console.error('Failed to save report:', error);
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const report = await runPerformanceAudit();
    displayReport(report);
    await saveReport(report);

    console.log('\n✅ Performance audit completed!');

    // Suggest next steps based on score
    if (report.performanceScore < 70) {
      console.log('\n🚨 Performance needs improvement. Consider:');
      console.log('   - Refactoring large files');
      console.log('   - Optimizing database queries');
      console.log('   - Implementing caching strategies');
      console.log('   - Running memory profiling');
    } else if (report.performanceScore < 90) {
      console.log('\n✅ Performance is good. Consider:');
      console.log('   - Fine-tuning remaining bottlenecks');
      console.log('   - Implementing performance monitoring');
      console.log('   - Regular performance reviews');
    } else {
      console.log(
        '\n🏆 Excellent performance! Keep monitoring and maintain current standards.',
      );
    }
  } catch (error) {
    console.error('❌ Performance audit failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { runPerformanceAudit, type PerformanceAuditReport };
