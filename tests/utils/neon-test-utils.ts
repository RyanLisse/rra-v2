import type { EnhancedNeonApiClient, DatabaseOperationResult } from '@/lib/testing/neon-api-client';
import type { User, Session, RagDocument, DocumentChunk, DocumentEmbedding } from '@/lib/db/schema';

/**
 * Neon Test Utilities
 * Provides helper functions for database operations in tests using Neon branches
 */
export class NeonTestUtils {
  constructor(private neonClient: EnhancedNeonApiClient) {}

  /**
   * Set up basic test schema in a branch
   */
  async setupTestSchema(branchId: string): Promise<DatabaseOperationResult<void>> {
    const schemaSQL = `
      -- Ensure extensions are available
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS vector;
      
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'regular',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- RAG Documents table
      CREATE TABLE IF NOT EXISTS rag_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size INTEGER NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        status VARCHAR(50) DEFAULT 'uploaded',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Document Chunks table
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        index INTEGER NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Document Embeddings table
      CREATE TABLE IF NOT EXISTS document_embeddings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
        embedding VECTOR(1536), -- Default OpenAI embedding dimension
        embedding_text TEXT, -- Store as text for compatibility
        model VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Auth logs table for testing
      CREATE TABLE IF NOT EXISTS auth_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255),
        attempt_type VARCHAR(50),
        success BOOLEAN DEFAULT false,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Rate limit entries table
      CREATE TABLE IF NOT EXISTS rate_limit_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ip_address INET NOT NULL,
        endpoint VARCHAR(100) NOT NULL,
        attempt_count INTEGER DEFAULT 1,
        window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Performance metrics table
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        test_suite VARCHAR(100),
        operation VARCHAR(100),
        avg_duration_ms NUMERIC,
        max_duration_ms NUMERIC,
        success_rate NUMERIC,
        sample_size INTEGER,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_rag_documents_user_id ON rag_documents(user_id);
      CREATE INDEX IF NOT EXISTS idx_rag_documents_status ON rag_documents(status);
      CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_document_chunks_index ON document_chunks(document_id, index);
      CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk_id ON document_embeddings(chunk_id);
      CREATE INDEX IF NOT EXISTS idx_auth_logs_email ON auth_logs(email);
      CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON auth_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_rate_limit_ip_endpoint ON rate_limit_entries(ip_address, endpoint);
      CREATE INDEX IF NOT EXISTS idx_performance_metrics_operation ON performance_metrics(operation);
      
      -- Vector similarity search index (if using pgvector)
      CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `;

    return this.neonClient.executeTransaction(
      schemaSQL.split(';').filter(sql => sql.trim().length > 0),
      branchId
    );
  }

  /**
   * Seed basic reference data
   */
  async seedBasicData(branchId: string): Promise<DatabaseOperationResult<void>> {
    const seedSQL = [
      // Insert basic user types if needed
      `INSERT INTO users (id, email, name, type) VALUES 
       ('550e8400-e29b-41d4-a716-446655440001', 'admin@example.com', 'Test Admin', 'admin')
       ON CONFLICT (email) DO NOTHING`,
      
      // Insert basic test document statuses
      `-- Document status reference data seeded via schema`
    ];

    return this.neonClient.executeTransaction(seedSQL, branchId);
  }

  /**
   * Insert a test user
   */
  async insertUser(user: User, branchId: string): Promise<DatabaseOperationResult<any>> {
    const sql = `
      INSERT INTO users (id, email, name, type, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `;

    // For simplicity, using string interpolation (in production, use parameterized queries)
    const insertSQL = `
      INSERT INTO users (id, email, name, type, created_at, updated_at)
      VALUES ('${user.id}', '${user.email}', '${user.name}', '${user.type}', '${user.createdAt.toISOString()}', '${user.updatedAt.toISOString()}')
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        updated_at = EXCLUDED.updated_at
      RETURNING *
    `;

    return this.neonClient.executeSql(insertSQL, branchId);
  }

  /**
   * Insert a test session
   */
  async insertSession(session: Session, branchId: string): Promise<DatabaseOperationResult<any>> {
    const insertSQL = `
      INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at)
      VALUES ('${session.id}', '${session.userId}', '${session.token}', '${session.expiresAt.toISOString()}', '${session.createdAt.toISOString()}', '${session.updatedAt.toISOString()}')
      RETURNING *
    `;

    return this.neonClient.executeSql(insertSQL, branchId);
  }

  /**
   * Insert a test document
   */
  async insertDocument(document: RagDocument, branchId: string): Promise<DatabaseOperationResult<any>> {
    const metadataJson = JSON.stringify(document.metadata).replace(/'/g, "''");
    
    const insertSQL = `
      INSERT INTO rag_documents (id, user_id, name, original_name, mime_type, size, checksum, status, metadata, created_at, updated_at)
      VALUES ('${document.id}', '${document.userId}', '${document.name}', '${document.originalName}', '${document.mimeType}', ${document.size}, '${document.checksum}', '${document.status}', '${metadataJson}', '${document.createdAt.toISOString()}', '${document.updatedAt.toISOString()}')
      RETURNING *
    `;

    return this.neonClient.executeSql(insertSQL, branchId);
  }

  /**
   * Insert a test document chunk
   */
  async insertDocumentChunk(chunk: DocumentChunk, branchId: string): Promise<DatabaseOperationResult<any>> {
    const contentEscaped = chunk.content.replace(/'/g, "''");
    const metadataJson = JSON.stringify(chunk.metadata).replace(/'/g, "''");
    
    const insertSQL = `
      INSERT INTO document_chunks (id, document_id, content, index, metadata, created_at)
      VALUES ('${chunk.id}', '${chunk.documentId}', '${contentEscaped}', ${chunk.index}, '${metadataJson}', '${chunk.createdAt.toISOString()}')
      RETURNING *
    `;

    return this.neonClient.executeSql(insertSQL, branchId);
  }

  /**
   * Insert a test document embedding
   */
  async insertDocumentEmbedding(embedding: DocumentEmbedding, branchId: string): Promise<DatabaseOperationResult<any>> {
    const embeddingText = embedding.embedding.replace(/'/g, "''");
    
    const insertSQL = `
      INSERT INTO document_embeddings (id, chunk_id, embedding_text, model, created_at)
      VALUES ('${embedding.id}', '${embedding.chunkId}', '${embeddingText}', '${embedding.model}', '${embedding.createdAt.toISOString()}')
      RETURNING *
    `;

    return this.neonClient.executeSql(insertSQL, branchId);
  }

  /**
   * Insert rate limit entry
   */
  async insertRateLimitEntry(entry: any, branchId: string): Promise<DatabaseOperationResult<any>> {
    const insertSQL = `
      INSERT INTO rate_limit_entries (id, ip_address, endpoint, attempt_count, window_start, created_at)
      VALUES ('${entry.id}', '${entry.ipAddress}', '${entry.endpoint}', ${entry.attemptCount}, '${entry.windowStart.toISOString()}', '${entry.createdAt.toISOString()}')
      RETURNING *
    `;

    return this.neonClient.executeSql(insertSQL, branchId);
  }

  /**
   * Insert multiple users in batch
   */
  async insertUsers(users: User[], branchId: string): Promise<DatabaseOperationResult<any>> {
    const values = users.map(user => 
      `('${user.id}', '${user.email}', '${user.name}', '${user.type}', '${user.createdAt.toISOString()}', '${user.updatedAt.toISOString()}')`
    ).join(', ');

    const insertSQL = `
      INSERT INTO users (id, email, name, type, created_at, updated_at)
      VALUES ${values}
      ON CONFLICT (email) DO NOTHING
      RETURNING *
    `;

    return this.neonClient.executeSql(insertSQL, branchId);
  }

  /**
   * Insert complete test dataset
   */
  async insertTestDataSet(dataset: {
    users: User[];
    sessions: Session[];
    documents: RagDocument[];
    chunks: DocumentChunk[];
    embeddings: DocumentEmbedding[];
  }, branchId: string): Promise<{
    users: DatabaseOperationResult<any>;
    sessions: DatabaseOperationResult<any>;
    documents: DatabaseOperationResult<any>;
    chunks: DatabaseOperationResult<any>;
    embeddings: DatabaseOperationResult<any>;
  }> {
    // Insert in dependency order
    const usersResult = await this.insertUsers(dataset.users, branchId);
    
    // Insert sessions
    const sessionsSql = dataset.sessions.map(session =>
      `INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at) 
       VALUES ('${session.id}', '${session.userId}', '${session.token}', '${session.expiresAt.toISOString()}', '${session.createdAt.toISOString()}', '${session.updatedAt.toISOString()}')`
    );
    const sessionsResult = await this.neonClient.executeTransaction(sessionsSql, branchId);

    // Insert documents
    const documentsResult = await this.insertDocuments(dataset.documents, branchId);

    // Insert chunks
    const chunksResult = await this.insertDocumentChunks(dataset.chunks, branchId);

    // Insert embeddings
    const embeddingsResult = await this.insertDocumentEmbeddings(dataset.embeddings, branchId);

    return {
      users: usersResult,
      sessions: sessionsResult,
      documents: documentsResult,
      chunks: chunksResult,
      embeddings: embeddingsResult
    };
  }

  /**
   * Insert multiple documents
   */
  private async insertDocuments(documents: RagDocument[], branchId: string): Promise<DatabaseOperationResult<any>> {
    const insertStatements = documents.map(doc => {
      const metadataJson = JSON.stringify(doc.metadata).replace(/'/g, "''");
      return `INSERT INTO rag_documents (id, user_id, name, original_name, mime_type, size, checksum, status, metadata, created_at, updated_at)
              VALUES ('${doc.id}', '${doc.userId}', '${doc.name}', '${doc.originalName}', '${doc.mimeType}', ${doc.size}, '${doc.checksum}', '${doc.status}', '${metadataJson}', '${doc.createdAt.toISOString()}', '${doc.updatedAt.toISOString()}')`;
    });

    return this.neonClient.executeTransaction(insertStatements, branchId);
  }

  /**
   * Insert multiple document chunks
   */
  private async insertDocumentChunks(chunks: DocumentChunk[], branchId: string): Promise<DatabaseOperationResult<any>> {
    const insertStatements = chunks.map(chunk => {
      const contentEscaped = chunk.content.replace(/'/g, "''");
      const metadataJson = JSON.stringify(chunk.metadata).replace(/'/g, "''");
      return `INSERT INTO document_chunks (id, document_id, content, index, metadata, created_at)
              VALUES ('${chunk.id}', '${chunk.documentId}', '${contentEscaped}', ${chunk.index}, '${metadataJson}', '${chunk.createdAt.toISOString()}')`;
    });

    return this.neonClient.executeTransaction(insertStatements, branchId);
  }

  /**
   * Insert multiple document embeddings
   */
  private async insertDocumentEmbeddings(embeddings: DocumentEmbedding[], branchId: string): Promise<DatabaseOperationResult<any>> {
    const insertStatements = embeddings.map(embedding => {
      const embeddingText = embedding.embedding.replace(/'/g, "''");
      return `INSERT INTO document_embeddings (id, chunk_id, embedding_text, model, created_at)
              VALUES ('${embedding.id}', '${embedding.chunkId}', '${embeddingText}', '${embedding.model}', '${embedding.createdAt.toISOString()}')`;
    });

    return this.neonClient.executeTransaction(insertStatements, branchId);
  }

  /**
   * Clean up test data from a branch
   */
  async cleanupTestData(branchId: string): Promise<DatabaseOperationResult<void>> {
    const cleanupSQL = [
      'DELETE FROM document_embeddings',
      'DELETE FROM document_chunks',
      'DELETE FROM rag_documents',
      'DELETE FROM sessions',
      'DELETE FROM rate_limit_entries',
      'DELETE FROM auth_logs',
      'DELETE FROM performance_metrics',
      'DELETE FROM users WHERE email LIKE \'%@example.com\' OR email LIKE \'%test%\''
    ];

    return this.neonClient.executeTransaction(cleanupSQL, branchId);
  }

  /**
   * Get test data statistics
   */
  async getTestDataStats(branchId: string): Promise<DatabaseOperationResult<any>> {
    const statsSQL = `
      SELECT 
        (SELECT COUNT(*) FROM users) as user_count,
        (SELECT COUNT(*) FROM sessions) as session_count,
        (SELECT COUNT(*) FROM rag_documents) as document_count,
        (SELECT COUNT(*) FROM document_chunks) as chunk_count,
        (SELECT COUNT(*) FROM document_embeddings) as embedding_count,
        (SELECT COUNT(*) FROM auth_logs) as auth_log_count,
        (SELECT COUNT(*) FROM rate_limit_entries) as rate_limit_count,
        (SELECT COUNT(*) FROM performance_metrics) as metric_count
    `;

    return this.neonClient.executeSql(statsSQL, branchId);
  }

  /**
   * Verify data integrity
   */
  async verifyDataIntegrity(branchId: string): Promise<DatabaseOperationResult<any>> {
    const integritySQL = `
      WITH integrity_checks AS (
        SELECT 
          'orphaned_sessions' as check_type,
          COUNT(*) as count
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE u.id IS NULL
        
        UNION ALL
        
        SELECT 
          'orphaned_documents' as check_type,
          COUNT(*) as count
        FROM rag_documents d
        LEFT JOIN users u ON d.user_id = u.id
        WHERE u.id IS NULL
        
        UNION ALL
        
        SELECT 
          'orphaned_chunks' as check_type,
          COUNT(*) as count
        FROM document_chunks c
        LEFT JOIN rag_documents d ON c.document_id = d.id
        WHERE d.id IS NULL
        
        UNION ALL
        
        SELECT 
          'orphaned_embeddings' as check_type,
          COUNT(*) as count
        FROM document_embeddings e
        LEFT JOIN document_chunks c ON e.chunk_id = c.id
        WHERE c.id IS NULL
      )
      SELECT 
        check_type,
        count,
        CASE WHEN count = 0 THEN 'PASS' ELSE 'FAIL' END as status
      FROM integrity_checks
      ORDER BY check_type
    `;

    return this.neonClient.executeSql(integritySQL, branchId);
  }
}