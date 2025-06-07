import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/lib/db/schema';

export class VectorSearch {
  constructor(private cohereClient: any) {}

  async search(params: {
    query: string;
    userId: string;
    limit?: number;
    threshold?: number;
    includeMetadata?: boolean;
    db: PostgresJsDatabase<typeof schema>;
  }) {
    const {
      query,
      userId,
      limit = 10,
      threshold = 0.5,
      includeMetadata = false,
      db,
    } = params;

    // Get user's documents
    const documents = await db.query.ragDocument.findMany({
      where: (doc, { eq }) => eq(doc.uploadedBy, userId),
      with: {
        chunks: {
          with: {
            embedding: true,
          },
        },
      },
    });

    // Flatten chunks with embeddings
    const allChunks = documents.flatMap((doc) =>
      doc.chunks.map((chunk) => ({
        ...chunk,
        document: {
          id: doc.id,
          title: doc.originalName,
          fileName: doc.fileName,
        },
      })),
    );

    // Mock similarity search - return chunks that contain query terms
    const queryTerms = query
      .toLowerCase()
      .split(' ')
      .filter((term) => term.length > 2);
    const results = allChunks
      .filter((chunk) => chunk.embedding)
      .map((chunk) => {
        const contentLower = chunk.content.toLowerCase();

        // Calculate a more realistic similarity score
        let matchScore = 0;
        for (const term of queryTerms) {
          if (contentLower.includes(term)) {
            matchScore += 1;
          } else {
            // Partial matching for similar words
            const words = contentLower.split(/\s+/);
            for (const word of words) {
              if (word.startsWith(term.slice(0, 3))) {
                matchScore += 0.5;
                break;
              }
            }
          }
        }

        const score =
          queryTerms.length > 0 ? matchScore / queryTerms.length : 0;

        return {
          id: chunk.id,
          content: chunk.content,
          score,
          document: chunk.document,
          chunkIndex: parseInt(chunk.chunkIndex),
          metadata: includeMetadata ? chunk.metadata : undefined,
        };
      })
      .filter((result) => result.score >= threshold * 0.5) // Be more lenient with threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return { results };
  }

  async searchWithReranking(params: {
    query: string;
    userId: string;
    limit?: number;
    rerankTopK?: number;
    db: PostgresJsDatabase<typeof schema>;
  }) {
    const { query, userId, limit = 20, rerankTopK = 5, db } = params;

    // First get more results
    const initialResults = await this.search({
      query,
      userId,
      limit,
      db,
    });

    // Mock reranking - boost scores for top results
    const rerankedResults = initialResults.results
      .slice(0, rerankTopK)
      .map((result) => ({
        ...result,
        rerankScore: result.score * 1.2, // Mock rerank score boost
      }));

    return { results: rerankedResults };
  }
}

export class CohereClient {
  async embed(texts: string[]) {
    // Mock embedding generation
    return texts.map(() =>
      Array(1024)
        .fill(0)
        .map(() => Math.random()),
    );
  }

  async rerank(query: string, documents: string[]) {
    // Mock reranking
    return documents.map((doc, index) => ({
      document: doc,
      relevanceScore: 1 - index * 0.1, // Decreasing scores
    }));
  }
}
