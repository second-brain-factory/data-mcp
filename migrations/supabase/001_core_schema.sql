-- Migration 001: Core schema (knowledge, decisions, sessions)

CREATE TABLE IF NOT EXISTS knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('fact', 'knowledge', 'pattern', 'insight', 'lesson', 'reference')),
  title text NOT NULL CHECK (char_length(title) <= 500),
  content text NOT NULL CHECK (char_length(content) <= 50000),
  summary text CHECK (char_length(summary) <= 2000),
  tags text[] DEFAULT '{}',
  source text CHECK (char_length(source) <= 500),
  confidence float DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  last_validated_at timestamptz DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'C')
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_search ON knowledge USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge (type);
CREATE INDEX IF NOT EXISTS idx_knowledge_last_validated ON knowledge (last_validated_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge USING gin(tags);

CREATE TABLE IF NOT EXISTS decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) <= 500),
  context text CHECK (char_length(context) <= 5000),
  options_considered text[] NOT NULL,
  chosen_option text NOT NULL CHECK (char_length(chosen_option) <= 500),
  rationale text CHECK (char_length(rationale) <= 5000),
  outcome text CHECK (char_length(outcome) <= 5000),
  tags text[] DEFAULT '{}',
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(context, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(chosen_option, '')), 'B')
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decisions_search ON decisions USING gin(search_vector);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) <= 500),
  summary text NOT NULL CHECK (char_length(summary) <= 10000),
  session_date date DEFAULT CURRENT_DATE,
  skills_used text[] DEFAULT '{}',
  files_changed text[] DEFAULT '{}',
  decisions_made jsonb DEFAULT '[]',
  duration_minutes int,
  task_id text CHECK (char_length(task_id) <= 100),
  branch text CHECK (char_length(branch) <= 200),
  patterns_learned jsonb DEFAULT '[]',
  knowledge_created int DEFAULT 0,
  knowledge_updated int DEFAULT 0,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER knowledge_updated_at BEFORE UPDATE ON knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER decisions_updated_at BEFORE UPDATE ON decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
