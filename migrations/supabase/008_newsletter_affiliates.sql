-- Migration 008: Newsletter subscribers and affiliates

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (char_length(email) <= 200),
  name text CHECK (char_length(name) <= 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  source text CHECK (char_length(source) <= 200),
  tags text[] DEFAULT '{}',
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON newsletter_subscribers (status);

CREATE TABLE IF NOT EXISTS affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) <= 200),
  email text NOT NULL UNIQUE CHECK (char_length(email) <= 200),
  code text NOT NULL UNIQUE CHECK (char_length(code) <= 100),
  commission_rate float NOT NULL DEFAULT 0.20 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'terminated')),
  total_earned_cents int NOT NULL DEFAULT 0,
  total_paid_cents int NOT NULL DEFAULT 0,
  stripe_account_id text CHECK (char_length(stripe_account_id) <= 200),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates (status);
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON affiliates (code);

CREATE TRIGGER newsletter_subscribers_updated_at BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER affiliates_updated_at BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
