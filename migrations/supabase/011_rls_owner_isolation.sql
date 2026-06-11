-- Migration 011: RLS owner isolation — per-member credentials (hardened mode)
--
-- Closes the shared service-key bypass (data-mcp issue #5): with this
-- migration applied, a member connecting with the project's ANON key plus a
-- member JWT (see scripts/mint-member-jwt.mjs) is scoped BY THE DATABASE to
-- their own private rows + the team's shared rows. Direct PostgREST queries
-- can no longer read another member's private records.
--
-- Backwards compatible:
--   * service_role has BYPASSRLS — existing SB_SUPABASE_KEY (service key)
--     configs keep full access with zero changes. Admin scripts, migrations,
--     and the existing e2e suites are unaffected.
--   * Idempotent — safe to re-apply (DROP POLICY IF EXISTS + re-create).
--
-- Prerequisite: 009_align_to_production.sql (owner_id columns must exist).
--
-- Claim contract (must match scripts/mint-member-jwt.mjs):
--   role            = 'authenticated'      (PostgREST role switch)
--   owner_id        = member's MEMORYOS_OWNER_ID
--   shared_owner_id = team's MEMORYOS_SHARED_OWNER_ID

-- === Scoped collections: private-or-shared row access ===================
-- auth.jwt() returns the verified JWT claims; missing claims yield NULL and
-- NULL = anything is false, so a malformed/clamless JWT fails closed.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'knowledge', 'decisions', 'sessions', 'goals', 'tasks', 'contacts',
    'knowledge_links'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS member_owner_isolation ON %I', t);
    EXECUTE format($pol$
      CREATE POLICY member_owner_isolation ON %I
        FOR ALL TO authenticated
        USING (
          owner_id = (auth.jwt() ->> 'owner_id')
          OR owner_id = (auth.jwt() ->> 'shared_owner_id')
        )
        WITH CHECK (
          owner_id = (auth.jwt() ->> 'owner_id')
          OR owner_id = (auth.jwt() ->> 'shared_owner_id')
        )
    $pol$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

-- Drop the dead app.owner_id policy from 010 (never wired to any client;
-- superseded by member_owner_isolation above).
DROP POLICY IF EXISTS "owner_all_access" ON knowledge_links;

-- === Unscoped collections: team-global for any authenticated member ======

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'entity_aliases', 'settings', 'prospects', 'blog_posts', 'email_queue',
    'content_calendar', 'newsletter_subscribers', 'affiliates'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS team_global_access ON %I', t);
    EXECUTE format($pol$
      CREATE POLICY team_global_access ON %I
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
    $pol$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

-- Sequences (uuid PKs don't need them, but GRANT USAGE is harmless and
-- covers any serial columns added later in this schema's lineage).
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
