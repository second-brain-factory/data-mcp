-- Migration 013: Per-member token revocation — jti claim + denylist (issue #10)
--
-- Hardened mode (011/012) gives each member a long-lived JWT; before this
-- migration, revoking one member meant rotating the project JWT secret,
-- killing every member's token at once. This migration adds standard JWT
-- revocation: tokens minted by scripts/mint-member-jwt.mjs now carry a
-- unique `jti` claim, and a service_role-only denylist table is consulted
-- by every RLS policy. Revoking a member = one INSERT (see
-- scripts/revoke-member-jwt.mjs); takes effect on their next request.
--
-- Backwards compatible:
--   * Legacy tokens without a `jti` claim keep working (is_token_revoked
--     returns false for NULL) — they remain non-revocable until re-minted.
--   * service_role has BYPASSRLS — admin access unaffected.
--   * Idempotent — safe to re-apply (DROP POLICY IF EXISTS + re-create,
--     CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION).
--
-- Prerequisites: 011_rls_owner_isolation.sql, 012_handoffs.sql.
--
-- Claim contract (must match scripts/mint-member-jwt.mjs):
--   role            = 'authenticated'
--   owner_id        = member's MEMORYOS_OWNER_ID
--   shared_owner_id = team's MEMORYOS_SHARED_OWNER_ID
--   jti             = unique token id (uuid) — NEW in this migration

-- === Denylist table (service_role only) ==================================
-- RLS enabled with NO policies for `authenticated`: members can neither
-- read nor write the denylist, so there is no leak of who was revoked.
-- service_role bypasses RLS and manages rows via revoke-member-jwt.mjs.

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        text PRIMARY KEY,
  owner_id   text,
  reason     text,
  revoked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
-- Defense in depth: even if a future migration carelessly grants broad
-- table privileges, RLS-without-policy still denies authenticated.
REVOKE ALL ON revoked_tokens FROM authenticated, anon;

-- === Denylist check (SECURITY DEFINER) ====================================
-- Members cannot SELECT the table directly, so the RLS predicate goes
-- through this definer function. STABLE: one indexed PK lookup, cached
-- within a statement. NULL jti (legacy tokens) => not revoked.

CREATE OR REPLACE FUNCTION is_token_revoked(check_jti text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT check_jti IS NOT NULL
     AND EXISTS (SELECT 1 FROM revoked_tokens WHERE jti = check_jti);
$$;

REVOKE ALL ON FUNCTION is_token_revoked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_token_revoked(text) TO authenticated;

-- === Scoped collections: re-emit member_owner_isolation with denylist ====
-- Same idempotent DROP+CREATE FOREACH pattern as 011 (+ handoffs from 012).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'knowledge', 'decisions', 'sessions', 'goals', 'tasks', 'contacts',
    'knowledge_links', 'handoffs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS member_owner_isolation ON %I', t);
    EXECUTE format($pol$
      CREATE POLICY member_owner_isolation ON %I
        FOR ALL TO authenticated
        USING (
          (
            owner_id = (auth.jwt() ->> 'owner_id')
            OR owner_id = (auth.jwt() ->> 'shared_owner_id')
          )
          AND NOT is_token_revoked(auth.jwt() ->> 'jti')
        )
        WITH CHECK (
          (
            owner_id = (auth.jwt() ->> 'owner_id')
            OR owner_id = (auth.jwt() ->> 'shared_owner_id')
          )
          AND NOT is_token_revoked(auth.jwt() ->> 'jti')
        )
    $pol$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;

-- === Unscoped collections: re-emit team_global_access with denylist ======

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
        USING (NOT is_token_revoked(auth.jwt() ->> 'jti'))
        WITH CHECK (NOT is_token_revoked(auth.jwt() ->> 'jti'))
    $pol$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated', t);
  END LOOP;
END $$;
