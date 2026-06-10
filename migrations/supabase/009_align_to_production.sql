-- Migration 009: Align schema to battle-tested iwoszapar.com production tables
--
-- Changes:
-- 1. Convert text[] columns to jsonb (tags, skills_used, files_changed, options_considered)
-- 2. Add owner_id to all core tables (single default, enables multi-user later)
-- 3. Add metadata jsonb to tables that lack it
-- 4. Add knowledge-specific columns: source_file, decay_score, triggers
-- 5. Add decisions-specific columns: rationale, outcome_rating, session_id
-- 6. Make decisions.options_considered nullable (production data shows this)
-- 7. Make goals.timeframe nullable (not always known at creation time)
--
-- Each `text[] -> jsonb` conversion must DROP DEFAULT first, change TYPE, then
-- SET a jsonb DEFAULT. Postgres cannot auto-cast the text[] default '{}' to jsonb.

-- === KNOWLEDGE ===
ALTER TABLE knowledge ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE knowledge ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
ALTER TABLE knowledge ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'default';
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS source_file text;
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS decay_score numeric;
ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS triggers jsonb;

-- === DECISIONS ===
ALTER TABLE decisions ALTER COLUMN options_considered DROP DEFAULT;
ALTER TABLE decisions ALTER COLUMN options_considered TYPE jsonb USING to_jsonb(options_considered);
ALTER TABLE decisions ALTER COLUMN options_considered DROP NOT NULL;
ALTER TABLE decisions ALTER COLUMN options_considered SET DEFAULT '[]'::jsonb;
ALTER TABLE decisions ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE decisions ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
ALTER TABLE decisions ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'default';
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS rationale text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS outcome_rating text;
ALTER TABLE decisions ADD COLUMN IF NOT EXISTS session_id uuid;

-- === SESSIONS ===
ALTER TABLE sessions ALTER COLUMN skills_used DROP DEFAULT;
ALTER TABLE sessions ALTER COLUMN skills_used TYPE jsonb USING to_jsonb(skills_used);
ALTER TABLE sessions ALTER COLUMN skills_used SET DEFAULT '[]'::jsonb;
ALTER TABLE sessions ALTER COLUMN files_changed DROP DEFAULT;
ALTER TABLE sessions ALTER COLUMN files_changed TYPE jsonb USING to_jsonb(files_changed);
ALTER TABLE sessions ALTER COLUMN files_changed SET DEFAULT '[]'::jsonb;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'default';

-- === GOALS ===
ALTER TABLE goals ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE goals ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
ALTER TABLE goals ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
ALTER TABLE goals ALTER COLUMN timeframe DROP NOT NULL;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'default';
ALTER TABLE goals ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- === TASKS ===
ALTER TABLE tasks ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
ALTER TABLE tasks ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'default';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- === CONTACTS ===
ALTER TABLE contacts ALTER COLUMN tags DROP DEFAULT;
ALTER TABLE contacts ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
ALTER TABLE contacts ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'default';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;
