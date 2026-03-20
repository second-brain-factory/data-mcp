# task-3209: Align data-mcp schema to battle-tested iwoszapar.com schema + wire up for dogfooding

## Problem
data-mcp's Supabase migrations use `text[]` for tags/arrays and lack columns that Iwo's production tables have (owner_id, metadata, decay_score, triggers, source_file). No customers use data-mcp yet. Iwo's `memory_*` tables are battle-tested with 37+ items. We need to align data-mcp to the proven schema so it can be wired up against real data.

## Approach

### Part 1: Update data-mcp Supabase migrations (in data-mcp repo)
- Change all `text[]` columns to `jsonb` (tags, skills_used, files_changed, options_considered)
- Add missing columns to match Iwo's tables: `owner_id text DEFAULT 'default'`, `metadata jsonb DEFAULT '{}'`, `source_file text`, `decay_score numeric`, `triggers jsonb`
- Add `rationale` column to Iwo's `memory_decisions` table (only column data-mcp has that Iwo lacks)
- Update `decisions.options_considered` from `text[]` to `jsonb`
- Keep existing migration files untouched (they're for fresh installs). Create new migration 009 for the schema alignment.

### Part 2: Update TypeScript record types
- Change `tags?: string[]` to `tags?: string[] | unknown[]` or keep as `string[]` (jsonb arrays deserialize as JS arrays anyway — no change needed in types)
- Add optional `owner_id`, `metadata`, `decay_score`, `source_file`, `triggers` to KnowledgeRecord
- Add optional `owner_id`, `metadata`, `outcome_rating`, `session_id` to DecisionRecord
- Add optional `owner_id` to SessionRecord, GoalRecord, TaskRecord, ContactRecord

### Part 3: Wire up in iwoszapar.com
- Add `second-brain-data` MCP to `.claude/settings.json` mcpServers pointing to local data-mcp dist
- Env vars: `SB_BACKEND=supabase`, `SB_SUPABASE_URL` + `SB_SUPABASE_KEY` from .env.local, `SB_SCHEMA_MAP` with memory_ prefix mapping
- Add `rationale` column to `memory_decisions` table

### Part 4: Test against real data
- Run data-mcp locally: `node /Users/iwo/data-mcp/dist/index.js`
- Test `knowledge_recall` against existing 37 items
- Test `knowledge_store` + `knowledge_delete` roundtrip
- Test `brain_stats` returns correct counts
- Test `session_log` creates a record
- Test `brain_decay` returns stale items

## Files Affected (data-mcp repo)
- `migrations/supabase/009_align_to_production.sql` — new migration aligning schema
- `src/types/records.ts` — add optional fields
- `src/tools/memory/knowledge-store.ts` — no change needed (pass-through)

## Files Affected (iwoszapar.com repo)
- `.claude/settings.json` — add second-brain-data MCP server config

## Acceptance Criteria
- [ ] data-mcp migrations use jsonb for all array columns
- [ ] Record types include owner_id, metadata as optional fields
- [ ] MCP wired up in iwoszapar.com settings
- [ ] `knowledge_recall` returns results from existing memory_knowledge data
- [ ] `brain_stats` returns accurate counts
- [ ] `knowledge_store` + `knowledge_delete` roundtrip works
- [ ] Existing memoryos_brain MCP continues to work (no breaking changes)

## Edge Cases
- Schema map must handle all 6 core tables: knowledge, decisions, sessions, goals, tasks, contacts, entity_aliases
- `search_vector` is GENERATED ALWAYS — cannot be inserted/updated directly
- `owner_id` has NOT NULL + default 'iwo' — data-mcp inserts without owner_id will use default

## Risks
- PocketBase adapter may need similar jsonb handling (but PocketBase uses JSON natively, so likely no issue)
- Existing data-mcp tests may break if they assert text[] behavior — need to update test fixtures
