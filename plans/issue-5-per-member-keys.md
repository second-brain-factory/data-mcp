# issue-5 (data-mcp): Per-member credentials on Supabase — close the shared service-key bypass

## Problem
Supabase team mode enforces scoping only at the MCP layer. Every member holds
the service role key; direct PostgREST queries see all rows including other
members' private records. Proven by `scripts/mvp-isolation-supabase.mjs` final
check (passes-as-expected today).

## Task Classification
- Type: feature | Scope: EXPANSION
- Gates: vertical_slices, test_seams, review, doc-alignment
- Merge: direct to data-mcp main (standing authorization)

## Domain Language
- "Hardened mode": member JWT + anon key instead of service key
- "Scoped collections": knowledge, decisions, sessions, goals, tasks, contacts, knowledge_links
- OwnerScopeProxy stays — RLS is defense in depth, not a replacement

## Approach
PostgREST derives the Postgres role from the JWT `role` claim. A member JWT
signed with the project JWT secret, `role: "authenticated"` + custom claims
`owner_id`/`shared_owner_id`, is subject to RLS. The service_role role has
BYPASSRLS, so existing service-key configs are untouched.

## Success Invariant
With member JWTs: full team contract passes through MCP AND direct PostgREST
with member A's JWT cannot read member B's private rows (fails closed).
Without member JWTs: zero behavior change.

## Vertical Slices
### Slice 1: Migration 011 — RLS owner isolation
- `migrations/supabase/011_rls_owner_isolation.sql`
- Enable RLS on 7 scoped tables; policy: `owner_id = auth.jwt()->>'owner_id' OR owner_id = auth.jwt()->>'shared_owner_id'` (FOR ALL, USING + WITH CHECK)
- Unscoped tables: RLS enabled with `USING (true)` for authenticated (team-global)
- Explicit GRANTs to authenticated
- Replace 010's dead `app.owner_id` policy on knowledge_links with the JWT one
- Test seam: live SQL apply to data-mcp-e2e project + REST probes

### Slice 2: Adapter hardened mode
- `src/config.ts`: `SB_SUPABASE_ANON_KEY` + `SB_SUPABASE_MEMBER_JWT` accepted as alternative to `SB_SUPABASE_KEY`; precedence: member JWT wins when both present
- `src/adapter/supabase.ts` + factory: client created with anon key + `Authorization: Bearer <member JWT>` global header
- Test seam: unit tests on config resolution; live E2E

### Slice 3: JWT minting script
- `scripts/mint-member-jwt.mjs` — HS256 via node:crypto (no new deps); claims: role=authenticated, owner_id, shared_owner_id, iss=data-mcp, exp (default 1y, flag-overridable)
- Test seam: unit test decodes + verifies signature

### Slice 4: Hardened E2E + docs
- `scripts/team-e2e-supabase-hardened.mjs`: mints two member JWTs, runs core contract through MCP, then direct-REST cross-member probe must FAIL closed; service-key path still full-access
- TEAM-SETUP: "Hardened mode" section; security model + decision table updated
- README caveat updated

## Risk-Triggered Gates
- schema-migration-check: applies — migration must be additive/idempotent, safe on existing projects; service role unaffected
- identity-routing-check: applies — JWT claims become identity; mint script must bind owner_id correctly
- doc-alignment-check: applies — TEAM-SETUP/README same PR

## Files Affected
- migrations/supabase/011_rls_owner_isolation.sql (new)
- src/config.ts, src/adapter/supabase.ts, src/adapter/factory.ts
- scripts/mint-member-jwt.mjs (new), scripts/team-e2e-supabase-hardened.mjs (new)
- tests/config-hardened.test.ts (new), tests/mint-member-jwt.test.ts (new)
- docs/TEAM-SETUP.md, README.md, dist/ (rebuild)

## Acceptance Criteria
- [ ] AC1: member-JWT config boots adapter, full MCP team contract passes live
- [ ] AC2: direct REST member A JWT → B's private rows: 0 rows/denied
- [ ] AC3: direct REST member JWT → shared rows: visible
- [ ] AC4: service-key config unchanged (existing e2e suites green)
- [ ] AC5: migration idempotent (re-apply clean)
- [ ] AC6: docs updated (hardened mode section + security table)

## Edge Cases
- JWT missing claims → policies see NULL → no private rows match (fail closed) ✓
- Both key sets present → member JWT wins (explicit precedence, documented)
- Migration on project without 009 owner_id column → fails loudly (documented prereq)
- anon key user with no JWT → anon role, no policy grants → fail closed

## Risks
- Enabling RLS on shared e2e project could break CI → service_role has BYPASSRLS, CI uses service key; verified by running existing suites after apply
- Supabase default grants vary → migration includes explicit GRANTs
