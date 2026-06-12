-- Migration 012: Handoffs — evidence-backed handoff packets (data-mcp issue #9)
--
-- A handoff packet transfers work between team members WITH the investigation
-- context that normally dies at the boundary: what changed, what was tried,
-- what is assumed, what is blocked, and what the recipient must re-verify
-- before trusting the inherited context (the stale-investigation guard).
--
-- Scoped collection: carries owner_id and is covered by the same
-- member_owner_isolation RLS policy as the other scoped tables (see 011).
-- Idempotent — safe to re-apply.

CREATE TABLE IF NOT EXISTS handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) <= 500),
  to_member text NOT NULL CHECK (char_length(to_member) <= 100),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'completed', 'cancelled')),
  what_changed text CHECK (char_length(what_changed) <= 5000),
  tried jsonb DEFAULT '[]',
  assumptions jsonb DEFAULT '[]',
  blocked_on text CHECK (char_length(blocked_on) <= 2000),
  next_steps jsonb DEFAULT '[]',
  needs_verification jsonb DEFAULT '[]',
  recheck_by date,
  supersedes text CHECK (char_length(supersedes) <= 100),
  task_id text CHECK (char_length(task_id) <= 100),
  session_ids jsonb DEFAULT '[]',
  accepted_at timestamptz,
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}',
  owner_id text NOT NULL DEFAULT 'default',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs (status);
CREATE INDEX IF NOT EXISTS idx_handoffs_to_member ON handoffs (to_member);
CREATE INDEX IF NOT EXISTS idx_handoffs_owner_id ON handoffs (owner_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'handoffs_updated_at'
  ) THEN
    CREATE TRIGGER handoffs_updated_at BEFORE UPDATE ON handoffs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- === RLS: same member_owner_isolation contract as migration 011 ==========
-- Claim contract (must match scripts/mint-member-jwt.mjs):
--   role            = 'authenticated'
--   owner_id        = member's MEMORYOS_OWNER_ID
--   shared_owner_id = team's MEMORYOS_SHARED_OWNER_ID
-- Missing claims yield NULL and fail closed.

ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_owner_isolation ON handoffs;
CREATE POLICY member_owner_isolation ON handoffs
  FOR ALL TO authenticated
  USING (
    owner_id = (auth.jwt() ->> 'owner_id')
    OR owner_id = (auth.jwt() ->> 'shared_owner_id')
  )
  WITH CHECK (
    owner_id = (auth.jwt() ->> 'owner_id')
    OR owner_id = (auth.jwt() ->> 'shared_owner_id')
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON handoffs TO authenticated;
