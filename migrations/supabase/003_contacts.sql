-- Migration 003: Contacts

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) <= 200),
  company text CHECK (char_length(company) <= 200),
  role text CHECK (char_length(role) <= 200),
  email text CHECK (char_length(email) <= 200),
  phone text CHECK (char_length(phone) <= 50),
  relationship text CHECK (relationship IN ('colleague', 'client', 'prospect', 'partner', 'other')),
  notes text CHECK (char_length(notes) <= 5000),
  tags text[] DEFAULT '{}',
  last_contact_date date,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(notes, '')), 'C')
  ) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts (name);

CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
