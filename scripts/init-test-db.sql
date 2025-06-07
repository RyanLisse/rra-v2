-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Set up permissions
GRANT ALL PRIVILEGES ON DATABASE test_db TO test;
GRANT CREATE ON SCHEMA public TO test;

-- Optimize for testing
ALTER DATABASE test_db SET work_mem = '16MB';
ALTER DATABASE test_db SET maintenance_work_mem = '128MB';
ALTER DATABASE test_db SET effective_cache_size = '512MB';
ALTER DATABASE test_db SET random_page_cost = 1.1;
ALTER DATABASE test_db SET effective_io_concurrency = 200;

-- Create a function to check if pgvector is properly installed
CREATE OR REPLACE FUNCTION check_pgvector_installed()
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
    );
END;
$$ LANGUAGE plpgsql;

-- Log the pgvector installation status
DO $$
BEGIN
    IF check_pgvector_installed() THEN
        RAISE NOTICE 'pgvector extension is properly installed';
    ELSE
        RAISE EXCEPTION 'pgvector extension failed to install';
    END IF;
END;
$$;