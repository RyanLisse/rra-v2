'use client';

export interface ErrorTracker {
  captureException(error: Error, context?: ErrorContext): void;
  captureMessage(message: string, level?: 'info' | 'warning' | 'error'): void;
  setUser(user: { id: string; email?: string; username?: string }): void;
  setTag(key: string, value: string): void;
  setContext(name: string, context: Record<string, any>): void;
  addBreadcrumb(breadcrumb: Breadcrumb): void;
}

export interface ErrorContext {
  user?: {
    id: string;
    email?: string;
    username?: string;
  };
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  level?: 'info' | 'warning' | 'error' | 'fatal';
  fingerprint?: string[];
}

export interface Breadcrumb {
  message: string;
  category?: string;
  level?: 'info' | 'warning' | 'error' | 'debug';
  timestamp?: Date;
  data?: Record<string, any>;
}

class ConsoleErrorTracker implements ErrorTracker {
  private user?: ErrorContext['user'];
  private tags: Record<string, string> = {};
  private contexts: Record<string, Record<string, any>> = {};
  private breadcrumbs: Breadcrumb[] = [];

  captureException(error: Error, context?: ErrorContext): void {
    const enrichedContext = {
      ...context,
      user: context?.user || this.user,
      tags: { ...this.tags, ...context?.tags },
      extra: {
        ...context?.extra,
        breadcrumbs: this.breadcrumbs.slice(-10), // Last 10 breadcrumbs
        contexts: this.contexts,
        userAgent:
          typeof window !== 'undefined'
            ? window.navigator.userAgent
            : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        timestamp: new Date().toISOString(),
      },
    };

    console.group('🚨 Error Captured');
    console.error('Error:', error);
    console.log('Context:', enrichedContext);
    console.groupEnd();

    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      this.sendToService('exception', { error, context: enrichedContext });
    }
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info',
  ): void {
    const context = {
      level,
      user: this.user,
      tags: this.tags,
      extra: {
        breadcrumbs: this.breadcrumbs.slice(-10),
        contexts: this.contexts,
        timestamp: new Date().toISOString(),
      },
    };

    console.log(`📝 Message [${level.toUpperCase()}]:`, message, context);

    if (process.env.NODE_ENV === 'production') {
      this.sendToService('message', { message, context });
    }
  }

  setUser(user: { id: string; email?: string; username?: string }): void {
    this.user = user;
  }

  setTag(key: string, value: string): void {
    this.tags[key] = value;
  }

  setContext(name: string, context: Record<string, any>): void {
    this.contexts[name] = context;
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    const enhancedBreadcrumb = {
      ...breadcrumb,
      timestamp: breadcrumb.timestamp || new Date(),
    };

    this.breadcrumbs.push(enhancedBreadcrumb);

    // Keep only last 50 breadcrumbs
    if (this.breadcrumbs.length > 50) {
      this.breadcrumbs = this.breadcrumbs.slice(-50);
    }
  }

  private async sendToService(
    type: 'exception' | 'message',
    payload: any,
  ): Promise<void> {
    try {
      // In a real application, integrate with services like:
      // - Sentry
      // - Bugsnag
      // - LogRocket
      // - Datadog
      // - Custom error tracking endpoint

      if (process.env.NEXT_PUBLIC_ERROR_TRACKING_ENDPOINT) {
        await fetch(process.env.NEXT_PUBLIC_ERROR_TRACKING_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type,
            payload,
            project: 'rra-v2',
            environment: process.env.NODE_ENV,
          }),
        });
      }
    } catch (error) {
      console.error('Failed to send error to tracking service:', error);
    }
  }
}

// Singleton error tracker
export const errorTracker = new ConsoleErrorTracker();

// React Error Boundary integration
export function captureComponentError(
  error: Error,
  errorInfo: { componentStack: string },
): void {
  errorTracker.captureException(error, {
    tags: {
      errorBoundary: 'true',
      type: 'react-component-error',
    },
    extra: {
      componentStack: errorInfo.componentStack,
    },
    level: 'error',
  });
}

// Promise rejection handler
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    errorTracker.captureException(
      new Error(`Unhandled Promise Rejection: ${event.reason}`),
      {
        tags: { type: 'unhandled-promise-rejection' },
        level: 'error',
      },
    );
  });

  // Global error handler
  window.addEventListener('error', (event) => {
    errorTracker.captureException(event.error || new Error(event.message), {
      tags: { type: 'global-error' },
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      level: 'error',
    });
  });
}

// Performance monitoring
export function trackPerformance(
  name: string,
  fn: () => Promise<any> | any,
): any {
  const startTime = performance.now();

  errorTracker.addBreadcrumb({
    message: `Starting ${name}`,
    category: 'performance',
    level: 'debug',
    data: { startTime },
  });

  try {
    const result = fn();

    if (result instanceof Promise) {
      return result
        .then((value) => {
          const duration = performance.now() - startTime;
          errorTracker.addBreadcrumb({
            message: `Completed ${name}`,
            category: 'performance',
            level: 'info',
            data: { duration, success: true },
          });
          return value;
        })
        .catch((error) => {
          const duration = performance.now() - startTime;
          errorTracker.addBreadcrumb({
            message: `Failed ${name}`,
            category: 'performance',
            level: 'error',
            data: { duration, success: false },
          });
          throw error;
        });
    } else {
      const duration = performance.now() - startTime;
      errorTracker.addBreadcrumb({
        message: `Completed ${name}`,
        category: 'performance',
        level: 'info',
        data: { duration, success: true },
      });
      return result;
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    errorTracker.addBreadcrumb({
      message: `Failed ${name}`,
      category: 'performance',
      level: 'error',
      data: { duration, success: false },
    });
    throw error;
  }
}

// User interaction tracking
export function trackUserAction(
  action: string,
  data?: Record<string, any>,
): void {
  errorTracker.addBreadcrumb({
    message: action,
    category: 'user',
    level: 'info',
    data,
  });
}

// API request tracking
export function trackAPIRequest(
  method: string,
  url: string,
  status?: number,
  duration?: number,
): void {
  errorTracker.addBreadcrumb({
    message: `${method} ${url}`,
    category: 'http',
    level: status && status >= 400 ? 'error' : 'info',
    data: {
      method,
      url,
      status,
      duration,
    },
  });
}

// Navigation tracking
if (typeof window !== 'undefined') {
  // Track page navigation
  let currentPath = window.location.pathname;

  const trackNavigation = () => {
    const newPath = window.location.pathname;
    if (newPath !== currentPath) {
      errorTracker.addBreadcrumb({
        message: `Navigation: ${currentPath} → ${newPath}`,
        category: 'navigation',
        level: 'info',
        data: {
          from: currentPath,
          to: newPath,
        },
      });
      currentPath = newPath;
    }
  };

  // Listen for navigation events
  window.addEventListener('popstate', trackNavigation);

  // Override pushState and replaceState
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    trackNavigation();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    trackNavigation();
  };
}

// Session information
if (typeof window !== 'undefined') {
  errorTracker.setContext('session', {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    screenResolution: `${screen.width}x${screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export default errorTracker;
