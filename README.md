# @iwo-szapar/data-mcp

MCP server for a personal (and team) Second Brain: 22 tools for knowledge,
decisions, sessions, goals, tasks, contacts, knowledge links, and business
collections (prospects, blog, email/content queues) — backed by your choice
of **markdown files**, **Supabase**, or **PocketBase**.

Built for [Second Brain Factory](https://second-brain-factory.com). Published
to npm; source-visible by design.

## Install

```bash
npm install @iwo-szapar/data-mcp
```

Or run directly:

```bash
npx @iwo-szapar/data-mcp
```

The package ships a `data-mcp` bin (stdio MCP server).

## Quickstart (markdown backend)

The markdown backend stores every record as a YAML-frontmatter `.md` file —
no database, fully local, git-friendly.

Claude Code / Claude Desktop config:

```json
{
  "mcpServers": {
    "second-brain-data": {
      "command": "npx",
      "args": ["-y", "@iwo-szapar/data-mcp@0.8.0"],
      "env": {
        "SB_BACKEND": "markdown",
        "SB_MARKDOWN_ROOT": "/path/to/your/memory"
      }
    }
  }
}
```

Config rules that prevent silent version drift:

- **Pin the version in `args`** (`@iwo-szapar/data-mcp@0.8.0`, not bare
  `@iwo-szapar/data-mcp`). If the directory you launch Claude from has the
  package anywhere in its `node_modules` tree (e.g. your project depends on
  an older data-mcp), an unpinned `npx` resolves that local copy instead of
  the latest published version — silently.
- **Use an absolute path for `SB_MARKDOWN_ROOT`.** MCP servers do not
  reliably inherit the cwd you expect; relative roots end up in surprising
  places.

First run: call the `setup_migrate` tool once. On the markdown backend it
creates all collection directories directly — after that, every tool works
immediately. (`setup_status` shows readiness at any time.)

Layout: `<root>/<collection>/<id>.md`; soft-deletes move files to
`<root>/_archive/<collection>/`.

## Backends

| Backend | `SB_BACKEND` | Storage | Schema setup |
|---|---|---|---|
| Markdown | `markdown` | local `.md` files | `setup_migrate` auto-creates collection dirs |
| Supabase | `supabase` | Postgres | `setup_bootstrap` produces a paste-ready SQL block; apply in the SQL editor, verify with `setup_migrate` |
| PocketBase | `pocketbase` | PocketBase collections | apply bundled migrations from `migrations/pocketbase/`; `setup_migrate` reports what's missing |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SB_BACKEND` | yes | `markdown` \| `supabase` \| `pocketbase` |
| `SB_MARKDOWN_ROOT` | markdown | path to the memory folder |
| `SB_SUPABASE_URL` | supabase | project URL |
| `SB_SUPABASE_KEY` | supabase | service role key (default mode) |
| `SB_SUPABASE_ANON_KEY` | supabase (hardened) | anon key — pair with `SB_SUPABASE_MEMBER_JWT` |
| `SB_SUPABASE_MEMBER_JWT` | supabase (hardened) | per-member JWT (mint with `scripts/mint-member-jwt.mjs`); pair takes precedence over `SB_SUPABASE_KEY` |
| `SB_POCKETBASE_URL` | pocketbase | server URL |
| `SB_POCKETBASE_ADMIN_EMAIL` | pocketbase | admin email |
| `SB_POCKETBASE_ADMIN_PASSWORD` | pocketbase | admin password |
| `SB_SCHEMA_MAP` | no | JSON object remapping logical collection names to actual table names |
| `SB_RESEND_API_KEY` | no | enables email sending for the email queue |
| `MEMORYOS_OWNER_ID` | no | enables owner routing (team mode) — see below |
| `MEMORYOS_SHARED_OWNER_ID` | no | shared/team owner id (default `firma`) |

## Team mode (owner scoping)

Set `MEMORYOS_OWNER_ID` to activate per-owner scoping on the memory
collections (knowledge, decisions, sessions, goals, tasks, contacts,
knowledge_links). Multiple people can then share one backend (e.g. one
markdown root in a shared repo, or one Supabase project) while keeping
private memory private:

- Each member runs their own server process with their own
  `MEMORYOS_OWNER_ID`; all members set the same `MEMORYOS_SHARED_OWNER_ID`.
- Write tools accept `owner_scope: "private" | "shared"` (default private).
- Reads return your private records plus shared records; pass
  `owner_scope` to filter.
- Cross-owner access to another member's private record returns
  RECORD_NOT_FOUND — existence is not leaked.

**Full setup runbook:** [docs/TEAM-SETUP.md](docs/TEAM-SETUP.md) — team-of-3
walkthrough for both backends, `.mcp.json` examples, verification ritual.

**Caveats:**

- **Backend choice decides what "private" means.** The MCP enforces
  private/shared scoping identically everywhere, but on **Supabase**
  private records live only in the cloud — hidden from teammates'
  assistants by default (residual hole: the shared service role key can
  query rows directly, a deliberate bypass — closed by **hardened mode**:
  per-member JWTs + RLS, where the database itself rejects cross-owner
  reads; see the runbook). On **markdown**, every
  member's clone contains everyone's records as cleartext files, and a
  teammate's AI assistant **will** read them when a question touches them —
  there, private scope organizes memory, it does not keep secrets. Use
  Supabase for teams with privacy expectations; keep true secrets out of
  the team brain on either backend.
- **PocketBase backend does not support owner scoping.** Owner routing is
  silently skipped on PocketBase — `MEMORYOS_OWNER_ID` has no effect there.
  Use markdown or Supabase for team mode.
- **Markdown backend has no cross-machine concurrency control.** Sync the
  shared root with git pull/push discipline (see the runbook).

This contract is enforced in CI by `scripts/team-e2e.mjs` (markdown, 28
checks) and `scripts/team-e2e-supabase.mjs` (Supabase, same core contract;
runs when `SB_SUPABASE_URL`/`SB_SUPABASE_KEY` are provided, skips
otherwise): two simulated members, private isolation, shared visibility,
shared task handoff, cross-owner write protection, `brain_stats` scoping.
Hardened mode has its own suite, `scripts/team-e2e-supabase-hardened.mjs`,
including direct-PostgREST bypass probes proving the database fails closed,
plus per-member token revocation (jti denylist — revoke one member with
`scripts/revoke-member-jwt.mjs` without rotating the project secret).

Search note: `knowledge_recall` first runs the backend's native search with
the full query (markdown: exact-substring ranked tags > title > body;
Supabase: tsvector with English stemming; PocketBase: LIKE). If that returns
nothing, it falls back to **any-term matching**: the query is tokenized,
stopwords dropped, and each term is prefix-stemmed (plurals, -ing/-ed) so
inflected words match — results are ranked by how many terms matched.
Exact-match queries are unaffected; fallback responses include
`matched_via: "any_term_fallback"`. Other text searches (`record_query` with
`query` on contacts/prospects/decisions) remain native-search only.

## Tools (22)

- **Knowledge:** `knowledge_store`, `knowledge_recall`, `knowledge_learn`,
  `knowledge_validate`
- **Links:** `link_create`, `link_related`, `link_suggest`
- **Sessions:** `session_log`
- **Handoffs:** `handoff_create`, `handoff_update`, `handoff_list`
- **Records (generic CRUD):** `record_create`, `record_update`,
  `record_query`, `record_delete` — one set of tools for decisions, goals,
  tasks, contacts, prospects, blog_posts, content_calendar, email_queue,
  and knowledge_links. Pass `collection` plus a `data` payload; invalid
  fields return the expected schema so the model can self-correct.
- **Brain:** `brain_stats`, `brain_decay`
- **Ingest:** `ingest` — bulk-import local files or directories into
  knowledge records. Supports markdown, plain text, CSV, JSON, and HTML
  natively, plus PDF, DOCX, XLSX, and PPTX when [markitdown](https://github.com/microsoft/markitdown)
  is installed (`pip install 'markitdown[all]'`, or have `uv` installed for
  the `uvx` fallback — no Node dependencies added). XLSX produces one record
  per sheet, PPTX one per slide; converted records carry
  `metadata.converter` provenance. Without markitdown, office files report
  a per-file error with the install hint and the rest of the batch
  continues. **ChatGPT and Claude chat exports** are auto-detected by
  content shape (both vendors ship a `conversations.json` — extract the
  export zip first): one record per conversation with vendor tags and
  `metadata.conversation_date`; ChatGPT's branching message graph is walked
  along the canonical path only (regenerated answers excluded), long
  conversations split at message boundaries with `(part n/m)` titles, and
  `conversations.json` files are accepted up to 200MB. Recurses
  directories (skips dotfiles, binaries,
  `node_modules`; capped at
  200 files), splits long documents at section/paragraph boundaries, and
  dedupes by `(type, title)` with a sha256 content hash stored in record
  metadata — re-ingesting the same files creates zero duplicates. Defaults
  to a dry-run preview; pass `dry_run: false` to write. One tool for all
  formats by design (per-format tools would pollute client context).
- **Setup:** `setup_status`, `setup_migrate`, `setup_bootstrap`, `setup_seed`

In 0.9.0, 27 single-collection CRUD tools (goal_*, task_*, contact_*,
prospect_*, blog_*, email_queue_add, content_queue_*, knowledge
update/list/delete/decide, session_list, link_delete) were consolidated into
the four `record_*` tools. The 44-tool surface serialized to ~9.8K tokens of
client context; 21 tools is ~5.3K. Defaults and computed fields are
preserved (blog `published_at` stamping, knowledge summary regeneration,
stage/status defaults, delete confirm gate).

### Tool search / deferred loading

Clients that defer MCP tool definitions (Claude Code MCP Tool Search, the
Anthropic API's `defer_loading`) discover this server via its `instructions`
text and keep only `_meta`-marked tools preloaded. The server is set up for
this:

- `instructions` describe every capability by tool-name prefix
  (`knowledge_*`, `handoff_*`, ...) and stay under the 2KB client truncation
  limit — guarded by `tests/tool-search-surface.test.ts`.
- Hot-path tools (`knowledge_recall`, `knowledge_store`, `knowledge_learn`,
  `session_log`, `record_query`) set `_meta["anthropic/alwaysLoad"]: true` so
  they remain available without a search round-trip. Other clients ignore
  the annotation (it's additive metadata).

## Development

```bash
npm ci
npm run typecheck         # tsc --noEmit
npm run build             # tsc → dist/
npm test                  # unit tests (vitest)
npm run test:e2e          # team E2E against local dist/ (markdown backend)
npm run test:e2e:supabase # team E2E, Supabase backend (needs SB_SUPABASE_URL/KEY; skips otherwise)
node scripts/smoke-test.mjs    # stdio boot + 22-tool surface check
bash scripts/verify-dist.sh    # dist/ byte-comparability gate
```

`dist/` is committed and canonical: CI verifies that rebuilding `src/`
reproduces it (see `scripts/verify-dist.sh` and
`docs/verify-dist-allowlist.md`). If you change `src/`, rebuild and commit
the matching `dist/` files.

Releases are tag-driven: pushing a `v*` tag runs typecheck, verify-dist,
build, smoke test, and team E2E, then publishes to npm via Trusted
Publishing (OIDC) — no tokens.

## License

MIT. © Second Brain Factory.
