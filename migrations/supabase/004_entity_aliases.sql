-- Migration 004: Entity aliases + settings

CREATE TABLE IF NOT EXISTS entity_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical text NOT NULL CHECK (char_length(canonical) <= 100),
  alias text NOT NULL CHECK (char_length(alias) <= 200),
  created_at timestamptz DEFAULT now(),
  UNIQUE (canonical, alias)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical ON entity_aliases (canonical);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases (alias);

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (char_length(key) <= 100),
  value text,
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
