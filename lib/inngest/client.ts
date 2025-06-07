import { Inngest } from "inngest";
import { 
  InngestConfigSchema, 
  InngestEventSchema,
  InngestHealthSchema,
  type InngestConfig, 
  type InngestEvent, 
  type InngestHealth 
} from './types';

/**
 * Get Inngest configuration based on environment
 */
export function getInngestConfig(): InngestConfig {
  const isDev = process.env.NODE_ENV !== 'production';
  
  const config: InngestConfig = {
    id: isDev ? 'rra-v2-dev' : 'rra-v2-prod',
    name: isDev ? 'RRA V2 Development' : 'RRA V2 Production',
    eventKey: process.env.INNGEST_EVENT_KEY || (isDev ? 'local-dev-key' : ''),
    isDev,
    env: isDev ? 'development' : 'production',
  };

  if (isDev) {
    const host = process.env.INNGEST_SERVE_HOST || 'localhost';
    const port = process.env.INNGEST_SERVE_PORT || '8288';
    config.devServerUrl = `http://${host}:${port}`;
  } else {
    config.signingKey = process.env.INNGEST_SIGNING_KEY;
  }

  return config;
}

/**
 * Validate Inngest configuration
 */
export function validateInngestConfig(): void {
  const config = getInngestConfig();
  
  if (!config.isDev) {
    // Production validation
    if (!config.eventKey) {
      throw new Error('INNGEST_EVENT_KEY is required in production');
    }
    if (!config.signingKey) {
      throw new Error('INNGEST_SIGNING_KEY is required in production');
    }
  }
  
  // Validate with Zod schema
  InngestConfigSchema.parse(config);
}

/**
 * Create Inngest client instance
 */
export function createInngestClient(): Inngest {
  validateInngestConfig();
  const config = getInngestConfig();
  
  const inngestConfig: any = {
    id: config.id,
    name: config.name,
    eventKey: config.eventKey,
  };

  if (config.isDev) {
    inngestConfig.isDev = true;
    if (config.devServerUrl) {
      inngestConfig.devServerUrl = config.devServerUrl;
    }
  } else {
    inngestConfig.signingKey = config.signingKey;
  }

  return new Inngest(inngestConfig);
}

/**
 * Inngest client configuration (compatibility with existing system)
 * Supports both local development (Inngest Dev Server) and production (Inngest Cloud)
 */
export const inngest = new Inngest({
  id: "rra-v2-app",
  name: "RRA V2 Document Processing",
  env: process.env.NODE_ENV === "production" ? "production" : "development",
  
  // Configure the base URL for different environments
  ...(process.env.NODE_ENV === "development" && {
    // Local development with Inngest Dev Server
    eventKey: process.env.INNGEST_EVENT_KEY || "local",
    isDev: true,
  }),
  
  ...(process.env.NODE_ENV === "production" && {
    // Production configuration
    eventKey: process.env.INNGEST_EVENT_KEY!,
    signingKey: process.env.INNGEST_SIGNING_KEY!,
  }),

  // Optional: Custom logger configuration
  logger: {
    level: process.env.NODE_ENV === "development" ? "debug" : "info",
  },

  // Optional: Configure retries and timeouts
  retries: {
    // Maximum number of retries for failed function runs
    max: 3,
  },
});

/**
 * Send a single event to Inngest (TDD system)
 */
export async function sendInngestEvent(event: InngestEvent): Promise<any> {
  // Validate event structure
  const validatedEvent = InngestEventSchema.parse(event);
  
  if (!validatedEvent.name) {
    throw new Error('Event name is required');
  }
  
  // Add timestamp if not provided
  const eventWithTimestamp = {
    ...validatedEvent,
    ts: validatedEvent.ts || validatedEvent.timestamp || Date.now(),
  };
  
  return await inngest.send(eventWithTimestamp);
}

/**
 * Send multiple events to Inngest (TDD system)
 */
export async function sendInngestEvents(events: InngestEvent[]): Promise<any[]> {
  const validatedEvents = events.map(event => {
    const validated = InngestEventSchema.parse(event);
    return {
      ...validated,
      ts: validated.ts || validated.timestamp || Date.now(),
    };
  });
  
  return await inngest.send(validatedEvents);
}

/**
 * Check Inngest service health (TDD system)
 */
export async function checkInngestHealth(): Promise<InngestHealth> {
  const config = getInngestConfig();
  const timestamp = Date.now();
  
  try {
    validateInngestConfig();
    
    const health: InngestHealth = {
      status: 'healthy',
      timestamp,
      config: {
        id: config.id,
        name: config.name,
        isDev: config.isDev,
        devServerUrl: config.devServerUrl,
      },
    };
    
    return InngestHealthSchema.parse(health);
  } catch (error) {
    const health: InngestHealth = {
      status: 'unhealthy',
      timestamp,
      config: {
        id: config.id,
        name: config.name,
        isDev: config.isDev,
        devServerUrl: config.devServerUrl,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    
    return InngestHealthSchema.parse(health);
  }
}

/**
 * Check development server health (TDD system)
 */
export async function checkDevServerHealth(): Promise<InngestHealth> {
  const config = getInngestConfig();
  const timestamp = Date.now();
  
  if (!config.isDev || !config.devServerUrl) {
    return {
      status: 'unknown',
      timestamp,
      config: {
        id: config.id,
        name: config.name,
        isDev: config.isDev,
      },
      devServerAvailable: false,
      error: 'Not in development mode or no dev server URL configured',
    };
  }
  
  try {
    const response = await fetch(`${config.devServerUrl}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      return {
        status: 'healthy',
        timestamp,
        config: {
          id: config.id,
          name: config.name,
          isDev: config.isDev,
          devServerUrl: config.devServerUrl,
        },
        devServerAvailable: true,
      };
    } else {
      return {
        status: 'unhealthy',
        timestamp,
        config: {
          id: config.id,
          name: config.name,
          isDev: config.isDev,
          devServerUrl: config.devServerUrl,
        },
        devServerAvailable: false,
        error: `Dev server responded with status ${response.status}`,
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp,
      config: {
        id: config.id,
        name: config.name,
        isDev: config.isDev,
        devServerUrl: config.devServerUrl,
      },
      devServerAvailable: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send event utility function (TDD compatibility)
 */
export async function sendEvent(event: InngestEvent) {
  try {
    return await inngest.send(event);
  } catch (error) {
    console.error('Failed to send Inngest event:', error);
    throw error;
  }
}

/**
 * Create event utility function (existing system compatibility)
 */
export async function createEvent<T extends EventName>(
  eventName: T,
  payload: EventMap[T]
): Promise<void> {
  try {
    await inngest.send({
      name: eventName,
      data: payload,
    });
  } catch (error) {
    console.error(`Failed to send event ${eventName}:`, error);
    throw error;
  }
}

/**
 * Re-export types and schemas for convenience (TDD system)
 */
export { 
  InngestConfigSchema, 
  InngestEventSchema, 
  InngestHealthSchema,
  type InngestConfig,
  type InngestEvent,
  type InngestHealth,
} from './types';

/**
 * Type alias for client instance
 */
export type InngestClient = typeof inngest;