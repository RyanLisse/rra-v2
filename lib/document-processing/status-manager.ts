import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type DocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'text_extracted'
  | 'chunked'
  | 'embedded'
  | 'processed'
  | 'error'
  | 'retrying';

export interface StatusUpdate {
  status: DocumentStatus;
  progress?: number; // 0-100
  message?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface ProcessingStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export class DocumentStatusManager {
  private documentId: string;
  private steps: Map<string, ProcessingStep> = new Map();

  constructor(documentId: string) {
    this.documentId = documentId;
    this.initializeSteps();
  }

  /**
   * Initialize processing steps
   */
  private initializeSteps() {
    const stepNames = [
      'text_extraction',
      'quality_assessment',
      'chunking',
      'embedding',
      'indexing',
    ];

    stepNames.forEach((name) => {
      this.steps.set(name, {
        name,
        status: 'pending',
        progress: 0,
      });
    });
  }

  /**
   * Update document status with progress tracking
   */
  async updateStatus(update: StatusUpdate): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // Update main document status
        await tx
          .update(ragDocument)
          .set({
            status: update.status === 'retrying' ? 'processing' : update.status,
            updatedAt: new Date(),
          })
          .where(eq(ragDocument.id, this.documentId));

        // Store detailed progress in metadata if provided
        if (update.progress !== undefined || update.metadata) {
          // In a production system, you might want a separate processing_status table
          // For now, we'll use the existing structure
        }
      });

      // Log status change for monitoring
      console.log(
        `Document ${this.documentId} status updated to: ${update.status}`,
        {
          progress: update.progress,
          message: update.message,
          error: update.error,
        },
      );
    } catch (error) {
      console.error(
        `Failed to update status for document ${this.documentId}:`,
        error,
      );
      throw new Error(
        `Status update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Start a processing step
   */
  async startStep(
    stepName: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`Unknown processing step: ${stepName}`);
    }

    step.status = 'running';
    step.startTime = new Date();
    step.progress = 0;
    step.metadata = metadata;

    await this.updateStatus({
      status: 'processing',
      progress: this.calculateOverallProgress(),
      message: `Starting ${stepName}`,
      metadata: { currentStep: stepName },
    });
  }

  /**
   * Update step progress
   */
  async updateStepProgress(
    stepName: string,
    progress: number,
    message?: string,
  ): Promise<void> {
    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`Unknown processing step: ${stepName}`);
    }

    step.progress = Math.max(0, Math.min(100, progress));

    await this.updateStatus({
      status: 'processing',
      progress: this.calculateOverallProgress(),
      message: message || `${stepName}: ${progress}%`,
      metadata: { currentStep: stepName, stepProgress: progress },
    });
  }

  /**
   * Complete a processing step
   */
  async completeStep(
    stepName: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`Unknown processing step: ${stepName}`);
    }

    step.status = 'completed';
    step.endTime = new Date();
    step.progress = 100;
    if (metadata) {
      step.metadata = { ...step.metadata, ...metadata };
    }

    // Determine next status based on completed steps
    const newStatus = this.determineStatusFromSteps();

    await this.updateStatus({
      status: newStatus,
      progress: this.calculateOverallProgress(),
      message: `Completed ${stepName}`,
      metadata: { completedStep: stepName },
    });
  }

  /**
   * Fail a processing step
   */
  async failStep(
    stepName: string,
    error: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`Unknown processing step: ${stepName}`);
    }

    step.status = 'failed';
    step.endTime = new Date();
    step.error = error;
    if (metadata) {
      step.metadata = { ...step.metadata, ...metadata };
    }

    await this.updateStatus({
      status: 'error',
      progress: this.calculateOverallProgress(),
      error: `${stepName} failed: ${error}`,
      metadata: { failedStep: stepName, error },
    });
  }

  /**
   * Retry failed processing from a specific step
   */
  async retryFromStep(stepName: string): Promise<void> {
    const step = this.steps.get(stepName);
    if (!step) {
      throw new Error(`Unknown processing step: ${stepName}`);
    }

    // Reset this step and all subsequent steps
    const stepNames = Array.from(this.steps.keys());
    const startIndex = stepNames.indexOf(stepName);

    for (let i = startIndex; i < stepNames.length; i++) {
      const resetStep = this.steps.get(stepNames[i]);
      if (resetStep) {
        resetStep.status = 'pending';
        resetStep.progress = 0;
        resetStep.error = undefined;
        resetStep.startTime = undefined;
        resetStep.endTime = undefined;
      }
    }

    await this.updateStatus({
      status: 'retrying',
      progress: this.calculateOverallProgress(),
      message: `Retrying from ${stepName}`,
      metadata: { retryStep: stepName },
    });
  }

  /**
   * Calculate overall processing progress
   */
  private calculateOverallProgress(): number {
    const steps = Array.from(this.steps.values());
    const totalProgress = steps.reduce(
      (sum, step) => sum + (step.progress || 0),
      0,
    );
    return Math.round(totalProgress / steps.length);
  }

  /**
   * Determine document status based on step completion
   */
  private determineStatusFromSteps(): DocumentStatus {
    const steps = Array.from(this.steps.values());

    // Check if any step failed
    if (steps.some((step) => step.status === 'failed')) {
      return 'error';
    }

    // Check completion status
    const extractionStep = this.steps.get('text_extraction');
    const chunkingStep = this.steps.get('chunking');
    const embeddingStep = this.steps.get('embedding');

    if (
      extractionStep?.status === 'completed' &&
      chunkingStep?.status === 'pending'
    ) {
      return 'text_extracted';
    }

    if (
      chunkingStep?.status === 'completed' &&
      embeddingStep?.status === 'pending'
    ) {
      return 'chunked';
    }

    if (embeddingStep?.status === 'completed') {
      return steps.every((step) => step.status === 'completed')
        ? 'processed'
        : 'embedded';
    }

    return 'processing';
  }

  /**
   * Get processing summary
   */
  getProcessingSummary(): {
    overallProgress: number;
    currentStep?: string;
    steps: Array<ProcessingStep & { duration?: number }>;
    estimatedTimeRemaining?: number;
  } {
    const steps = Array.from(this.steps.values()).map((step) => {
      const duration =
        step.startTime && step.endTime
          ? step.endTime.getTime() - step.startTime.getTime()
          : undefined;

      return { ...step, duration };
    });

    const runningStep = steps.find((step) => step.status === 'running');
    const completedSteps = steps.filter((step) => step.status === 'completed');

    // Estimate remaining time based on completed steps
    let estimatedTimeRemaining: number | undefined;
    if (completedSteps.length > 0 && runningStep) {
      const avgDuration =
        completedSteps.reduce((sum, step) => sum + (step.duration || 0), 0) /
        completedSteps.length;
      const remainingSteps = steps.filter(
        (step) => step.status === 'pending' || step.status === 'running',
      ).length;
      estimatedTimeRemaining = avgDuration * remainingSteps;
    }

    return {
      overallProgress: this.calculateOverallProgress(),
      currentStep: runningStep?.name,
      steps,
      estimatedTimeRemaining,
    };
  }

  /**
   * Create status manager for document
   */
  static async create(documentId: string): Promise<DocumentStatusManager> {
    // Verify document exists
    const document = await db.query.ragDocument.findFirst({
      where: eq(ragDocument.id, documentId),
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    return new DocumentStatusManager(documentId);
  }

  /**
   * Get processing statistics for monitoring
   */
  static async getProcessingStats(): Promise<{
    totalDocuments: number;
    processingDocuments: number;
    completedDocuments: number;
    errorDocuments: number;
    averageProcessingTime?: number;
  }> {
    try {
      // This would be more efficient with proper aggregation queries
      // For now, using a simplified approach
      const allDocuments = await db.query.ragDocument.findMany({
        columns: {
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const stats = {
        totalDocuments: allDocuments.length,
        processingDocuments: allDocuments.filter((doc) =>
          ['processing', 'retrying'].includes(doc.status),
        ).length,
        completedDocuments: allDocuments.filter(
          (doc) => doc.status === 'processed',
        ).length,
        errorDocuments: allDocuments.filter((doc) => doc.status === 'error')
          .length,
      };

      // Calculate average processing time for completed documents
      const completedDocs = allDocuments.filter(
        (doc) => doc.status === 'processed',
      );
      if (completedDocs.length > 0) {
        const totalTime = completedDocs.reduce(
          (sum, doc) =>
            sum + (doc.updatedAt.getTime() - doc.createdAt.getTime()),
          0,
        );
        (stats as any).averageProcessingTime = totalTime / completedDocs.length;
      }

      return stats;
    } catch (error) {
      console.error('Failed to get processing stats:', error);
      throw error;
    }
  }
}
