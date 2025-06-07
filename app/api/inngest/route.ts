import { inngestHandler } from "@/lib/inngest/handler";

/**
 * Inngest API Route Handler
 * 
 * This route handles all Inngest communication including:
 * - Function registration (GET)
 * - Function execution (POST) 
 * - Introspection (PUT)
 * 
 * The handler is configured in @/lib/inngest/handler.ts
 */

// Export HTTP method handlers from the Inngest handler
export const { GET, POST, PUT } = inngestHandler;

/**
 * Configuration for this API route
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time