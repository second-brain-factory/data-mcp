# @iwo-szapar/data-mcp

Unified data MCP server for [Second Brain](https://iwoszapar.com/second-brain-ai). One MCP, two backends: PocketBase (local, free) or Supabase (cloud, multi-device).

40 tools across knowledge, sessions, goals, tasks, contacts, CRM prospects, blog, email queue, and content calendar. Used in production by Second Brain v2 customers.

---

## Install

```bash
npm install -g @iwo-szapar/data-mcp
# or run on demand
npx @iwo-szapar/data-mcp
```

Requires Node.js `>=20`.

---

## Quick start — PocketBase (local)

PocketBase runs on your laptop. Good for single-device workflows. Stops when you close the terminal.

1. **Install PocketBase** ([pocketbase.io](https://pocketbase.io)) and start it:

   ```bash
   ./pocketbase serve
   # Admin UI: http://127.0.0.1:8090/_/
   ```

2. **Create an admin account** via the Admin UI on first run.

3. **Apply the schema migrations** (required — the MCP does NOT apply them automatically):

   Copy the files in `migrations/pocketbase/` (shipped with this package) into your PocketBase instance's `pb_migrations/` directory, then run:

   ```bash
   ./pocketbase migrate up
   ```

   This creates all 14 collections (`knowledge`, `decisions`, `sessions`, `goals`, `tasks`, `contacts`, `entity_aliases`, `settings`, `prospects`, `blog_posts`, `email_queue`, `content_calendar`, `newsletter_subscribers`, `affiliates`).

4. **Configure your MCP client** (Claude Code, Claude Desktop, Cursor, etc.):

   ```json
   {
     "mcpServers": {
       "data-mcp": {
         "command": "npx",
         "args": ["-y", "@iwo-szapar/data-mcp"],
         "env": {
           "SB_BACKEND": "pocketbase",
           "SB_POCKETBASE_URL": "http://127.0.0.1:8090",
           "SB_POCKETBASE_ADMIN_EMAIL": "you@example.com",
           "SB_POCKETBASE_ADMIN_PASSWORD": "your-admin-password"
         }
       }
     }
   }
   ```

5. **Verify**: in your MCP client, call the `setup_status` tool. It reports which collections exist and flags any missing ones.

---

## Quick start — Supabase (cloud, multi-device)

Supabase is a hosted Postgres. Runs 24/7, reachable from any device. Good for multi-device setups and phone-friendly workflows.

1. **Create a Supabase project** at [supabase.com](https://supabase.com). Note the Project URL and `service_role` key (Settings → API).

2. **Apply the SQL migrations** via the SQL editor or the Supabase CLI:

   ```bash
   # Using the Supabase CLI
   for f in migrations/supabase/*.sql; do
     psql "$SUPABASE_DB_URL" -f "$f"
   done
   ```

   Apply them in order `001` through `010`. The MCP does NOT apply them automatically.

3. **Configure your MCP client**:

   ```json
   {
     "mcpServers": {
       "data-mcp": {
         "command": "npx",
         "args": ["-y", "@iwo-szapar/data-mcp"],
         "env": {
           "SB_BACKEND": "supabase",
           "SB_SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
           "SB_SUPABASE_KEY": "your-service-role-key"
         }
       }
     }
   }
   ```

   Use the `service_role` key, not `anon`. The MCP needs full access.

4. **Verify** with `setup_status`.

---

## Environment variables

| Variable | Required | Applies to | Description |
|---|---|---|---|
| `SB_BACKEND` | yes | both | `pocketbase` or `supabase` |
| `SB_POCKETBASE_URL` | yes (PB) | pocketbase | e.g. `http://127.0.0.1:8090` |
| `SB_POCKETBASE_ADMIN_EMAIL` | yes (PB) | pocketbase | PocketBase admin email |
| `SB_POCKETBASE_ADMIN_PASSWORD` | yes (PB) | pocketbase | PocketBase admin password |
| `SB_SUPABASE_URL` | yes (SB) | supabase | Project URL |
| `SB_SUPABASE_KEY` | yes (SB) | supabase | `service_role` key |
| `SB_SCHEMA_MAP` | no | both | JSON object mapping logical names to real table names (e.g. `{"prospects":"my_leads"}`) |
| `SB_RESEND_API_KEY` | no | both | Resend key for email tooling (optional) |

Missing any required var on startup → the server exits with `Missing required environment variable: SB_XXX`.

---

## Tool reference (40 tools)

All tools return JSON. Every tool uses *graceful degradation*: if the required table doesn't exist, the tool returns a clear error asking you to apply migrations instead of crashing.

### Knowledge (8)

| Tool | Purpose |
|---|---|
| `knowledge_store` | Store a fact / pattern / insight / lesson / reference. Dedup by `(type, title)`. |
| `knowledge_recall` | Search knowledge by query, tags, or type. |
| `knowledge_learn` | Shortcut for storing a `lesson`. |
| `knowledge_decide` | Record a decision with context, options, chosen option, and rationale (writes to `decisions`). |
| `knowledge_validate` | Mark an item as freshly validated (resets `last_validated_at`). |
| `knowledge_update` | Update title / content / tags on an existing item. |
| `knowledge_delete` | Delete a knowledge item by ID. |
| `knowledge_list` | List or filter knowledge items. |

### Sessions (2)

| Tool | Purpose |
|---|---|
| `session_log` | Log a completed work session with skills used, files changed, decisions made. |
| `session_list` | List recent sessions. |

### Goals (3)

| Tool | Purpose |
|---|---|
| `goal_create` / `goal_update` / `goal_list` | Track goals with key results. |

### Tasks (3)

| Tool | Purpose |
|---|---|
| `task_create` / `task_update` / `task_list` | Task management with status and priority. |

### Contacts (4)

| Tool | Purpose |
|---|---|
| `contact_create` / `contact_update` / `contact_list` / `contact_search` | Contact records with relationship type and tags. |

### Brain health (2)

| Tool | Purpose |
|---|---|
| `brain_stats` | Aggregate counts across collections and knowledge-type distribution. |
| `brain_decay` | Find stale knowledge items (not validated recently). |

### Knowledge links (4)

| Tool | Purpose |
|---|---|
| `link_create` / `link_delete` / `link_related` / `link_suggest` | Graph-lite relationships between knowledge items. |

### Setup (3)

| Tool | Purpose |
|---|---|
| `setup_status` | Report which collections exist. **Run this first** after installation. |
| `setup_migrate` | **Reports** missing collections and points to the migration files. Does **not** apply migrations automatically — you must run them via PocketBase CLI or `psql`. |
| `setup_seed` | Load seed data (e.g. `entity_aliases` for search). |

### CRM prospects (4)

| Tool | Purpose |
|---|---|
| `prospect_create` / `prospect_update` / `prospect_list` / `prospect_search` | Sales pipeline. Stages: `new → contacted → responded → interested → ready_to_buy → proposal_sent → negotiating → closed_won / closed_lost / nurturing`. |

### Blog (4)

| Tool | Purpose |
|---|---|
| `blog_create` / `blog_update` / `blog_list` / `blog_delete` | Blog post content management. |

### Email + content queues (3)

| Tool | Purpose |
|---|---|
| `email_queue_add` | Queue an email (does NOT send — sending is done out-of-band). |
| `content_queue_add` / `content_queue_list` | Content calendar for scheduled posts. |

---

## Common failures (and how to recover)

### "The 'X' table does not exist yet. Run setup_migrate to create the database schema."

**What it means:** The collection backing this tool hasn't been created.

**Fix:** `setup_migrate` only *reports* missing tables — it does not apply them. You need to run the actual migrations:

- **PocketBase:** `./pocketbase migrate up` (after copying the files in `migrations/pocketbase/` into your `pb_migrations/` directory).
- **Supabase:** run each file in `migrations/supabase/` in order via the SQL editor or `psql`.

Then call `setup_status` to confirm.

### "Only knowledge tools work, everything else fails"

**Symptom:** `knowledge_store` and `knowledge_recall` succeed but `goal_create`, `task_create`, `contact_create` all return the "table does not exist" error.

**Cause:** You applied only the first migration (`001_core_schema`) which creates `knowledge`, `decisions`, and `sessions`. The rest of the collections come from migrations `002` through `010` (Supabase) or `002` through `008` (PocketBase).

**Fix:** Apply all migrations in order.

### PocketBase disconnects between terminal sessions

**Cause:** `pocketbase serve` runs in the foreground. When you close the terminal, the server stops.

**Fix options:**
- Run PocketBase under a process manager (pm2, forever) or a launchd plist on macOS.
- Switch to the Supabase backend — it runs 24/7 in the cloud.

### MCP server disconnected after Claude Code restart

**Cause:** Your MCP client is not reading the server config on startup, or the `npx -y` download got interrupted.

**Fix:** Install globally once (`npm install -g @iwo-szapar/data-mcp`) and point `command` at `data-mcp` instead of `npx`. Restart your MCP client.

### "Database authentication failed"

**PocketBase:** check `SB_POCKETBASE_ADMIN_EMAIL` / `PASSWORD` match an admin account in the Admin UI.

**Supabase:** confirm you are using the `service_role` key, not `anon`. The anon key does not have write access to these tables.

---

## Schema mapping (optional)

If your real tables have different names, set `SB_SCHEMA_MAP` to a JSON object:

```bash
SB_SCHEMA_MAP='{"prospects":"sales_leads","contacts":"people"}'
```

Logical names used by the tools (`prospects`, `contacts`, etc.) are transparently rewritten to your real table names. Empty keys or missing keys pass through unchanged.

---

## File layout

```
dist/              compiled JS (entry: dist/index.js)
migrations/
  pocketbase/      *.js migration files (PocketBase migrate format)
  supabase/        *.sql migration files (run in order)
seed/              seed data (entity_aliases.json, etc.)
```

The published package ships `dist/`, `migrations/`, `seed/`.

---

## License

MIT

---

## Support

This package is maintained by [Iwo Szapar](https://iwoszapar.com) as part of the Second Brain ecosystem. For issues specific to Second Brain v2 customers, reply to your purchase confirmation email. For general bugs, open an issue against the package on npm.
