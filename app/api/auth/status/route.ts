import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/kinde';
import { cookies } from 'next/headers';

// Circuit breaker state
const circuitBreakerState = {
  state: 'closed' as 'closed' | 'open' | 'half-open',
  failures: 0,
  lastFailure: null as Date | null,
  nextAttempt: null as Date | null,
};

// Request tracking
let pendingRequests = 0;
let totalRequests = 0;
let failedRequests = 0;

export async function GET(request: NextRequest) {
  try {
    totalRequests++;

    // Check authentication status
    let authenticated = false;
    let user = null;

    try {
      user = await getUser();
      authenticated = !!user;
    } catch (error) {
      console.error('Auth status check error:', error);
    }

    // Check cookies
    const cookieStore = await cookies();
    const authCookies = {
      'kinde-access-token': !!cookieStore.get('kinde-access-token'),
      'kinde-refresh-token': !!cookieStore.get('kinde-refresh-token'),
      'kinde-user': !!cookieStore.get('kinde-user'),
      'kinde-id-token': !!cookieStore.get('kinde-id-token'),
      'ac-state-key': !!cookieStore.get('ac-state-key'),
    };

    const hasCookies = Object.values(authCookies).some((v) => v);

    // Check environment configuration
    const config = {
      hasClientId: !!process.env.KINDE_CLIENT_ID,
      hasClientSecret: !!process.env.KINDE_CLIENT_SECRET,
      hasIssuerUrl: !!process.env.KINDE_ISSUER_URL,
      hasSiteUrl: !!process.env.KINDE_SITE_URL,
      issuerUrl: process.env.KINDE_ISSUER_URL,
      siteUrl: process.env.KINDE_SITE_URL,
    };

    const configValid =
      config.hasClientId &&
      config.hasClientSecret &&
      config.hasIssuerUrl &&
      config.hasSiteUrl;

    // Build status response
    const status = {
      timestamp: new Date().toISOString(),
      authenticated,
      user: user
        ? {
            id: user.id,
            email: user.email,
            type: user.type,
          }
        : null,
      cookies: authCookies,
      hasCookies,
      config: {
        valid: configValid,
        issuerUrl: config.issuerUrl,
        siteUrl: config.siteUrl,
      },
      circuitBreaker: circuitBreakerState,
      stats: {
        totalRequests,
        failedRequests,
        pendingRequests,
        errorRate:
          totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0,
      },
      health: {
        overall:
          authenticated && configValid && circuitBreakerState.state !== 'open'
            ? 'healthy'
            : 'unhealthy',
        auth: authenticated ? 'healthy' : 'unhealthy',
        config: configValid ? 'healthy' : 'unhealthy',
        circuitBreaker:
          circuitBreakerState.state === 'closed'
            ? 'healthy'
            : circuitBreakerState.state === 'half-open'
              ? 'degraded'
              : 'unhealthy',
      },
    };

    return NextResponse.json(status, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Auth status endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Failed to get auth status',
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// Export circuit breaker controls for use in auth handler
export function recordAuthFailure() {
  failedRequests++;
  circuitBreakerState.failures++;
  circuitBreakerState.lastFailure = new Date();

  // Open circuit breaker after 5 failures
  if (
    circuitBreakerState.failures >= 5 &&
    circuitBreakerState.state === 'closed'
  ) {
    circuitBreakerState.state = 'open';
    circuitBreakerState.nextAttempt = new Date(Date.now() + 60000); // Try again in 1 minute
    console.error('Circuit breaker OPENED due to repeated auth failures');
  }
}

export function recordAuthSuccess() {
  if (circuitBreakerState.state === 'half-open') {
    circuitBreakerState.state = 'closed';
    circuitBreakerState.failures = 0;
    console.log('Circuit breaker CLOSED after successful auth');
  }
}

export function isCircuitBreakerOpen(): boolean {
  if (circuitBreakerState.state === 'open' && circuitBreakerState.nextAttempt) {
    if (new Date() >= circuitBreakerState.nextAttempt) {
      circuitBreakerState.state = 'half-open';
      console.log('Circuit breaker moved to HALF-OPEN state');
      return false;
    }
    return true;
  }
  return false;
}

export function incrementPendingRequests() {
  pendingRequests++;
}

export function decrementPendingRequests() {
  pendingRequests = Math.max(0, pendingRequests - 1);
}
