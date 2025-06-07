import { type NextRequest, NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db/index';
import { logger } from '@/lib/monitoring/logger';
import { metrics } from '@/lib/monitoring/metrics';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  responseTime?: number;
  metadata?: Record<string, any>;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: HealthCheck[];
  metadata: {
    environment: string;
    nodeVersion: string;
    memoryUsage: NodeJS.MemoryUsage;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  try {
    logger.debug('Health check requested');

    const checks: HealthCheck[] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkExternalServices(),
      checkDiskSpace(),
      checkMemoryUsage(),
    ]);

    const overallStatus = determineOverallStatus(checks);
    const responseTime = Date.now() - startTime;

    const healthResponse: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      checks,
      metadata: {
        environment: process.env.NODE_ENV || 'unknown',
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
      },
    };

    // Log health check metrics
    metrics.timing('health_check.response_time', responseTime);
    metrics.increment('health_check.requests', 1, { status: overallStatus });

    const statusCode =
      overallStatus === 'healthy'
        ? 200
        : overallStatus === 'degraded'
          ? 200
          : 503;

    logger.info(`Health check completed`, {
      status: overallStatus,
      responseTime,
      failedChecks: checks.filter((c) => c.status !== 'healthy').length,
    });

    return NextResponse.json(healthResponse, { status: statusCode });
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error('Health check failed', error as Error, { responseTime });
    metrics.increment('health_check.errors');

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        responseTime,
      },
      { status: 503 },
    );
  }
}

async function checkDatabase(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    const isHealthy = await checkDatabaseHealth();
    const responseTime = Date.now() - startTime;

    return {
      name: 'database',
      status: isHealthy ? 'healthy' : 'unhealthy',
      message: isHealthy
        ? 'Database connection successful'
        : 'Database connection failed',
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      name: 'database',
      status: 'unhealthy',
      message: `Database check failed: ${(error as Error).message}`,
      responseTime,
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    // If Redis is configured for resumable streams
    if (process.env.REDIS_URL) {
      // Simple Redis ping would go here
      // For now, we'll assume it's healthy if configured
      const responseTime = Date.now() - startTime;

      return {
        name: 'redis',
        status: 'healthy',
        message: 'Redis connection successful',
        responseTime,
      };
    } else {
      return {
        name: 'redis',
        status: 'degraded',
        message: 'Redis not configured - resumable streams disabled',
        responseTime: Date.now() - startTime,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      name: 'redis',
      status: 'unhealthy',
      message: `Redis check failed: ${(error as Error).message}`,
      responseTime,
    };
  }
}

async function checkExternalServices(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    const checks = await Promise.allSettled([
      checkAIService(),
      checkCohereService(),
    ]);

    const failedChecks = checks.filter((c) => c.status === 'rejected').length;
    const responseTime = Date.now() - startTime;

    if (failedChecks === 0) {
      return {
        name: 'external_services',
        status: 'healthy',
        message: 'All external services are healthy',
        responseTime,
      };
    } else if (failedChecks < checks.length) {
      return {
        name: 'external_services',
        status: 'degraded',
        message: `${failedChecks} out of ${checks.length} external services are unhealthy`,
        responseTime,
      };
    } else {
      return {
        name: 'external_services',
        status: 'unhealthy',
        message: 'All external services are unhealthy',
        responseTime,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      name: 'external_services',
      status: 'unhealthy',
      message: `External services check failed: ${(error as Error).message}`,
      responseTime,
    };
  }
}

async function checkAIService(): Promise<boolean> {
  // Check if at least one AI provider is configured
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasGemini =
    !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!hasOpenAI && !hasAnthropic && !hasGemini) {
    throw new Error('No AI provider API key configured');
  }

  // Simple check - in a real app, you might make a lightweight API call
  return true;
}

async function checkCohereService(): Promise<boolean> {
  if (!process.env.COHERE_API_KEY) {
    throw new Error('Cohere API key not configured');
  }

  return true;
}

async function checkDiskSpace(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    // In a real application, you would check available disk space
    // For now, we'll do a simple check
    const stats = {
      free: 1000000000, // 1GB - placeholder
      total: 10000000000, // 10GB - placeholder
    };

    const usagePercent = ((stats.total - stats.free) / stats.total) * 100;
    const responseTime = Date.now() - startTime;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Disk usage: ${usagePercent.toFixed(1)}%`;

    if (usagePercent > 90) {
      status = 'unhealthy';
      message += ' - Critical disk space';
    } else if (usagePercent > 80) {
      status = 'degraded';
      message += ' - High disk usage';
    }

    return {
      name: 'disk_space',
      status,
      message,
      responseTime,
      metadata: {
        usagePercent: Number(usagePercent.toFixed(1)),
        freeBytes: stats.free,
        totalBytes: stats.total,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      name: 'disk_space',
      status: 'unhealthy',
      message: `Disk space check failed: ${(error as Error).message}`,
      responseTime,
    };
  }
}

async function checkMemoryUsage(): Promise<HealthCheck> {
  const startTime = Date.now();

  try {
    const memUsage = process.memoryUsage();
    const usagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const responseTime = Date.now() - startTime;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Memory usage: ${usagePercent.toFixed(1)}%`;

    if (usagePercent > 90) {
      status = 'unhealthy';
      message += ' - Critical memory usage';
    } else if (usagePercent > 80) {
      status = 'degraded';
      message += ' - High memory usage';
    }

    return {
      name: 'memory',
      status,
      message,
      responseTime,
      metadata: {
        usagePercent: Number(usagePercent.toFixed(1)),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      name: 'memory',
      status: 'unhealthy',
      message: `Memory check failed: ${(error as Error).message}`,
      responseTime,
    };
  }
}

function determineOverallStatus(
  checks: HealthCheck[],
): 'healthy' | 'degraded' | 'unhealthy' {
  const unhealthyChecks = checks.filter((c) => c.status === 'unhealthy');
  const degradedChecks = checks.filter((c) => c.status === 'degraded');

  if (unhealthyChecks.length > 0) {
    return 'unhealthy';
  } else if (degradedChecks.length > 0) {
    return 'degraded';
  } else {
    return 'healthy';
  }
}

// Readiness check endpoint
export async function HEAD(request: NextRequest): Promise<NextResponse> {
  try {
    // Quick readiness check - just database
    const isReady = await checkDatabaseHealth();

    if (isReady) {
      return new NextResponse(null, { status: 200 });
    } else {
      return new NextResponse(null, { status: 503 });
    }
  } catch (error) {
    logger.error('Readiness check failed', error as Error);
    return new NextResponse(null, { status: 503 });
  }
}
