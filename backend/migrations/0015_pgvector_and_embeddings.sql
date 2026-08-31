-- Migration 0015: pgvector extension and dense embeddings (F-031, P1)
-- Safe guarded execution: enables pgvector if installed on the host/cluster,
-- adds embedding column and HNSW vector index for Reciprocal Rank Fusion.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension is not installed in PostgreSQL cluster; continuing in sparse/trigram mode.';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector(384);
    
    -- HNSW Index for sub-millisecond approximate nearest neighbor cosine search
    CREATE INDEX IF NOT EXISTS idx_products_embedding_hnsw
      ON products USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  END IF;
END $$;
