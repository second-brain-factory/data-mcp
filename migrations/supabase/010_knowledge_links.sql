-- Migration 010: Knowledge Links + pgvector embeddings
-- Adds graph-lite relationship system between MemoryOS entities

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column to knowledge
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS embedding vector(384);

-- 3. HNSW index for cosine similarity
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
  ON knowledge USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Knowledge links table
CREATE TABLE IF NOT EXISTS knowledge_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL DEFAULT 'default',

  source_type text NOT NULL,
  source_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  relation_type text NOT NULL,

  confidence numeric DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  notes text,
  auto_suggested boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT knowledge_links_source_type_check CHECK (source_type IN ('knowledge', 'decision', 'session', 'blog_post', 'prospect', 'agent_learning')),
  CONSTRAINT knowledge_links_target_type_check CHECK (target_type IN ('knowledge', 'decision', 'session', 'blog_post', 'prospect', 'agent_learning')),
  CONSTRAINT knowledge_links_relation_type_check CHECK (relation_type IN ('supports', 'contradicts', 'derived_from', 'example_of', 'supersedes', 'part_of', 'prerequisite')),
  CONSTRAINT knowledge_links_no_self_link CHECK (NOT (source_type = target_type AND source_id = target_id)),
  CONSTRAINT knowledge_links_unique_link UNIQUE (owner_id, source_type, source_id, target_type, target_id, relation_type)
);

-- 5. Indexes
CREATE INDEX idx_knowledge_links_source ON knowledge_links (owner_id, source_type, source_id);
CREATE INDEX idx_knowledge_links_target ON knowledge_links (owner_id, target_type, target_id);
CREATE INDEX idx_knowledge_links_relation ON knowledge_links (relation_type);

-- 6. RLS
ALTER TABLE knowledge_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_access" ON knowledge_links
  FOR ALL USING (owner_id = current_setting('app.owner_id', true) OR current_setting('app.owner_id', true) IS NULL);
