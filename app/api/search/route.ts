import { type NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { vectorSearchService } from '@/lib/search/vector-search';
import { db } from '@/lib/db';
import { ragDocument } from '@/lib/db/schema';
import { sql, eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { createClient, } from 'redis';

// Initialize Redis for analytics if available
const redis: any = process.env.REDIS_URL 
  ? (() => {
      const client = createClient({ url: process.env.REDIS_URL });
      client.connect().catch(console.error);
      return client;
    })()
  : null;

const searchSchema = z.object({
  query: z.string().min(1, 'Query is required').max(500, 'Query too long'),
  searchType: z.enum(['vector', 'hybrid', 'context-aware', 'multi-step']).default('hybrid'),
  limit: z.number().min(1).max(50).default(10),
  threshold: z.number().min(0).max(1).default(0.3),
  documentIds: z.array(z.string().uuid()).optional(),
  useRerank: z.boolean().default(true),
  vectorWeight: z.number().min(0).max(1).default(0.7),
  textWeight: z.number().min(0).max(1).default(0.3),
  // Faceted search options
  facets: z.object({
    documentTypes: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    }).optional(),
    sources: z.array(z.string()).optional(),
    minChunkLength: z.number().min(0).optional(),
    maxChunkLength: z.number().min(1).optional(),
  }).optional(),
  // Analytics options
  trackSearch: z.boolean().default(true),
  includeAnalytics: z.boolean().default(false),
  // Advanced options
  embeddingModel: z.enum(['v3.0', 'v4.0']).optional(),
  scoringAlgorithm: z.enum(['weighted', 'rrf', 'adaptive']).optional(),
});

const analyticsSchema = z.object({
  timeRange: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metrics: z.array(z.enum(['queries', 'performance', 'popular', 'success_rate'])).optional(),
});

export const POST = withAuth(async (request: NextRequest, session: any) => {
  const startTime = Date.now();
  
  try {
    const body = await request.json();

    // Validate input
    const validation = searchSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid search parameters',
          details: validation.error.errors,
        },
        { status: 400 },
      );
    }

    const {
      query,
      searchType,
      limit,
      threshold,
      documentIds,
      useRerank,
      vectorWeight,
      textWeight,
      facets,
      trackSearch,
      includeAnalytics,
      embeddingModel,
      scoringAlgorithm,
    } = validation.data;
    
    // Apply document filters based on facets
    let filteredDocumentIds = documentIds;
    if (facets) {
      filteredDocumentIds = await applyDocumentFacets(session.user.id, facets, documentIds);
    }

    // Validate weight sum for hybrid search
    if (
      searchType === 'hybrid' &&
      Math.abs(vectorWeight + textWeight - 1) > 0.01
    ) {
      return NextResponse.json(
        {
          error: 'Vector weight and text weight must sum to 1.0',
        },
        { status: 400 },
      );
    }

    let searchResponse: any;
    const searchOptions = {
      limit,
      threshold,
      documentIds: filteredDocumentIds,
      useRerank,
      vectorWeight,
      textWeight,
      rerankTopK: Math.min(limit * 2, 20),
      scoringAlgorithm,
      embeddingModel,
    };

    switch (searchType) {
      case 'vector':
        searchResponse = await vectorSearchService.vectorSearch(
          query,
          session.user.id,
          {
            limit,
            threshold,
            documentIds: filteredDocumentIds,
            expandQuery: true,
          },
        );
        break;
      
      case 'context-aware':
        searchResponse = await vectorSearchService.contextAwareSearch(
          query,
          session.user.id,
          [], // No conversation context in direct search
          {
            limit,
            threshold,
            documentIds: filteredDocumentIds,
          },
        );
        break;
      
      case 'multi-step':
        searchResponse = await vectorSearchService.multiStepSearch(
          query,
          session.user.id,
          {
            maxSteps: 3,
            minResultsPerStep: Math.ceil(limit / 3),
            documentIds: filteredDocumentIds,
          },
        );
        break;
      
      case 'hybrid':
      default:
        searchResponse = await vectorSearchService.hybridSearch(
          query,
          session.user.id,
          searchOptions,
        );
        break;
    }
    
    // Apply result-level faceted filtering
    if (facets) {
      searchResponse.results = await applyResultFacets(searchResponse.results, facets);
      searchResponse.totalResults = searchResponse.results.length;
    }

    const responseTime = Date.now() - startTime;
    
    // Track search analytics
    if (trackSearch && redis) {
      await trackSearchAnalytics({
        userId: session.user.id,
        query,
        searchType,
        resultCount: searchResponse.totalResults,
        responseTime,
        facetsUsed: !!facets,
        cacheHit: searchResponse.cacheHit || false,
      });
    }
    
    // Include analytics if requested
    let analytics: any;
    if (includeAnalytics) {
      analytics = await getSearchAnalytics(session.user.id, 'day');
    }
    
    // Generate facet counts for the UI
    const facetCounts = await generateFacetCounts(session.user.id, query, filteredDocumentIds);
    
    return NextResponse.json({
      query,
      searchType,
      ...searchResponse,
      responseTime,
      facets: {
        applied: facets || {},
        available: facetCounts,
      },
      analytics: analytics || undefined,
      performance: {
        totalResponseTime: responseTime,
        searchTime: searchResponse.searchTimeMs,
        facetTime: facets ? responseTime - searchResponse.searchTimeMs : 0,
        cacheUsed: searchResponse.cacheHit || false,
      },
    });
  } catch (error) {
    console.error('Search endpoint error:', error);

    if (error instanceof Error) {
      // Handle specific search errors
      if (error.message.includes('Vector search failed')) {
        return NextResponse.json(
          {
            error: 'Search service unavailable',
            details: 'Vector search is temporarily unavailable',
          },
          { status: 503 },
        );
      }

      if (error.message.includes('embedding')) {
        return NextResponse.json(
          {
            error: 'Query processing failed',
            details: 'Unable to process search query',
          },
          { status: 400 },
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      { status: 500 },
    );
  }
});

export const GET = withAuth(async (request: NextRequest, session: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const analytics = searchParams.get('analytics');
    
    // Handle analytics requests
    if (analytics === 'true') {
      const timeRange = (searchParams.get('timeRange') as any) || 'day';
      const metrics = searchParams.get('metrics')?.split(',') || ['queries', 'performance'];
      
      const analyticsData = await getSearchAnalytics(session.user.id, timeRange);
      const facetSummary = await getFacetSummary(session.user.id);
      
      return NextResponse.json({
        analytics: analyticsData,
        facets: facetSummary,
        cacheStats: await vectorSearchService.getCacheStats(),
      });
    }

    if (!query) {
      // Return search suggestions and popular queries
      const popularQueries = await getPopularQueries(session.user.id);
      const suggestions = await getSearchSuggestions(session.user.id);
      
      return NextResponse.json({
        popularQueries,
        suggestions,
        message: 'Provide a query parameter "q" to search',
      });
    }

    // Simple vector search for GET requests with basic analytics
    const startTime = Date.now();
    const searchResponse = await vectorSearchService.vectorSearch(
      query,
      session.user.id,
      {
        limit: 5,
        threshold: 0.3,
        expandQuery: true,
      },
    );
    
    const responseTime = Date.now() - startTime;
    
    // Track simple search
    if (redis) {
      await trackSearchAnalytics({
        userId: session.user.id,
        query,
        searchType: 'vector',
        resultCount: searchResponse.totalResults,
        responseTime,
        facetsUsed: false,
        cacheHit: searchResponse.cacheHit || false,
      });
    }

    return NextResponse.json({
      query,
      searchType: 'vector',
      ...searchResponse,
      responseTime,
    });
  } catch (error) {
    console.error('Search GET endpoint error:', error);
    return NextResponse.json(
      {
        error: 'Search failed',
      },
      { status: 500 },
    );
  }
});

/**
 * Apply document-level faceted filtering
 */
async function applyDocumentFacets(
  userId: string,
  facets: any,
  existingDocumentIds?: string[],
): Promise<string[] | undefined> {
  try {
    const whereConditions: any[] = [eq(ragDocument.uploadedBy, userId)];
    
    // Apply date range filter
    if (facets.dateRange?.start || facets.dateRange?.end) {
      if (facets.dateRange.start) {
        whereConditions.push(sql`${ragDocument.createdAt} >= ${new Date(facets.dateRange.start)}`);
      }
      if (facets.dateRange.end) {
        whereConditions.push(sql`${ragDocument.createdAt} <= ${new Date(facets.dateRange.end)}`);
      }
    }
    
    // Apply document type filter (based on file extension or metadata)
    if (facets.documentTypes?.length > 0) {
      const typeConditions = facets.documentTypes.map((type: string) => 
        sql`${ragDocument.originalName} ILIKE ${`%.${type}`}`
      );
      whereConditions.push(sql`(${sql.join(typeConditions, sql` OR `)})`)
    }
    
    // Apply source filter (document names)
    if (facets.sources?.length > 0) {
      whereConditions.push(sql`${ragDocument.originalName} = ANY(${facets.sources})`);
    }
    
    // Combine with existing document IDs if provided
    if (existingDocumentIds?.length) {
      whereConditions.push(sql`${ragDocument.id} = ANY(${existingDocumentIds})`);
    }
    
    const filteredDocs = await db
      .select({ id: ragDocument.id })
      .from(ragDocument)
      .where(and(...whereConditions));
    
    return filteredDocs.map(doc => doc.id);
  } catch (error) {
    console.error('Error applying document facets:', error);
    return existingDocumentIds;
  }
}

/**
 * Apply result-level faceted filtering
 */
async function applyResultFacets(
  results: any[],
  facets: any,
): Promise<any[]> {
  let filteredResults = results;
  
  // Filter by chunk length
  if (facets.minChunkLength || facets.maxChunkLength) {
    filteredResults = filteredResults.filter(result => {
      const length = result.content.length;
      if (facets.minChunkLength && length < facets.minChunkLength) return false;
      if (facets.maxChunkLength && length > facets.maxChunkLength) return false;
      return true;
    });
  }
  
  return filteredResults;
}

/**
 * Generate facet counts for available filters
 */
async function generateFacetCounts(
  userId: string,
  query: string,
  documentIds?: string[],
): Promise<any> {
  try {
    let whereCondition = eq(ragDocument.uploadedBy, userId);
    
    if (documentIds?.length) {
      whereCondition = and(
        whereCondition,
        sql`${ragDocument.id} = ANY(${documentIds})`
      )!;
    }
    
    // Get document type counts
    const typeCountsQuery = await db
      .select({
        extension: sql<string>`LOWER(RIGHT(${ragDocument.originalName}, 4))`,
        count: sql<number>`COUNT(*)`,
      })
      .from(ragDocument)
      .where(whereCondition)
      .groupBy(sql`LOWER(RIGHT(${ragDocument.originalName}, 4))`)
      .orderBy(desc(sql`COUNT(*)`));
    
    const typeCounts = typeCountsQuery.reduce((acc, row) => {
      const ext = row.extension.replace('.', '');
      acc[ext] = row.count;
      return acc;
    }, {} as Record<string, number>);
    
    // Get source counts
    const sourceCountsQuery = await db
      .select({
        source: ragDocument.originalName,
        count: sql<number>`COUNT(*)`,
      })
      .from(ragDocument)
      .where(whereCondition)
      .groupBy(ragDocument.originalName)
      .orderBy(desc(sql`COUNT(*)`));
    
    const sourceCounts = sourceCountsQuery.reduce((acc, row) => {
      acc[row.source] = row.count;
      return acc;
    }, {} as Record<string, number>);
    
    // Get date range info
    const dateRangeQuery = await db
      .select({
        minDate: sql<Date>`MIN(${ragDocument.createdAt})`,
        maxDate: sql<Date>`MAX(${ragDocument.createdAt})`,
      })
      .from(ragDocument)
      .where(whereCondition);
    
    return {
      documentTypes: typeCounts,
      sources: sourceCounts,
      dateRange: dateRangeQuery[0] || { minDate: null, maxDate: null },
    };
  } catch (error) {
    console.error('Error generating facet counts:', error);
    return {
      documentTypes: {},
      sources: {},
      dateRange: { minDate: null, maxDate: null },
    };
  }
}

/**
 * Track search analytics in Redis
 */
async function trackSearchAnalytics(data: {
  userId: string;
  query: string;
  searchType: string;
  resultCount: number;
  responseTime: number;
  facetsUsed: boolean;
  cacheHit: boolean;
}): Promise<void> {
  if (!redis) return;
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    
    // Track daily metrics
    const dailyKey = `search_analytics:${data.userId}:${today}`;
    await redis.hIncrBy(dailyKey, 'total_searches', 1);
    await redis.hIncrBy(dailyKey, 'total_results', data.resultCount);
    await redis.hIncrBy(dailyKey, 'total_response_time', data.responseTime);
    if (data.cacheHit) {
      await redis.hIncrBy(dailyKey, 'cache_hits', 1);
    }
    if (data.facetsUsed) {
      await redis.hIncrBy(dailyKey, 'faceted_searches', 1);
    }
    
    // Track search types
    await redis.hIncrBy(dailyKey, `type_${data.searchType}`, 1);
    
    // Track hourly distribution
    await redis.hIncrBy(`search_hours:${data.userId}:${today}`, hour.toString(), 1);
    
    // Track popular queries
    await redis.zIncrBy(`popular_queries:${data.userId}:${today}`, 1, data.query);
    
    // Set expiration
    await redis.expire(dailyKey, 86400 * 30); // 30 days
    await redis.expire(`search_hours:${data.userId}:${today}`, 86400 * 30);
    await redis.expire(`popular_queries:${data.userId}:${today}`, 86400 * 30);
  } catch (error) {
    console.error('Error tracking search analytics:', error);
  }
}

/**
 * Get search analytics data
 */
async function getSearchAnalytics(
  userId: string,
  timeRange: 'hour' | 'day' | 'week' | 'month',
): Promise<any> {
  if (!redis) {
    return {
      totalSearches: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      popularQueries: [],
      searchTypes: {},
      hourlyDistribution: {},
    };
  }
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `search_analytics:${userId}:${today}`;
    
    const dailyStats = await redis.hGetAll(dailyKey);
    const totalSearches = Number.parseInt(dailyStats.total_searches || '0');
    const totalResponseTime = Number.parseInt(dailyStats.total_response_time || '0');
    const cacheHits = Number.parseInt(dailyStats.cache_hits || '0');
    
    // Get popular queries
    const popularQueriesRaw = await redis.zRevRangeWithScores(
      `popular_queries:${userId}:${today}`,
      0,
      9
    );
    
    const popularQueries = popularQueriesRaw.map((item: any) => ({
      query: item.value,
      count: item.score,
    }));
    
    // Get hourly distribution
    const hourlyStats = await redis.hGetAll(`search_hours:${userId}:${today}`);
    const hourlyDistribution = Object.keys(hourlyStats).reduce((acc, hour) => {
      acc[hour] = Number.parseInt(hourlyStats[hour]);
      return acc;
    }, {} as Record<string, number>);
    
    // Extract search type stats
    const searchTypes = Object.keys(dailyStats)
      .filter(key => key.startsWith('type_'))
      .reduce((acc, key) => {
        const type = key.replace('type_', '');
        acc[type] = Number.parseInt(dailyStats[key]);
        return acc;
      }, {} as Record<string, number>);
    
    return {
      totalSearches,
      avgResponseTime: totalSearches > 0 ? Math.round(totalResponseTime / totalSearches) : 0,
      cacheHitRate: totalSearches > 0 ? Math.round((cacheHits / totalSearches) * 100) / 100 : 0,
      popularQueries,
      searchTypes,
      hourlyDistribution,
      facetedSearchRate: totalSearches > 0 
        ? Math.round((Number.parseInt(dailyStats.faceted_searches || '0') / totalSearches) * 100) / 100 
        : 0,
    };
  } catch (error) {
    console.error('Error getting search analytics:', error);
    return {
      totalSearches: 0,
      avgResponseTime: 0,
      cacheHitRate: 0,
      popularQueries: [],
      searchTypes: {},
      hourlyDistribution: {},
    };
  }
}

/**
 * Get facet usage summary
 */
async function getFacetSummary(userId: string): Promise<any> {
  try {
    const facetCounts = await generateFacetCounts(userId, '');
    
    return {
      totalDocuments: Object.values(facetCounts.sources).reduce((sum: number, count: any) => sum + (count as number), 0),
      documentTypes: Object.keys(facetCounts.documentTypes).length,
      sources: Object.keys(facetCounts.sources).length,
      dateSpan: facetCounts.dateRange.minDate && facetCounts.dateRange.maxDate
        ? Math.ceil((new Date(facetCounts.dateRange.maxDate).getTime() - new Date(facetCounts.dateRange.minDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    };
  } catch (error) {
    console.error('Error getting facet summary:', error);
    return {
      totalDocuments: 0,
      documentTypes: 0,
      sources: 0,
      dateSpan: 0,
    };
  }
}

/**
 * Get popular queries for the user
 */
async function getPopularQueries(userId: string): Promise<Array<{ query: string; count: number }>> {
  if (!redis) return [];
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const queriesRaw = await redis.zRevRangeWithScores(
      `popular_queries:${userId}:${today}`,
      0,
      4
    );
    
    const queries = queriesRaw.map((item: any) => ({
      query: item.value,
      count: item.score,
    }));
    
    return queries;
  } catch (error) {
    console.error('Error getting popular queries:', error);
    return [];
  }
}

/**
 * Get search suggestions based on user's document corpus
 */
async function getSearchSuggestions(userId: string): Promise<string[]> {
  try {
    // Get sample document titles for suggestions
    const documents = await db
      .select({ name: ragDocument.originalName })
      .from(ragDocument)
      .where(eq(ragDocument.uploadedBy, userId))
      .limit(10);
    
    const suggestions = [];
    
    // Extract key terms from document names
    for (const doc of documents) {
      const terms = doc.name
        .replace(/\.[^.]+$/, '') // Remove extension
        .split(/[\s_-]+/)
        .filter(term => term.length > 3)
        .slice(0, 2);
      
      suggestions.push(...terms);
    }
    
    // Add common search patterns
    suggestions.push(
      'how to',
      'troubleshooting',
      'configuration',
      'installation',
      'error',
      'setup'
    );
    
    return [...new Set(suggestions)].slice(0, 8);
  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return ['how to', 'troubleshooting', 'configuration', 'installation'];
  }
}
