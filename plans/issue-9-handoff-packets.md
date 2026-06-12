# issue-9 (data-mcp): Evidence-backed handoff packets

GitHub issue: https://github.com/second-brain-factory/data-mcp/issues/9

## Problem

data-mcp's team mode has no first-class handoff primitive. The thread that inspired the Team Second Brain work (anthropics/claude-code#38536) names handoffs as the #1 pain. Today a handoff is an emergent behavior (shared task + status mutation) that carries zero investigation context: nothing records what was tried, what's assumed, what's blocked, or what the recipient must re-verify before trusting the inherited context (the stale-investigation failure mode).

## Task Classification
- Type: feature
- Scope mode: EXPANSION
- Required gates: vertical_slices, test_seams, review
- Merge policy: data-mcp → main direct merge authorized (standing constraint from this session lineage)
- Architecture doc gate: applies — docs/TEAM-SETUP.md + README tool table describe the public MCP surface

## Domain Language
- "scoped collection" — table with `owner_id text NOT NULL DEFAULT 'default'`, listed in `DEFAULT_SCOPED_COLLECTIONS` (owner-scope.ts:4-12), covered by `member_owner_isolation` RLS
- "owner_scope" — `'private' | 'shared'` pseudo-field stripped by OwnerScopeProxy before backend write
- "shared owner" — `MEMORYOS_SHARED_OWNER_ID`, default `'firma'`
- "handoff packet" — evidence-backed transfer record: what changed, tried, assumptions, blocked_on, next_steps, needs_verification, recheck_by, supersedes

## Architecture Alignment
- Source-of-truth docs: `docs/TEAM-SETUP.md` (team workflows), `README.md` (tool table, counts)
- Code sources checked: `src/tools/register.ts`, `src/tools/memory/task-*.ts`, `src/adapter/owner-scope.ts`, `migrations/supabase/011_rls_owner_isolation.sql`, `src/tools/setup/setup-{status,migrate}.ts`
- Alignment verdict: intentional-change-updates-docs
- Required doc updates: TEAM-SETUP.md handoff section, README tool table + counts (41→44), package.json description

## Interfaces and Test Seams
- `handoff_create` / `handoff_update` / `handoff_list` MCP tools — invariants: shared-by-default, private-to-other rejected, lifecycle timestamps — seam: MCP client over stdio (e2e) + registered tool handler with mock adapter (unit)
- `handoffs` RLS — invariant: member JWT cannot read another's private handoff via raw PostgREST — seam: live hardened e2e probe

## Approach

New scoped collection `handoffs` + 3 tools, following the task-tools convention exactly. One new capability on the adapter interface: `currentOwnerId?: string` (exposed by OwnerScopeProxy) so `handoff_create` can reject private-handoff-to-someone-else and `handoff_list` can resolve "me".

### Schema (migration `012_handoffs.sql` + PB mirror `009_handoffs.js`)
Table `handoffs`: id uuid PK, title (≤500, NOT NULL), to_member (≤100, NOT NULL), status (open|accepted|completed|cancelled, default open), what_changed (≤5000), tried jsonb [], assumptions jsonb [], blocked_on (≤2000), next_steps jsonb [], needs_verification jsonb [], recheck_by date, supersedes (≤100), task_id (≤100), session_ids jsonb [], accepted_at/completed_at timestamptz, metadata jsonb {}, owner_id text NOT NULL DEFAULT 'default', created_at/updated_at + trigger. Indexes: status, to_member.
RLS in same migration: `member_owner_isolation` policy (same block as 011) + GRANT.

### Tool semantics
- `handoff_create`: when `adapter.ownerScopeEnabled`, `owner_scope` defaults to `'shared'`; `owner_scope:'private'` with `to_member !== currentOwnerId` → validation error
- `handoff_update`: status transitions stamp `accepted_at` (→accepted) / `completed_at` (→completed); amendable packet fields; no-op guard like task_update
- `handoff_list`: filters to_member ('me' resolves to currentOwnerId when scoping on), status, task_id; readOnlyHint; newest-first

## Success Invariant
A recipient's `handoff_list({to_member:'me', status:'open'})` returns packets created by other members with all evidence fields intact, lifecycle transitions stamp timestamps, and private handoffs to self stay invisible to others at both the proxy seam (markdown e2e) and the database seam (hardened e2e). All pre-existing suites stay green.

## Vertical Slices

### Slice 1: handoffs collection + 3 tools working end-to-end on markdown
Type: AFK · Blocked by: None
User-visible outcome: alice creates a handoff for bob; bob lists/accepts/completes it; private-to-other rejected
Public interface: handoff_create/update/list via MCP
Test seam: unit (mock adapter, tool handlers) + team-e2e.mjs (stdio client, markdown backend)
Acceptance criteria:
- [ ] Migration 012 + PB 009 mirror written; `handoffs` in DEFAULT_SCOPED_COLLECTIONS, EXPECTED_COLLECTIONS, COLLECTION_SCHEMAS
- [ ] HandoffRecord type; 3 tools registered (44 total); currentOwnerId exposed on proxy + types
- [ ] handoff_create defaults shared; private+to_member≠self rejected with clear error
- [ ] handoff_update stamps accepted_at/completed_at; handoff_list filters to_member/status/task_id, 'me' resolution
- [ ] Unit tests green; team-e2e.mjs extended (count 44 + handoff lifecycle + privacy checks) and green

### Slice 2: Supabase + hardened verification
Type: AFK · Blocked by: Slice 1
User-visible outcome: same lifecycle on live Supabase; DB-level isolation proven
Public interface: same tools, supabase backend; raw PostgREST probe
Test seam: team-e2e-supabase.mjs (count 44), team-e2e-supabase-hardened.mjs (+handoff isolation probes), live project with 012 applied
Acceptance criteria:
- [ ] 012 applied to live e2e project (idempotent — applied twice)
- [ ] supabase e2e green with 44 tools; mvp-test-plan count NOT changed (runs against published 0.8.0 — guard via MVP_PKG_VERSION note or expected-count derivation)
- [ ] hardened e2e: bob's JWT reads alice's shared handoff, gets 0 rows for alice's private handoff via raw PostgREST

### Slice 3: docs + dist + ship
Type: AFK · Blocked by: Slice 2
User-visible outcome: documented workflow; npm-ready build
Acceptance criteria:
- [ ] TEAM-SETUP.md handoff workflow section; README tool table/counts; package.json description 41→44
- [ ] dist/ rebuilt (scratch dir → rsync), verify-dist PASS, typecheck clean

## Incident Regression Map
- 2026-05-11 RC incidents (setup_status/migrate/bootstrap): keep EXPECTED_COLLECTIONS + COLLECTION_SCHEMAS in sync — both updated in Slice 1; setup_bootstrap auto-includes 012 (reads migrations dir)
- mvp-test-plan.mjs asserts 41 tools against the PUBLISHED package — must not be bumped until next release; handle explicitly
- Tool-count assertions live in 3 e2e scripts + package.json description

## Risk-Triggered Gates
- success-invariant-check: always
- schema-migration-check: applies — new table; migration idempotent; setup tools synced; bootstrap concatenation automatic
- generated-artifact-check: N/A (no repo-generator surface in data-mcp)
- doc-alignment-check: applies — TEAM-SETUP/README
- async/identity/payment/email/ui: N/A

## Files Affected
- `migrations/supabase/012_handoffs.sql` — new table + RLS
- `migrations/pocketbase/009_handoffs.js` — PB mirror
- `src/adapter/types.ts` — `currentOwnerId?: string`
- `src/adapter/owner-scope.ts` — add 'handoffs' to scoped set; expose currentOwnerId
- `src/types/records.ts` — HandoffRecord
- `src/tools/memory/handoff-{create,update,list}.ts` — new tools
- `src/tools/register.ts` — register 3 tools
- `src/tools/setup/setup-status.ts`, `setup-migrate.ts` — collection lists
- `tests/handoff-tools.test.ts` — unit tests
- `scripts/team-e2e.mjs` — count 44 + lifecycle checks
- `scripts/team-e2e-supabase.mjs` — count 44
- `scripts/team-e2e-supabase-hardened.mjs` — handoff isolation probes
- `docs/TEAM-SETUP.md`, `README.md`, `package.json` — docs/description
- `dist/` — rebuilt

## Edge Cases
- Solo mode (no MEMORYOS_OWNER_ID): tools work as plain records; no scope validation; 'me' in handoff_list errors with guidance
- `supersedes` pointing at nonexistent id: stored as-is (freeform link, same convention as task_id/goal_id)
- status transition to same value: allowed, timestamps not re-stamped if already set
- handoff_update on another member's private handoff → RECORD_NOT_FOUND via proxy (existing behavior)

## Risks
- mvp-test-plan breaks if count bumped prematurely → don't touch it; it pins published version
- Live 012 application could disturb e2e project → idempotent DO-block pattern, applied twice to prove
- markdown backend stores dates as strings — no date validation server-side (consistent with due_date)

## Artifact Manifest
- `.pipeline/acceptance-trace.json`
- `.pipeline/test-evidence.json`
- `.pipeline/review-results.json`
