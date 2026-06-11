# @iwo-szapar/data-mcp

MCP server for a personal (and team) Second Brain: 41 tools for knowledge,
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
      "args": ["-y", "@iwo-szapar/data-mcp@0.7.3"],
      "env": {
        "SB_BACKEND": "markdown",
        "SB_MARKDOWN_ROOT": "/path/to/your/memory"
      }
    }
  }
}
```

Config rules that prevent silent version drift:

- **Pin the version in `args`** (`@iwo-szapar/data-mcp@0.7.3`, not bare
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
| `SB_SUPABASE_KEY` | supabase | service role key |
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

- **Trust-based isolation, not a security boundary.** `MEMORYOS_OWNER_ID`
  is an env var any member can change, and every member holds backend
  credentials that can read all rows/files directly. Use scoping to keep
  private and shared memory organized — not to hide secrets from teammates.
- **PocketBase backend does not support owner scoping.** Owner routing is
  silently skipped on PocketBase — `MEMORYOS_OWNER_ID` has no effect there.
  Use markdown or Supabase for team mode.
- **Markdown backend has no cross-machine concurrency control.** Sync the
  shared root with git pull/push discipline (see the runbook).

This contract is enforced in CI by `scripts/team-e2e.mjs` (markdown, 25
checks) and `scripts/team-e2e-supabase.mjs` (Supabase, same core contract;
runs when `SB_SUPABASE_URL`/`SB_SUPABASE_KEY` are provided, skips
otherwise): two simulated members, private isolation, shared visibility,
shared task handoff, cross-owner write protection, `brain_stats` scoping.

Search note: `knowledge_recall` first runs the backend's native search with
the full query (markdown: exact-substring ranked tags > title > body;
Supabase: tsvector with English stemming; PocketBase: LIKE). If that returns
nothing, it falls back to **any-term matching**: the query is tokenized,
stopwords dropped, and each term is prefix-stemmed (plurals, -ing/-ed) so
inflected words match — results are ranked by how many terms matched.
Exact-match queries are unaffected; fallback responses include
`matched_via: "any_term_fallback"`. Other search tools (`contact_search`,
`prospect_search`) remain native-search only.

## Tools (41)

- **Knowledge:** `knowledge_store`, `knowledge_recall`, `knowledge_learn`,
  `knowledge_decide`, `knowledge_validate`, `knowledge_update`,
  `knowledge_delete`, `knowledge_list`
- **Links:** `link_create`, `link_delete`, `link_related`, `link_suggest`
- **Sessions:** `session_log`, `session_list`
- **Goals:** `goal_create`, `goal_update`, `goal_list`
- **Tasks:** `task_create`, `task_update`, `task_list`
- **Contacts:** `contact_create`, `contact_update`, `contact_list`,
  `contact_search`
- **Brain:** `brain_stats`, `brain_decay`
- **Setup:** `setup_status`, `setup_migrate`, `setup_bootstrap`, `setup_seed`
- **Business:** `prospect_create`, `prospect_update`, `prospect_list`,
  `prospect_search`, `blog_create`, `blog_update`, `blog_list`,
  `blog_delete`, `email_queue_add`, `content_queue_add`, `content_queue_list`

## Development

```bash
npm ci
npm run typecheck         # tsc --noEmit
npm run build             # tsc → dist/
npm test                  # unit tests (vitest)
npm run test:e2e          # team E2E against local dist/ (markdown backend)
npm run test:e2e:supabase # team E2E, Supabase backend (needs SB_SUPABASE_URL/KEY; skips otherwise)
node scripts/smoke-test.mjs    # stdio boot + 41-tool surface check
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
