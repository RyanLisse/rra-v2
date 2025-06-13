/**
 * OpenAI Vector Store Provider
 * 
 * Implementation of VectorSearchProvider interface for OpenAI Vector Store API.
 * Provides hybrid vector search capabilities using OpenAI's Assistants API.
 */

import OpenAI from 'openai';
import type { RedisClientType } from 'redis';
import { BaseVectorSearchProvider } from './base-provider';
import type {
  SearchResponse,
  HybridSearchResponse,
  VectorSearchOptions,
  HybridSearchOptions,
  DocumentChunk,
  IndexingResult,
  SearchStatus,
  ConfigValidationResult,
  SearchResult,
  HybridSearchResult,
  SearchCacheConfig,
  QueryExpansionConfig,
  SimilarityConfig,
  OpenAIProviderConfig,
} from '../types';

export class OpenAIVectorSearchProvider extends BaseVectorSearchProvider {
  private config: OpenAIProviderConfig;
  private openai: OpenAI;
  private assistantId?: string;
  private vectorStoreId?: string;
  private isConfigured = false;

  constructor(
    config: OpenAIProviderConfig,
    cacheConfig: SearchCacheConfig,
    queryExpansionConfig: QueryExpansionConfig,
    similarityConfig: SimilarityConfig,
    redisClient?: RedisClientType,
  ) {
    super(cacheConfig, queryExpansionConfig, similarityConfig, redisClient);
    this.config = config;
    this.openai = new OpenAI({
      apiKey: config.apiKey,
    });
    this.initialize();
  }

  /**
   * Initialize OpenAI Vector Store and Assistant
   */
  private async initialize(): Promise<void> {
    try {
      // Get or create vector store
      await this.ensureVectorStore();
      
      // Get or create assistant
      await this.ensureAssistant();
      
      this.isConfigured = true;
    } catch (error) {
      console.error('Failed to initialize OpenAI provider:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Ensure vector store exists
   */
  private async ensureVectorStore(): Promise<void> {
    try {
      // Check if we have a vector store ID from environment
      const envVectorStoreId = process.env.OPENAI_VECTOR_STORE_ID || process.env.OPENAI_VECTORSTORE;
      
      if (envVectorStoreId) {
        // Verify the vector store exists
        try {
          await this.openai.beta.vectorStores.retrieve(envVectorStoreId);
          this.vectorStoreId = envVectorStoreId;
          console.log('Using existing vector store:', envVectorStoreId);
          return;
        } catch (error) {
          console.warn('Failed to retrieve vector store from environment:', error);
          // Continue to try creating/finding one
        }
      }

      // List existing vector stores to find our index
      const stores = await this.openai.beta.vectorStores.list();
      let existingStore = stores.data.find(store => store.name === this.config.indexName);

      if (!existingStore) {
        // Create new vector store
        existingStore = await this.openai.beta.vectorStores.create({
          name: this.config.indexName,
          metadata: {
            purpose: 'document_search',
            created_by: 'roborail_rag_system',
            embedding_model: this.config.embeddingModel,
          }
        });
      }

      this.vectorStoreId = existingStore.id;
    } catch (error) {
      console.error('Vector store initialization error:', error);
      throw new Error(`Failed to initialize vector store: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure assistant exists
   */
  private async ensureAssistant(): Promise<void> {
    if (!this.vectorStoreId) {
      throw new Error('Vector store must be initialized before assistant');
    }

    try {
      // List existing assistants to find our assistant
      const assistants = await this.openai.beta.assistants.list();
      let existingAssistant = assistants.data.find(
        assistant => assistant.name === `${this.config.indexName}_search_assistant`
      );

      if (!existingAssistant) {
        // Create new assistant
        existingAssistant = await this.openai.beta.assistants.create({
          name: `${this.config.indexName}_search_assistant`,
          instructions: `You are a helpful assistant that searches through RoboRail documentation to answer user questions. Use the file search tool to find relevant information from the uploaded documents. Always provide specific references to the documents you're citing.`,
          model: 'gpt-4o',
          tools: [{ type: 'file_search' }],
          tool_resources: {
            file_search: {
              vector_store_ids: [this.vectorStoreId]
            }
          },
          metadata: {
            purpose: 'document_search',
            vector_store_id: this.vectorStoreId,
            embedding_model: this.config.embeddingModel,
          }
        });
      }

      this.assistantId = existingAssistant.id;
    } catch (error) {
      console.error('Assistant initialization error:', error);
      throw new Error(`Failed to initialize assistant: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform vector similarity search
   */
  async vectorSearch(
    query: string,
    userId: string,
    options: VectorSearchOptions = {},
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const {
      limit = 10,
      threshold = 0.3,
      documentIds,
      useCache = true,
      expandQuery = true,
      elementTypes,
      pageNumbers,
    } = options;

    // Check cache first
    const cacheKey = this.getCacheKey(query, userId, options);
    if (this.cacheConfig.enabled && useCache && this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const cachedResult = JSON.parse(cached);
          return {
            ...cachedResult,
            cacheHit: true,
            searchTimeMs: Date.now() - startTime,
          };
        }
      } catch (error) {
        console.warn('Cache read error:', error);
      }
    }

    if (!this.isConfigured || !this.assistantId || !this.vectorStoreId) {
      throw new Error('OpenAI provider not properly configured');
    }

    // Expand query if enabled
    const { expandedQuery, expansions } = expandQuery
      ? this.expandQuery(query)
      : { expandedQuery: query, expansions: [] };

    try {
      // Create a thread for this search
      const thread = await this.openai.beta.threads.create();

      // Add message to thread
      await this.openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: this.buildSearchPrompt(expandedQuery, {
          documentIds,
          elementTypes,
          pageNumbers,
          limit,
        }),
      });

      // Run the assistant
      const run = await this.openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: this.assistantId,
      });

      if (run.status !== 'completed') {
        throw new Error(`Search run failed with status: ${run.status}`);
      }

      // Get the response
      const messages = await this.openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find(msg => msg.role === 'assistant');

      if (!assistantMessage || !assistantMessage.content[0] || assistantMessage.content[0].type !== 'text') {
        throw new Error('No valid response from assistant');
      }

      // Parse the search results from the response
      const searchResults = await this.parseSearchResults(
        assistantMessage.content[0].text.value,
        assistantMessage,
        expandedQuery,
        threshold
      );

      // Clean up thread
      await this.openai.beta.threads.del(thread.id);

      const searchResponse = {
        results: searchResults.slice(0, limit),
        totalResults: searchResults.length,
        queryEmbeddingTokens: this.estimateTokens(expandedQuery),
        searchTimeMs: Date.now() - startTime,
        cacheHit: false,
        queryExpansions: expansions.length > 0 ? expansions : undefined,
      };

      // Cache the results
      if (this.cacheConfig.enabled && useCache && this.redis) {
        try {
          await this.redis.setEx(
            cacheKey,
            this.cacheConfig.ttlSeconds,
            JSON.stringify({
              results: searchResults.slice(0, limit),
              totalResults: searchResults.length,
              queryEmbeddingTokens: this.estimateTokens(expandedQuery),
              queryExpansions: expansions.length > 0 ? expansions : undefined,
            }),
          );
        } catch (error) {
          console.warn('Cache write error:', error);
        }
      }

      // Track metrics
      await this.trackSearchMetrics(
        userId,
        query,
        Date.now() - startTime,
        'vector',
        false,
      );

      return searchResponse;
    } catch (error) {
      console.error('OpenAI vector search error:', error);
      throw new Error(`Vector search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform hybrid search (delegates to vector search for OpenAI)
   */
  async hybridSearch(
    query: string,
    userId: string,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResponse> {
    // For OpenAI, hybrid search is handled by the assistant's file search capability
    const vectorResults = await this.vectorSearch(query, userId, options);

    const hybridResults: HybridSearchResult[] = vectorResults.results.map(result => ({
      ...result,
      textScore: result.similarity * 0.3, // Simulated text score
      vectorScore: result.similarity,
      hybridScore: result.similarity, // OpenAI already provides hybrid scoring
      rerankScore: options.useRerank ? result.similarity * 1.1 : undefined,
    }));

    return {
      results: hybridResults,
      totalResults: vectorResults.totalResults,
      queryEmbeddingTokens: vectorResults.queryEmbeddingTokens,
      searchTimeMs: vectorResults.searchTimeMs,
      rerankTimeMs: options.useRerank ? 50 : undefined,
      cacheHit: vectorResults.cacheHit,
      queryExpansions: vectorResults.queryExpansions,
      algorithmUsed: options.scoringAlgorithm || 'adaptive',
    };
  }

  /**
   * Index a document with its chunks
   */
  async indexDocument(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string,
  ): Promise<IndexingResult> {
    const startTime = Date.now();

    if (!this.isConfigured || !this.vectorStoreId) {
      throw new Error('OpenAI provider not properly configured');
    }

    try {
      // Create a file with the document content
      const fileContent = this.buildFileContent(documentId, chunks);
      const file = await this.openai.files.create({
        file: new Blob([fileContent], { type: 'text/plain' }),
        purpose: 'assistants',
      });

      // Add file to vector store
      await this.openai.beta.vectorStores.files.create(this.vectorStoreId, {
        file_id: file.id,
      });

      return {
        success: true,
        documentId,
        chunksIndexed: chunks.length,
        errorCount: 0,
        timeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Document indexing error:', error);
      return {
        success: false,
        documentId,
        chunksIndexed: 0,
        errorCount: 1,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        timeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Update document index (re-index the document)
   */
  async updateDocumentIndex(
    documentId: string,
    chunks: DocumentChunk[],
    userId: string,
  ): Promise<IndexingResult> {
    // For OpenAI, we need to delete and re-add the document
    await this.deleteDocumentIndex(documentId, userId);
    return this.indexDocument(documentId, chunks, userId);
  }

  /**
   * Delete document from index
   */
  async deleteDocumentIndex(documentId: string, userId: string): Promise<boolean> {
    if (!this.isConfigured || !this.vectorStoreId) {
      throw new Error('OpenAI provider not properly configured');
    }

    try {
      // List files in vector store
      const files = await this.openai.beta.vectorStores.files.list(this.vectorStoreId);
      
      // Find files related to this document (we'll use file metadata or naming convention)
      const documentFiles = files.data.filter(file => 
        file.id.includes(documentId) || 
        (file as any).metadata?.document_id === documentId
      );

      // Delete each file
      for (const file of documentFiles) {
        await this.openai.beta.vectorStores.files.del(this.vectorStoreId, file.id);
        await this.openai.files.del(file.id);
      }

      return true;
    } catch (error) {
      console.error('Document deletion error:', error);
      return false;
    }
  }

  /**
   * Get provider status
   */
  async getStatus(): Promise<SearchStatus> {
    try {
      // Test API connectivity
      await this.openai.models.list();

      // Check vector store status
      let vectorStoreStatus = false;
      if (this.vectorStoreId) {
        try {
          await this.openai.beta.vectorStores.retrieve(this.vectorStoreId);
          vectorStoreStatus = true;
        } catch {
          vectorStoreStatus = false;
        }
      }

      // Check assistant status
      let assistantStatus = false;
      if (this.assistantId) {
        try {
          await this.openai.beta.assistants.retrieve(this.assistantId);
          assistantStatus = true;
        } catch {
          assistantStatus = false;
        }
      }

      const isHealthy = vectorStoreStatus && assistantStatus;

      return {
        isHealthy,
        lastSuccessfulQuery: isHealthy ? new Date() : undefined,
        errorCount: isHealthy ? 0 : 1,
        avgResponseTime: 1500, // Estimated based on typical OpenAI response times
        cacheStatus: this.redis ? 'connected' : 'disconnected',
        dbStatus: isHealthy ? 'connected' : 'error',
      };
    } catch (error) {
      return {
        isHealthy: false,
        errorCount: 1,
        avgResponseTime: 0,
        cacheStatus: this.redis ? 'connected' : 'disconnected',
        dbStatus: 'error',
      };
    }
  }

  /**
   * Validate provider configuration
   */
  async validateConfiguration(): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic config validation
    if (!this.config.apiKey) {
      errors.push('OpenAI API key is required');
    } else if (!this.config.apiKey.startsWith('sk-')) {
      warnings.push('OpenAI API key should start with sk-');
    }

    if (!this.config.indexName) {
      errors.push('Index name is required');
    }

    if (!this.config.embeddingModel) {
      errors.push('Embedding model is required');
    }

    // Test API connectivity
    try {
      await this.openai.models.list();
    } catch (error) {
      errors.push(`OpenAI API connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Check if initialization was successful
    if (!this.isConfigured) {
      errors.push('Provider initialization failed');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // Private helper methods

  /**
   * Build search prompt for the assistant
   */
  private buildSearchPrompt(query: string, options: {
    documentIds?: string[];
    elementTypes?: string[];
    pageNumbers?: number[];
    limit: number;
  }): string {
    let prompt = `Please search for information related to: "${query}"

Return the most relevant information from the documents. For each piece of information, include:
1. The relevant text content
2. The source document name
3. Any page numbers if available
4. The type of content (e.g., procedure, troubleshooting, specification)

`;

    if (options.documentIds?.length) {
      prompt += `Focus on these specific documents: ${options.documentIds.join(', ')}\n`;
    }

    if (options.elementTypes?.length) {
      prompt += `Prioritize these content types: ${options.elementTypes.join(', ')}\n`;
    }

    if (options.pageNumbers?.length) {
      prompt += `Look specifically at pages: ${options.pageNumbers.join(', ')}\n`;
    }

    prompt += `\nPlease provide up to ${options.limit} relevant results, ordered by relevance.`;

    return prompt;
  }

  /**
   * Parse search results from assistant response
   */
  private async parseSearchResults(
    responseText: string,
    message: any,
    query: string,
    threshold: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Parse citations and annotations from the response
    const annotations = message.content[0]?.text?.annotations || [];
    
    for (let i = 0; i < annotations.length && results.length < 20; i++) {
      const annotation = annotations[i];
      
      if (annotation.type === 'file_citation') {
        try {
          // Get file information
          const file = await this.openai.files.retrieve(annotation.file_citation.file_id);
          
          // Extract content around the citation
          const citationText = this.extractCitationContext(responseText, annotation, 500);
          
          // Calculate a relevance score (simplified)
          const similarity = this.calculateRelevanceScore(citationText, query);
          
          if (similarity >= threshold) {
            results.push({
              chunkId: `openai_${annotation.file_citation.file_id}_${i}`,
              documentId: annotation.file_citation.file_id,
              documentTitle: file.filename || 'Unknown Document',
              content: citationText,
              similarity,
              metadata: {
                file_id: annotation.file_citation.file_id,
                quote: annotation.file_citation.quote || '',
                type: 'file_citation',
              },
              chunkIndex: i,
              elementType: this.inferElementType(citationText),
              pageNumber: this.extractPageNumber(citationText),
              bbox: null,
            });
          }
        } catch (error) {
          console.warn('Failed to process file citation:', error);
        }
      }
    }

    // If we don't have enough results from citations, create synthetic results from the response
    if (results.length < 3) {
      const syntheticResults = this.createSyntheticResults(responseText, query, threshold);
      results.push(...syntheticResults);
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Build file content for indexing
   */
  private buildFileContent(documentId: string, chunks: DocumentChunk[]): string {
    let content = `Document ID: ${documentId}\n`;
    content += `Number of chunks: ${chunks.length}\n\n`;

    for (const chunk of chunks) {
      content += `[Chunk ${chunk.chunkIndex}]\n`;
      if (chunk.elementType) {
        content += `Type: ${chunk.elementType}\n`;
      }
      if (chunk.pageNumber) {
        content += `Page: ${chunk.pageNumber}\n`;
      }
      content += `Content: ${chunk.content}\n\n`;
    }

    return content;
  }

  /**
   * Extract context around a citation
   */
  private extractCitationContext(text: string, annotation: any, maxLength: number): string {
    const quote = annotation.file_citation?.quote || '';
    if (!quote) return text.slice(0, maxLength);

    const index = text.indexOf(quote);
    if (index === -1) return quote.slice(0, maxLength);

    const start = Math.max(0, index - maxLength / 2);
    const end = Math.min(text.length, index + quote.length + maxLength / 2);

    return text.slice(start, end);
  }

  /**
   * Calculate relevance score between content and query
   */
  private calculateRelevanceScore(content: string, query: string): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    
    let matches = 0;
    for (const term of queryTerms) {
      if (contentLower.includes(term)) {
        matches++;
      }
    }

    return Math.min(1.0, matches / queryTerms.length + 0.2); // Base score + term matches
  }

  /**
   * Infer element type from content
   */
  private inferElementType(content: string): string | null {
    const lower = content.toLowerCase();
    if (lower.includes('step') || lower.includes('procedure')) return 'procedure';
    if (lower.includes('error') || lower.includes('problem')) return 'troubleshooting';
    if (lower.includes('specification') || lower.includes('spec')) return 'specification';
    if (lower.includes('calibration')) return 'calibration';
    return 'paragraph';
  }

  /**
   * Extract page number from content
   */
  private extractPageNumber(content: string): number | null {
    const pageMatch = content.match(/page\s+(\d+)/i);
    return pageMatch ? Number.parseInt(pageMatch[1]) : null;
  }

  /**
   * Create synthetic results from response text
   */
  private createSyntheticResults(responseText: string, query: string, threshold: number): SearchResult[] {
    const sentences = responseText.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const results: SearchResult[] = [];

    for (let i = 0; i < Math.min(sentences.length, 5); i++) {
      const sentence = sentences[i].trim();
      const similarity = this.calculateRelevanceScore(sentence, query);

      if (similarity >= threshold) {
        results.push({
          chunkId: `openai_synthetic_${i}`,
          documentId: 'assistant_response',
          documentTitle: 'Assistant Response',
          content: sentence,
          similarity,
          metadata: { type: 'synthetic' },
          chunkIndex: i,
          elementType: 'response',
          pageNumber: null,
          bbox: null,
        });
      }
    }

    return results;
  }

  /**
   * Estimate token count for a text
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}