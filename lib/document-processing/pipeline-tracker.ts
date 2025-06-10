/**
 * Pipeline Status Tracker
 *
 * Provides comprehensive tracking of document processing through the entire pipeline.
 * Tracks timing, progress, errors, and metrics at each stage.
 */

import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { features } from '@/lib/config/feature-flags';

export interface PipelineStage {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface PipelineMetrics {
  totalDuration: number;
  stageMetrics: Record<
    string,
    {
      avgDuration: number;
      successRate: number;
      errorCount: number;
    }
  >;
  throughput: number;
}

export class PipelineTracker {
  private documentId: string;
  private stages: Map<string, PipelineStage>;
  private startTime: Date;

  constructor(documentId: string) {
    this.documentId = documentId;
    this.stages = new Map();
    this.startTime = new Date();
    this.initializeStages();
  }

  /**
   * Initialize all pipeline stages
   */
  private initializeStages() {
    const stageNames = [
      'upload',
      'text_extraction',
      'chunking',
      'pdf_conversion',
      'ade_processing',
      'embedding_generation',
      'multimodal_embedding',
      'indexing',
      'completion',
    ];

    stageNames.forEach((name) => {
      this.stages.set(name, {
        name,
        status: 'pending',
      });
    });

    // Mark stages as skipped based on feature flags
    if (!features.shouldConvertPdfToImages()) {
      this.markStageSkipped('pdf_conversion');
    }
    if (!features.shouldGenerateMultimodalEmbeddings()) {
      this.markStageSkipped('multimodal_embedding');
    }
    if (!features.shouldUseRealAde()) {
      // ADE still runs but in simulation mode
      this.updateStageMetadata('ade_processing', { mode: 'simulation' });
    }
  }

  /**
   * Start a pipeline stage
   */
  async startStage(
    stageName: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const stage = this.stages.get(stageName);
    if (!stage) {
      console.warn(`[Pipeline] Unknown stage: ${stageName}`);
      return;
    }

    stage.status = 'in_progress';
    stage.startedAt = new Date();
    stage.metadata = { ...stage.metadata, ...metadata };

    await this.updateDocumentStatus(this.mapStageToDocumentStatus(stageName));

    if (features.isDetailedLoggingEnabled()) {
      console.log(
        `[Pipeline] Started stage '${stageName}' for document ${this.documentId}`,
      );
    }

    await this.logProgress(stageName, 'started', metadata);
  }

  /**
   * Complete a pipeline stage
   */
  async completeStage(
    stageName: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const stage = this.stages.get(stageName);
    if (!stage || stage.status !== 'in_progress') {
      console.warn(
        `[Pipeline] Cannot complete stage '${stageName}' - not in progress`,
      );
      return;
    }

    stage.status = 'completed';
    stage.completedAt = new Date();
    stage.duration = stage.startedAt
      ? stage.completedAt.getTime() - stage.startedAt.getTime()
      : 0;
    stage.metadata = { ...stage.metadata, ...metadata };

    if (features.isDetailedLoggingEnabled()) {
      console.log(
        `[Pipeline] Completed stage '${stageName}' for document ${this.documentId} in ${stage.duration}ms`,
      );
    }

    await this.logProgress(stageName, 'completed', metadata);
    await this.checkPipelineCompletion();
  }

  /**
   * Mark a stage as failed
   */
  async failStage(stageName: string, error: Error | string): Promise<void> {
    const stage = this.stages.get(stageName);
    if (!stage) {
      console.warn(`[Pipeline] Unknown stage: ${stageName}`);
      return;
    }

    stage.status = 'failed';
    stage.completedAt = new Date();
    stage.duration = stage.startedAt
      ? stage.completedAt.getTime() - stage.startedAt.getTime()
      : 0;
    stage.error = error instanceof Error ? error.message : error;

    await this.updateDocumentStatus('error');

    console.error(
      `[Pipeline] Failed stage '${stageName}' for document ${this.documentId}:`,
      stage.error,
    );

    await this.logProgress(stageName, 'failed', { error: stage.error });
  }

  /**
   * Mark a stage as skipped
   */
  private markStageSkipped(stageName: string): void {
    const stage = this.stages.get(stageName);
    if (stage) {
      stage.status = 'skipped';
    }
  }

  /**
   * Update stage metadata
   */
  private updateStageMetadata(
    stageName: string,
    metadata: Record<string, any>,
  ): void {
    const stage = this.stages.get(stageName);
    if (stage) {
      stage.metadata = { ...stage.metadata, ...metadata };
    }
  }

  /**
   * Get current pipeline status
   */
  getStatus(): {
    documentId: string;
    overallStatus: string;
    progress: number;
    stages: PipelineStage[];
    duration: number;
  } {
    const stagesArray = Array.from(this.stages.values());
    const totalStages = stagesArray.filter(
      (s) => s.status !== 'skipped',
    ).length;
    const completedStages = stagesArray.filter(
      (s) => s.status === 'completed',
    ).length;
    const failedStages = stagesArray.filter(
      (s) => s.status === 'failed',
    ).length;

    let overallStatus = 'processing';
    if (failedStages > 0) {
      overallStatus = 'failed';
    } else if (completedStages === totalStages) {
      overallStatus = 'completed';
    }

    const progress =
      totalStages > 0 ? (completedStages / totalStages) * 100 : 0;
    const duration = new Date().getTime() - this.startTime.getTime();

    return {
      documentId: this.documentId,
      overallStatus,
      progress: Math.round(progress),
      stages: stagesArray,
      duration,
    };
  }

  /**
   * Map pipeline stage to document status
   */
  private mapStageToDocumentStatus(
    stageName: string,
  ):
    | 'uploaded'
    | 'processing'
    | 'text_extracted'
    | 'images_extracted'
    | 'ade_processing'
    | 'ade_processed'
    | 'chunked'
    | 'embedded'
    | 'processed'
    | 'error'
    | 'error_image_extraction'
    | 'error_ade_processing' {
    const mapping: Record<
      string,
      | 'uploaded'
      | 'processing'
      | 'text_extracted'
      | 'images_extracted'
      | 'ade_processing'
      | 'ade_processed'
      | 'chunked'
      | 'embedded'
      | 'processed'
      | 'error'
      | 'error_image_extraction'
      | 'error_ade_processing'
    > = {
      upload: 'uploaded',
      text_extraction: 'text_extracted',
      chunking: 'chunked',
      pdf_conversion: 'images_extracted',
      ade_processing: 'ade_processed',
      embedding_generation: 'embedded',
      multimodal_embedding: 'embedded',
      completion: 'processed',
    };

    return mapping[stageName] || 'processing';
  }

  /**
   * Update document status in database
   */
  private async updateDocumentStatus(
    status:
      | 'uploaded'
      | 'processing'
      | 'text_extracted'
      | 'images_extracted'
      | 'ade_processing'
      | 'ade_processed'
      | 'chunked'
      | 'embedded'
      | 'processed'
      | 'error'
      | 'error_image_extraction'
      | 'error_ade_processing',
  ): Promise<void> {
    try {
      await db
        .update(ragDocument)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(ragDocument.id, this.documentId));
    } catch (error) {
      console.error('[Pipeline] Failed to update document status:', error);
    }
  }

  /**
   * Log progress to database
   */
  private async logProgress(
    stageName: string,
    event: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    if (!features.shouldCollectMetrics()) {
      return;
    }

    // This would insert into a processing_log table when implemented
    // await db.insert(documentProcessingLog).values({
    //   documentId: this.documentId,
    //   stage: stageName,
    //   event,
    //   metadata,
    //   timestamp: new Date()
    // });
  }

  /**
   * Check if pipeline is complete
   */
  private async checkPipelineCompletion(): Promise<void> {
    const status = this.getStatus();

    if (status.overallStatus === 'completed') {
      await this.updateDocumentStatus('processed');

      if (features.isDetailedLoggingEnabled()) {
        console.log(
          `[Pipeline] Completed processing document ${this.documentId} in ${status.duration}ms`,
        );
      }

      // Emit completion metrics
      if (features.shouldCollectMetrics()) {
        await this.emitCompletionMetrics(status);
      }
    }
  }

  /**
   * Emit completion metrics
   */
  private async emitCompletionMetrics(status: any): Promise<void> {
    // This would send metrics to monitoring service
    const metrics = {
      documentId: this.documentId,
      totalDuration: status.duration,
      stageCount: status.stages.length,
      completedStages: status.stages.filter(
        (s: PipelineStage) => s.status === 'completed',
      ).length,
      skippedStages: status.stages.filter(
        (s: PipelineStage) => s.status === 'skipped',
      ).length,
      timestamp: new Date(),
    };

    console.log('[Pipeline] Completion metrics:', metrics);
  }

  /**
   * Create tracker instance for a document
   */
  static async create(documentId: string): Promise<PipelineTracker> {
    const tracker = new PipelineTracker(documentId);
    await tracker.startStage('upload', { source: 'api' });
    await tracker.completeStage('upload');
    return tracker;
  }

  /**
   * Get pipeline metrics across all documents
   */
  static async getMetrics(timeRange?: {
    start: Date;
    end: Date;
  }): Promise<PipelineMetrics> {
    // This would query the processing_log table for metrics
    // For now, return mock metrics
    return {
      totalDuration: 45000,
      stageMetrics: {
        text_extraction: {
          avgDuration: 5000,
          successRate: 0.98,
          errorCount: 2,
        },
        pdf_conversion: {
          avgDuration: 15000,
          successRate: 0.95,
          errorCount: 5,
        },
        ade_processing: {
          avgDuration: 10000,
          successRate: 0.99,
          errorCount: 1,
        },
        embedding_generation: {
          avgDuration: 8000,
          successRate: 0.97,
          errorCount: 3,
        },
      },
      throughput: 120, // documents per hour
    };
  }
}
