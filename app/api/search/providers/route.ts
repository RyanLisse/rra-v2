/**
 * Vector Search Provider Management API
 * 
 * Handles provider status, configuration validation, and switching
 * between different vector search providers.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { vectorSearchFactory } from '@/lib/search/providers/factory';
import { enhancedSearchService } from '@/lib/search/enhanced-search-service';
import { z } from 'zod';

// Request validation schemas
const providerConfigSchema = z.object({
  type: z.enum(['neondb', 'openai', 'pinecone']),
  connectionString: z.string().optional(),
  apiKey: z.string().optional(),
  indexName: z.string().optional(),
  embeddingModel: z.string().optional(),
  dimensions: z.number().optional(),
});

const switchProviderSchema = z.object({
  providerId: z.string(),
  validateFirst: z.boolean().default(true),
});

/**
 * GET /api/search/providers
 * Get status and information about all available providers
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { isAuthenticated, getUser } = getKindeServerSession();
    if (!isAuthenticated || !getUser()) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const factory = vectorSearchFactory;

    // Get available provider types
    const availableTypes = factory.getAvailableProviders();

    // Get health status of all active providers
    const providersHealth = await factory.getProvidersHealth();

    // Get enhanced service status
    const enhancedStatus = await enhancedSearchService.getStatus();

    // Get current configuration from environment
    const currentConfig = {
      primary: {
        type: (process.env.VECTOR_SEARCH_PROVIDER as any) || 'neondb',
        isConfigured: !!(process.env.POSTGRES_URL || process.env.OPENAI_API_KEY),
      },
      fallback: {
        type: process.env.VECTOR_SEARCH_PROVIDER === 'neondb' ? 'openai' : 'neondb',
        isConfigured: !!(process.env.OPENAI_API_KEY && process.env.POSTGRES_URL),
      },
    };

    // Get provider configurations
    const providerConfigs = await Promise.allSettled([
      // NeonDB configuration
      factory.validateProviderConfig({
        type: 'neondb',
        connectionString: process.env.POSTGRES_URL || '',
        embeddingModel: process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0',
        dimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS || '1024'),
      }),
      // OpenAI configuration
      factory.validateProviderConfig({
        type: 'openai',
        apiKey: process.env.OPENAI_API_KEY || '',
        indexName: process.env.OPENAI_VECTOR_INDEX || 'roborail-docs',
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large',
        dimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS || '3072'),
      }),
    ]);

    const neondbValidation = providerConfigs[0].status === 'fulfilled' 
      ? providerConfigs[0].value 
      : { isValid: false, errors: ['Configuration check failed'], warnings: [] };

    const openaiValidation = providerConfigs[1].status === 'fulfilled' 
      ? providerConfigs[1].value 
      : { isValid: false, errors: ['Configuration check failed'], warnings: [] };

    return NextResponse.json({
      providers: {
        available: availableTypes,
        health: providersHealth,
        configurations: {
          neondb: {
            ...neondbValidation,
            isConfigured: !!process.env.POSTGRES_URL,
            features: ['hybrid_search', 'full_text_search', 'pgvector', 'sql_queries'],
          },
          openai: {
            ...openaiValidation,
            isConfigured: !!process.env.OPENAI_API_KEY,
            features: ['semantic_search', 'assistant_integration', 'file_citations', 'conversational_ai'],
          },
        },
      },
      current: currentConfig,
      enhanced: {
        status: enhancedStatus,
        metrics: enhancedSearchService.getMetrics(),
      },
      recommendations: generateProviderRecommendations(currentConfig, neondbValidation, openaiValidation),
    });

  } catch (error) {
    console.error('Provider status API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get provider status',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/search/providers
 * Validate a provider configuration
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { isAuthenticated, getUser } = getKindeServerSession();
    if (!isAuthenticated || !getUser()) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const validatedConfig = providerConfigSchema.parse(body);

    const factory = vectorSearchFactory;

    // Validate the configuration
    const validation = factory.validateProviderConfig(validatedConfig);

    // If valid, try to create and test the provider
    let connectionTest = null;
    if (validation.isValid) {
      try {
        const provider = factory.createProvider(validatedConfig);
        const status = await provider.getStatus();
        connectionTest = {
          success: status.isHealthy,
          status,
        };
      } catch (error) {
        connectionTest = {
          success: false,
          error: error instanceof Error ? error.message : 'Connection test failed',
        };
      }
    }

    return NextResponse.json({
      validation,
      connectionTest,
      config: validatedConfig,
    });

  } catch (error) {
    console.error('Provider validation API error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid provider configuration',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Provider validation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/search/providers
 * Switch between providers (for enhanced service)
 */
export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const { isAuthenticated, getUser } = getKindeServerSession();
    if (!isAuthenticated || !getUser()) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse and validate request
    const body = await request.json();
    const { action } = body;

    if (action === 'switch_providers') {
      // Switch primary and fallback providers
      await enhancedSearchService.switchProviders();

      const newStatus = await enhancedSearchService.getStatus();

      return NextResponse.json({
        success: true,
        message: 'Providers switched successfully',
        status: newStatus,
      });

    } else if (action === 'reset_metrics') {
      // Reset metrics
      enhancedSearchService.resetMetrics();

      return NextResponse.json({
        success: true,
        message: 'Metrics reset successfully',
        metrics: enhancedSearchService.getMetrics(),
      });

    } else {
      return NextResponse.json(
        { error: 'Invalid action. Supported actions: switch_providers, reset_metrics' },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Provider management API error:', error);
    return NextResponse.json(
      { 
        error: 'Provider management operation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// Helper functions

function generateProviderRecommendations(
  currentConfig: any,
  neondbValidation: any,
  openaiValidation: any
): string[] {
  const recommendations: string[] = [];

  // Check if both providers are available
  if (neondbValidation.isValid && openaiValidation.isValid) {
    recommendations.push('Both providers are available - consider using enhanced service with fallback');
  }

  // Check for missing configurations
  if (!neondbValidation.isValid && neondbValidation.errors.some((error: string) => error.includes('connection string'))) {
    recommendations.push('Configure POSTGRES_URL to enable NeonDB provider');
  }

  if (!openaiValidation.isValid && openaiValidation.errors.some((error: string) => error.includes('API key'))) {
    recommendations.push('Configure OPENAI_API_KEY to enable OpenAI Vector Store provider');
  }

  // Performance recommendations
  if (currentConfig.primary.type === 'neondb') {
    recommendations.push('NeonDB provides fast hybrid search with SQL capabilities');
    if (openaiValidation.isValid) {
      recommendations.push('Consider OpenAI for advanced semantic understanding and conversational queries');
    }
  }

  if (currentConfig.primary.type === 'openai') {
    recommendations.push('OpenAI provides advanced AI-powered semantic search');
    if (neondbValidation.isValid) {
      recommendations.push('Consider NeonDB for faster structured queries and better caching');
    }
  }

  // Fallback recommendations
  if (!currentConfig.fallback.isConfigured) {
    recommendations.push('Configure a fallback provider for high availability');
  }

  return recommendations;
}