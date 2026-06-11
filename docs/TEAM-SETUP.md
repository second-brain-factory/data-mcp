# Team Setup Runbook

How to run one shared Second Brain for a small team (example: a team of 3 —
Alice, Bob, and Carol) with `@iwo-szapar/data-mcp`. Covers both supported
team backends: **Supabase** (shared Postgres project — recommended) and
**markdown** (shared git repo — lightweight option).

## Choose your backend

The MCP enforces private/shared scoping identically on both backends. What
differs is **where the data physically lives** — and that decides how much
the "private" scope actually protects:

| | **Supabase** (recommended for teams) | **Markdown** (lightweight) |
|---|---|---|
| Private records stored | DB rows in the cloud — never on teammates' disks | cleartext `.md` files **in every member's clone** |
| Private from teammates' AI assistants | **Yes, by default** — there is no local file to read; the MCP is the only practical door | **No** — a teammate's assistant has filesystem access to the clone and will read your private files when a question touches them |
| Deliberate bypass possible | service-key default: yes (shared key reads any row); **hardened mode: no** — per-member JWTs + RLS, the DB fails closed | yes — open the file |
| Infrastructure | a free Supabase project | none (a git repo) |
| Sync | live, concurrent | git pull/push ritual |
| Best for | teams with any privacy expectations between members | solo multi-machine use; teams treating ALL memory as effectively shared |

**Rule of thumb:** if "private" should mean *hidden from teammates'
assistants by default*, use Supabase. If the team treats the whole brain as
shared and private scope is just personal organization, markdown is fine.
For privacy enforced by the database even against deliberate bypass, use
Supabase **hardened mode** — see the
[security model](#security-model-trust-based-isolation).

## How team mode works

Every member runs their **own MCP server process** (their own Claude Code /
Claude Desktop config) pointed at the **same backend**. Two env vars drive
the routing:

| Variable | Per member? | Meaning |
|---|---|---|
| `MEMORYOS_OWNER_ID` | unique per member | who you are; stamps your writes, scopes your reads |
| `MEMORYOS_SHARED_OWNER_ID` | identical for everyone | the team's shared scope (default `firma`) |

With owner routing active on the scoped collections (knowledge, decisions,
sessions, goals, tasks, contacts, knowledge_links):

- Writes default to **private** (your `MEMORYOS_OWNER_ID`). Pass
  `owner_scope: "shared"` to write to the team scope.
- Reads return **your private records + shared records**. Pass
  `owner_scope: "private"` or `"shared"` to narrow.
- Reading/updating/deleting another member's private record returns
  `RECORD_NOT_FOUND` — existence is not leaked.
- Unscoped collections (settings, prospects, blog_posts, queues, ...) are
  team-global: everyone sees everything.

## Option 1 — Supabase backend (shared project, recommended)

Best for: teams that want concurrent live access, no git sync ritual, and
private records that never land on teammates' disks.

### 1. Create the Supabase project

One member creates a project at supabase.com and applies the schema:

- Ask the assistant to call `setup_bootstrap` — it returns a paste-ready
  SQL block. Paste into the Supabase SQL editor and run.
- Or apply `migrations/supabase/*.sql` from this package in numeric order.
  `009_align_to_production.sql` is the one that adds the `owner_id` column
  (NOT NULL, default `'default'`) to every scoped table — team mode does not
  work without it.
- Verify with `setup_migrate`: it must report `needs_migration: 0`. On
  Supabase, `setup_migrate` **reports only** — it never creates tables
  (real DDL auto-apply is not shipped).

### 2. Each member configures

Shared URL + key, unique owner id — **only `MEMORYOS_OWNER_ID` differs**:

```json
{
  "mcpServers": {
    "second-brain-data": {
      "command": "npx",
      "args": ["-y", "@iwo-szapar/data-mcp@0.7.4"],
      "env": {
        "SB_BACKEND": "supabase",
        "SB_SUPABASE_URL": "https://yourproject.supabase.co",
        "SB_SUPABASE_KEY": "<service-role-key>",
        "MEMORYOS_OWNER_ID": "alice",
        "MEMORYOS_SHARED_OWNER_ID": "team"
      }
    }
  }
}
```

Bob uses `"MEMORYOS_OWNER_ID": "bob"`, Carol `"carol"`. Everyone keeps
`MEMORYOS_SHARED_OWNER_ID: "team"`. Pin the package version in `args` —
with a bare `@iwo-szapar/data-mcp`, npx resolves a locally installed copy
if the launch directory's `node_modules` tree contains one, and members can
end up silently running different versions against the same backend.

Note: every member holds the **service role key**, which bypasses Postgres
RLS entirely. The MCP enforces scoping for all normal use; a member who
deliberately queries the database directly sees everything. See the
security model below — or close that hole with hardened mode.

### 3. Hardened mode (optional) — per-member JWTs + RLS

Hardened mode replaces the shared service role key with a **per-member
JWT** checked by Postgres Row Level Security. A member who goes around the
MCP and queries the database directly still sees only their own private
rows plus shared rows — the database itself fails closed.

**Setup (admin, once):**

1. Apply `migrations/supabase/011_rls_owner_isolation.sql` (idempotent —
   safe to re-run). It enables RLS on all owner-scoped tables with a
   policy that matches the JWT's `owner_id`/`shared_owner_id` claims.
2. Get the project **JWT secret** (Dashboard → Settings → API → JWT
   Settings) and the **anon key**.
3. Mint one JWT per member:

   ```bash
   SUPABASE_JWT_SECRET=<secret> node scripts/mint-member-jwt.mjs \
     --owner-id alice --shared-owner-id team
   ```

   Tokens default to a 365-day expiry (`--expires-days` to change).
   Distribute each member their own token only.

**Each member configures** anon key + member JWT instead of the service
key:

```json
"env": {
  "SB_BACKEND": "supabase",
  "SB_SUPABASE_URL": "https://yourproject.supabase.co",
  "SB_SUPABASE_ANON_KEY": "<anon-key>",
  "SB_SUPABASE_MEMBER_JWT": "<alice-jwt>",
  "MEMORYOS_OWNER_ID": "alice",
  "MEMORYOS_SHARED_OWNER_ID": "team"
}
```

Rules:

- `SB_SUPABASE_ANON_KEY` + `SB_SUPABASE_MEMBER_JWT` must be set **as a
  pair** — one without the other is a startup error.
- When the pair is present it takes precedence over `SB_SUPABASE_KEY`;
  existing service-key configs keep working unchanged (opt-in).
- The JWT's `owner_id` claim should match `MEMORYOS_OWNER_ID` — the MCP
  scopes by the env var, the database scopes by the claim; keep them in
  sync.
- The admin keeps the service role key for maintenance (it bypasses RLS
  by design). Rotate the project JWT secret to revoke all member tokens
  at once.

Verified by `scripts/team-e2e-supabase-hardened.mjs`, which includes
direct-PostgREST bypass probes: a member's JWT returns zero rows of
another member's private data even when querying the database directly.

## Option 2 — Markdown backend (shared git repo, lightweight)

Best for: zero infrastructure, solo multi-machine use, or teams that treat
all memory as effectively shared. **Private scope on this backend organizes
memory; it does not hide it from teammates' assistants** — every member's
clone contains everyone's records as cleartext files.

### 1. Create the shared memory repo

One member creates a repo (private GitHub repo works fine) and shares it:

```bash
mkdir team-memory && cd team-memory && git init
git remote add origin git@github.com:your-org/team-memory.git
```

### 2. Each member clones and configures

Each member clones the repo locally, then adds to their `.mcp.json` /
Claude Desktop config — **only `MEMORYOS_OWNER_ID` differs**:

```json
{
  "mcpServers": {
    "second-brain-data": {
      "command": "npx",
      "args": ["-y", "@iwo-szapar/data-mcp@0.7.4"],
      "env": {
        "SB_BACKEND": "markdown",
        "SB_MARKDOWN_ROOT": "/Users/alice/team-memory",
        "MEMORYOS_OWNER_ID": "alice",
        "MEMORYOS_SHARED_OWNER_ID": "team"
      }
    }
  }
}
```

Bob uses `"MEMORYOS_OWNER_ID": "bob"`, Carol `"carol"`. Everyone keeps
`MEMORYOS_SHARED_OWNER_ID: "team"`.

Two config rules everyone must follow:

- **Pin the package version in `args`** (shown above). With a bare
  `@iwo-szapar/data-mcp`, npx resolves a locally installed copy if the
  launch directory's `node_modules` tree contains one — members can end up
  silently running different versions against the same backend.
- **`SB_MARKDOWN_ROOT` must be an absolute path** to that member's own
  clone. Relative paths resolve against whatever cwd the MCP host uses.

### 3. Bootstrap

Any one member asks their assistant to call `setup_migrate` once. On the
markdown backend it creates all collection directories directly — writes
work immediately after. Commit and push the result.

### 4. Sync ritual

The markdown backend has **no concurrency control across machines** — it is
plain files synced by git. To avoid clobbering each other:

- Pull before a work session, push after.
- Record IDs are unique per creation, so concurrent *creates* merge cleanly.
- Concurrent *updates to the same record* conflict like any other file edit —
  resolve in git as usual.
- Do not point two live server processes at the same root via a file-sync
  tool (Dropbox/iCloud) — partial-file syncs can corrupt reads.

### Multi-machine caveat (one person, two computers)

The same applies to a single member with a laptop + desktop: treat the
memory repo like source code. Pull, work, push. There is no daemon merging
writes for you.

## Verification ritual (run once after setup)

With any two members configured (say Alice and Bob), verify the contract by
asking each assistant:

1. **Alice:** "Store a private insight: test-private-123" → `knowledge_learn`
   with `owner_scope: "private"`.
2. **Bob:** "Recall test-private-123" → must return **nothing**.
3. **Alice:** "Store a shared pattern: test-shared-456" with
   `owner_scope: "shared"`.
4. **Bob:** "Recall test-shared-456" → must return the item.
5. **Alice:** "Create a shared task: review the pilot deck."
6. **Bob:** "List tasks, mark the pilot deck task done" → must succeed.
7. Clean up the test items.

This is exactly what the automated suites check — you can also run them
directly from a checkout of this repo:

```bash
npm run test:e2e                                   # markdown backend, fully local
SB_SUPABASE_URL=... SB_SUPABASE_KEY=... npm run test:e2e:supabase
```

## Security model (trust-based isolation)

Owner scoping is **trust-based, not cryptographic**. The MCP enforces the
private/shared rules correctly on both backends (verified by the e2e suites
and a live isolation test, `scripts/mvp-isolation-supabase.mjs`). What
varies is which *other* doors to the data exist:

- **On Supabase, the MCP is the only practical door.** Private records
  never sit on teammates' disks, so no assistant stumbles into them by
  accident — "private" holds by default. With the default shared service
  role key the residual hole is deliberate: every member can query any row
  directly, bypassing the proxy. **Hardened mode** (per-member JWTs + RLS,
  see Option 1 step 3) closes that hole — direct database queries with a
  member JWT return only that member's private rows plus shared rows.
- **On markdown, the filesystem is a second, wide-open door.** Private
  records are plain cleartext files in a repo every member clones. A
  teammate's AI assistant has filesystem access and will read and quote
  your private records the moment a question touches them — no deliberate
  bypass, no malice, just an innocent question like "what do we know about
  X?". On markdown, the private scope *organizes* memory; it does not keep
  secrets.
- On either backend, `MEMORYOS_OWNER_ID` is just an env var — any member
  can edit their own config to another member's owner id and read that
  member's private scope through the MCP itself.
- Markdown soft-deletes move records to `_archive/` inside the root — they
  are not destroyed. `setup_migrate` writes a `.gitignore` covering
  `_archive/` (since 0.7.4) so a reflexive `git add -A && git push` cannot
  publish "deleted" private records. Anything pushed before that guard
  existed stays in git history until removed with `git filter-repo`.

**Bottom line:** Supabase gives you private-by-default against accidental
exposure; markdown does not. With the default shared service key, neither
protects against a teammate who deliberately goes around the MCP —
Supabase hardened mode does, enforced by the database itself. The
remaining trust boundary on any setup: if a record must never be seen by
the project admin under any circumstances, keep it out of the team brain
entirely.

## Known limitations

| Limitation | Detail |
|---|---|
| **PocketBase has no owner scoping** | Owner routing is silently skipped on the PocketBase backend — `MEMORYOS_OWNER_ID` has no effect there. Use markdown or Supabase for team mode. |
| **Supabase schema is manual** | `setup_migrate` reports missing tables but cannot create them. Apply SQL via `setup_bootstrap` or `migrations/supabase/`. |
| **Markdown has no cross-machine concurrency control** | Sync via git pull/push discipline; see the sync ritual above. |
| **Markdown search is exact-substring (first pass)** | `knowledge_recall` falls back to any-term, prefix-stemmed matching when the full query finds nothing (since 0.7.3), so natural multi-word and inflected queries work. Other search tools (`contact_search`, `prospect_search`) remain exact-substring — use single, distinctive words there. |
| **Trust-based isolation** | See the security model above. |
