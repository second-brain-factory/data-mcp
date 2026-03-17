-- Migration 005: Prospects (CRM)

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) <= 200),
  email text CHECK (char_length(email) <= 200),
  company text CHECK (char_length(company) <= 200),
  role text CHECK (char_length(role) <= 200),
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing')),
  source text CHECK (char_length(source) <= 200),
  estimated_value int,
  next_action_type text CHECK (char_length(next_action_type) <= 100),
  next_followup_date date,
  last_contact_date date,
  notes text CHECK (char_length(notes) <= 10000),
  tags text[] DEFAULT '{}',
  linkedin_url text CHECK (char_length(linkedin_url) <= 500),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(notes, '')), 'C')
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects (stage);
CREATE INDEX IF NOT EXISTS idx_prospects_search ON prospects USING gin(search_vector);

CREATE TRIGGER prospects_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
