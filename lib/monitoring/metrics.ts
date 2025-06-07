import 'server-only';

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface MetricsCollector {
  increment(name: string, value?: number, tags?: Record<string, string>): void;
  decrement(name: string, value?: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, duration: number, tags?: Record<string, string>): void;
  flush(): Promise<void>;
}

class InMemoryMetricsCollector implements MetricsCollector {
  private metrics: Metric[] = [];
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();

  increment(name: string, value = 1, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    this.addMetric({
      name,
      value: current + value,
      unit: 'count',
      timestamp: new Date(),
      tags,
    });
  }

  decrement(name: string, value = 1, tags?: Record<string, string>): void {
    this.increment(name, -value, tags);
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    this.gauges.set(key, value);

    this.addMetric({
      name,
      value,
      unit: 'gauge',
      timestamp: new Date(),
      tags,
    });
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.getKey(name, tags);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);

    this.addMetric({
      name,
      value,
      unit: 'histogram',
      timestamp: new Date(),
      tags,
    });
  }

  timing(name: string, duration: number, tags?: Record<string, string>): void {
    this.addMetric({
      name,
      value: duration,
      unit: 'ms',
      timestamp: new Date(),
      tags,
    });
  }

  async flush(): Promise<void> {
    if (this.metrics.length === 0) return;

    try {
      // In production, send metrics to monitoring service
      if (process.env.METRICS_ENDPOINT) {
        await fetch(process.env.METRICS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metrics: this.metrics }),
        });
      }

      // Log metrics in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Metrics:', this.getMetricsSummary());
      }

      // Clear metrics after sending
      this.metrics = [];
    } catch (error) {
      console.error('Failed to flush metrics:', error);
    }
  }

  private addMetric(metric: Metric): void {
    this.metrics.push(metric);

    // Auto-flush when metrics buffer gets large
    if (this.metrics.length >= 100) {
      this.flush();
    }
  }

  private getKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}|${tagString}`;
  }

  private getMetricsSummary(): Record<string, any> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(
        Array.from(this.histograms.entries()).map(([key, values]) => [
          key,
          {
            count: values.length,
            sum: values.reduce((a, b) => a + b, 0),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
          },
        ]),
      ),
      totalMetrics: this.metrics.length,
    };
  }
}

// Singleton metrics collector
export const metrics = new InMemoryMetricsCollector();

// Periodic flush
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  setInterval(() => {
    metrics.flush();
  }, 60000); // Flush every minute
}

// Application-specific metrics helpers
export const appMetrics = {
  // User metrics
  userLogin: (userId: string) => {
    metrics.increment('user.login', 1, { userId });
  },

  userRegistration: () => {
    metrics.increment('user.registration');
  },

  // Chat metrics
  messagesSent: (userId: string, model: string) => {
    metrics.increment('chat.messages.sent', 1, { userId, model });
  },

  chatCreated: (userId: string) => {
    metrics.increment('chat.created', 1, { userId });
  },

  // Document metrics
  documentUploaded: (userId: string, fileType: string, sizeBytes: number) => {
    metrics.increment('document.uploaded', 1, { userId, fileType });
    metrics.histogram('document.size', sizeBytes, { fileType });
  },

  documentProcessed: (
    documentId: string,
    processingTime: number,
    status: string,
  ) => {
    metrics.timing('document.processing.time', processingTime, { status });
    metrics.increment('document.processed', 1, { status });
  },

  // API metrics
  apiRequest: (
    method: string,
    path: string,
    statusCode: number,
    duration: number,
  ) => {
    metrics.increment('api.requests', 1, {
      method,
      path,
      status: statusCode.toString(),
    });
    metrics.timing('api.response.time', duration, { method, path });
  },

  // Database metrics
  dbQuery: (
    operation: string,
    table: string,
    duration: number,
    success: boolean,
  ) => {
    metrics.timing('db.query.time', duration, { operation, table });
    metrics.increment('db.queries', 1, {
      operation,
      table,
      success: success.toString(),
    });
  },

  // Cache metrics
  cacheHit: (cacheType: string) => {
    metrics.increment('cache.hits', 1, { type: cacheType });
  },

  cacheMiss: (cacheType: string) => {
    metrics.increment('cache.misses', 1, { type: cacheType });
  },

  // Error metrics
  error: (errorType: string, component: string) => {
    metrics.increment('errors', 1, { type: errorType, component });
  },

  // Performance metrics
  bundleSize: (bundleName: string, sizeBytes: number) => {
    metrics.gauge('bundle.size', sizeBytes, { bundle: bundleName });
  },

  pageLoad: (page: string, loadTime: number) => {
    metrics.timing('page.load.time', loadTime, { page });
  },

  // Rate limiting metrics
  rateLimitHit: (endpoint: string, userId?: string) => {
    metrics.increment('rate_limit.hit', 1, {
      endpoint,
      userId: userId || 'anonymous',
    });
  },

  // Search metrics
  searchQuery: (query: string, resultCount: number, searchTime: number) => {
    metrics.timing('search.time', searchTime);
    metrics.histogram('search.results', resultCount);
    metrics.increment('search.queries');
  },
};

// Performance monitoring decorator
export function withMetrics<T extends (...args: any[]) => any>(
  metricName: string,
  fn: T,
  tags?: Record<string, string>,
): T {
  return ((...args: any[]) => {
    const startTime = Date.now();

    try {
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result
          .then((value) => {
            const duration = Date.now() - startTime;
            metrics.timing(metricName, duration, { ...tags, success: 'true' });
            return value;
          })
          .catch((error) => {
            const duration = Date.now() - startTime;
            metrics.timing(metricName, duration, { ...tags, success: 'false' });
            throw error;
          });
      }

      // Handle sync functions
      const duration = Date.now() - startTime;
      metrics.timing(metricName, duration, { ...tags, success: 'true' });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.timing(metricName, duration, { ...tags, success: 'false' });
      throw error;
    }
  }) as T;
}

// System metrics collection
export function collectSystemMetrics() {
  if (typeof process === 'undefined') return;

  // Memory usage
  const memUsage = process.memoryUsage();
  metrics.gauge('system.memory.heap.used', memUsage.heapUsed);
  metrics.gauge('system.memory.heap.total', memUsage.heapTotal);
  metrics.gauge('system.memory.rss', memUsage.rss);

  // CPU usage (requires additional monitoring)
  metrics.gauge('system.uptime', process.uptime());
}

// Start system metrics collection
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
  setInterval(collectSystemMetrics, 30000); // Every 30 seconds
}
