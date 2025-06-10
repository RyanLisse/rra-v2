#!/usr/bin/env tsx

/**
 * Process All PDFs Script
 *
 * Main entry point for processing all PDFs in the data/pdf directory.
 * Includes performance monitoring and optimization.
 */

import { BatchPDFProcessor } from './batch-pdf-processor';
import { performanceEnhancer } from '@/lib/optimization/performance-enhancer';
import { performanceOptimizer } from '@/lib/monitoring/performance-optimizer';

async function main(): Promise<void> {
  console.log('🚀 OPTIMIZED PDF PROCESSING PIPELINE');
  console.log('====================================\n');

  // Initialize performance monitoring
  const globalTracker = performanceOptimizer.startOperation(
    'full-pdf-processing-pipeline',
  );

  try {
    // Step 1: Optimize system performance
    console.log('🔧 Optimizing system performance...');
    const dbOptimization = await performanceEnhancer.optimizeDatabase();
    console.log(
      `✅ Database optimized: ${dbOptimization.optimizations.length} improvements`,
    );
    console.log();

    // Step 2: Initialize batch processor
    console.log('🏭 Initializing batch processor...');
    const processor = new BatchPDFProcessor();

    // Step 3: Process all PDFs with optimized settings
    console.log('📄 Starting optimized batch processing...\n');

    const processingOptions = {
      concurrency: Math.min(4, require('node:os').cpus().length), // Optimize for CPU cores
      skipExisting: true,
      imageFormat: 'png' as const,
      imageQuality: 2.0, // High quality for better OCR
      generateEmbeddings: true,
      outputBaseDir: `${process.cwd()}/data/processed-pdfs`,
    };

    const summary = await processor.processAllPDFs(processingOptions);

    // Step 4: Display comprehensive results
    console.log('\n🎯 FINAL RESULTS');
    console.log('================\n');

    const performanceMetrics = performanceEnhancer.getMetrics();
    const systemMetrics = performanceOptimizer.getAnalytics();

    console.log('📊 PROCESSING SUMMARY:');
    console.log(
      `   📄 Files processed: ${summary.successfulFiles}/${summary.totalFiles}`,
    );
    console.log(`   📑 Total pages: ${summary.totalPages}`);
    console.log(`   🖼️ Images generated: ${summary.totalImages}`);
    console.log(`   📝 Text chunks created: ${summary.totalChunks}`);
    console.log(
      `   ⏱️ Total time: ${(summary.totalProcessingTime / 1000).toFixed(1)}s\n`,
    );

    console.log('🔧 PERFORMANCE METRICS:');
    console.log(`   💾 Cache hit rate: ${performanceMetrics.cache.hitRate}%`);
    console.log(
      `   🧠 Memory optimizations: ${performanceMetrics.memory.gcTriggers} GC triggers`,
    );
    console.log(
      `   ⚡ Average operation time: ${systemMetrics.averageOperationTime}ms`,
    );
    console.log(
      `   🏆 Performance score: ${systemMetrics.performanceScore}/100\n`,
    );

    console.log('📁 OUTPUT STRUCTURE:');
    console.log('   data/processed-pdfs/');
    console.log('   ├── [document-name]/');
    console.log('   │   ├── images/          # PNG images for each page');
    console.log('   │   └── data/            # Extracted text and metadata');
    console.log('   └── batch-processing-report.json\n');

    if (summary.failedFiles > 0) {
      console.log('⚠️ WARNINGS:');
      console.log(`   ${summary.failedFiles} files failed to process`);
      console.log('   Check the batch-processing-report.json for details\n');
    }

    // Step 5: Performance cleanup
    performanceEnhancer.resetMetrics();
    globalTracker.end();

    console.log('✅ PDF processing pipeline completed successfully!');
    console.log('🎉 All documents are now ready for multimodal RAG queries!');
  } catch (error) {
    globalTracker.end();
    console.error('❌ PDF processing pipeline failed:', error);

    // Display helpful troubleshooting information
    console.log('\n🔍 TROUBLESHOOTING:');
    console.log('1. Ensure all PDF files are readable and not corrupted');
    console.log('2. Check available disk space for image output');
    console.log('3. Verify system has sufficient memory for processing');
    console.log('4. Check database connectivity for document storage');

    process.exit(1);
  }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️ Gracefully shutting down...');
  performanceEnhancer.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ Gracefully shutting down...');
  performanceEnhancer.shutdown();
  process.exit(0);
});

// Run the main function
main().catch(console.error);
