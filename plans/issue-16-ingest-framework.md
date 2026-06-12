# issue-16: Ingestion framework + plain-format support

## Problem
data-mcp has no import path. Users with existing knowledge (markdown vaults, text notes, CSVs, JSON exports, HTML pages) must paste content into `knowledge_store` one record at a time. Cold-start kills adoption.

## Task Classification
- Type: feature
- Scope mode: EXPANSION
- Required gates: vertical_slices, test_seams, review, surface-guard (21→22), verify-dist

## Domain Language
- `knowledge` record: `{type, title, content, summary, tags, source, metadata, confidence, owner_scope?}` — metadata jsonb exists on all backends (009 migration; markdown adapter stores arbitrary frontmatter)
- `withGracefulDegradation('knowledge', adapter, handler)` wraps every knowledge-touching tool
- Tool registration via `server.registerTool(name, {description, inputSchema, annotations?, _meta?}, cb)`
- Surface guard: `tests/tool-search-surface.test.ts` asserts exact tool count, alwaysLoad set, instructions ≤2KB

## Architecture Alignment
- Source-of-truth: `src/server.ts` SERVER_INSTRUCTIONS (≤2KB), `README.md` Tools section, `docs/TEAM-SETUP.md`
- Code sources checked: `src/tools/register.ts` (21 registrations), `src/tools/records/registry.ts` (registry pattern), `src/tools/memory/knowledge-store.ts` (record mapping), `src/adapter/types.ts`
- Verdict: intentional-change-updates-docs — tool surface 21→22; instructions, README, TEAM-SETUP, surface-guard test all update in this PR
- Required doc updates: README (Tools 22 + Ingestion section), TEAM-SETUP (ingestion note), SERVER_INSTRUCTIONS (`ingest` line)

## Interfaces and Test Seams
- `ingest` MCP tool — invariants: dry_run default true; per-file errors never abort batch; idempotent re-runs (content-hash dedupe); owner_scope passthrough — seam: registerTool stub (pattern from `tests/record-tools.test.ts`) + real-adapter e2e via smoke
- Parser registry `src/ingest/registry.ts` — pure functions `(content: string|Buffer, ctx) => IngestItem[]` — seam: direct unit tests with fixtures
- Detector — `(path, head: Buffer) => format|null` — seam: unit test matrix

## Approach
New `src/ingest/` module:
- `types.ts` — `IngestItem {title, content, type, tags, source_meta}`, `ParseResult`, `FileReport`
- `detect.ts` — extension map + content sniffing (UTF-8 check, binary skip)
- `chunk.ts` — markdown section splitter (H1/H2, ≤4000 chars, splits at paragraph boundary, `(part n/m)` suffix)
- `parsers/{markdown,text,csv,json,html}.ts` — pure, no deps
- `registry.ts` — `format → parser` map (single source of truth, mirrors records/registry)
- `runner.ts` — walk path (recursive, skip dotfiles/binaries/node_modules, cap 200 files), parse, hash (sha256 of normalized content), dedupe vs existing `metadata.content_hash` + in-batch, write via adapter
- `src/tools/ingest/ingest.ts` — the tool; registered in register.ts

Dedupe query: list knowledge filtered by source `ingest:%`? — adapter filter ops support `eq` only reliably across backends; instead query by `metadata` is non-portable. **Decision: fetch content_hashes once per run via adapter.list over `source: eq ingest:<format>` pages? Too heavy.** Simplest portable approach: dedupe key = deterministic title + type + owner_scope (knowledge_store pattern) AND store content_hash in metadata; lookup per item by `(type, title)` exact — same dedup contract knowledge_store already uses, plus hash comparison to detect changed content (changed → skip with `changed: true` flag in report; updating is out of scope v1).

## Success Invariant
After `ingest(path, dry_run:false)`, every parseable file's content is recallable via knowledge_recall, re-running the same call creates zero new records, and the returned summary accurately reports created/skipped/errored counts.

## Vertical Slices
### Slice 1: framework + markdown/text parsers + dry-run tool
Type: AFK · User-visible: `ingest` a directory of .md/.txt → preview + write records; dedupe works
- [ ] detector, chunker, registry, runner, tool registration, surface test 22
### Slice 2: csv/json/html parsers
Type: AFK · User-visible: 5 formats ingest end-to-end
- [ ] per-format fixtures + unit tests
### Slice 3: docs + e2e + polish
Type: AFK · User-visible: documented; smoke proves 22 tools; e2e proves recall of ingested content
- [ ] README/TEAM-SETUP/INSTRUCTIONS; e2e in team-e2e.mjs (markdown backend)

## Incident Regression Map
- #13 context-pollution: ONE tool, not per-format tools; instructions stay ≤2KB (guarded by test)
- Committed-dist discipline: rebuild via scratch dir + rsync; verify-dist must PASS

## Risk-Triggered Gates
- success-invariant-check: applies (above)
- generated-artifact-check: N/A — no repo generation
- schema-migration-check: N/A — no schema change (metadata jsonb exists)
- ui-journey-check: N/A
- architecture-docs-check: applies (tool surface)

## Files Affected
- `src/ingest/{types,detect,chunk,registry,runner}.ts`, `src/ingest/parsers/*.ts` — new
- `src/tools/ingest/ingest.ts` — new tool
- `src/tools/register.ts` — +1 registration
- `src/server.ts` — instructions line
- `tests/tool-search-surface.test.ts` — 22
- `tests/ingest-*.test.ts`, `tests/fixtures/ingest/**` — new
- `scripts/smoke-test.mjs`, `scripts/team-e2e.mjs` — count + e2e
- `README.md`, `docs/TEAM-SETUP.md`, `package.json` (0.11.0)
- `dist/**` — rebuilt

## Acceptance Criteria
- [ ] AC1: `ingest` registered; tools/list returns 22; surface-guard green
- [ ] AC2: dry_run default true previews without writing; dry_run:false writes
- [ ] AC3: directory recursion skips dotfiles/binaries; 200-file cap with clear message
- [ ] AC4: re-ingest same path → zero duplicates (test-proven)
- [ ] AC5: 5 formats parse correctly from fixtures
- [ ] AC6: ingested records recallable via knowledge_recall + record_query (e2e)
- [ ] AC7: owner_scope respected (unit: payload includes owner_scope when adapter.ownerScopeEnabled)
- [ ] AC8: per-file parse errors don't abort batch; reported in summary
- [ ] AC9: parsers adapter-agnostic (pure functions; only runner touches adapter)
- [ ] AC10: instructions ≤2KB; README/TEAM-SETUP updated

## Edge Cases
- Empty file → skipped with reason; UTF-16/BOM → BOM stripped, UTF-16 detected as binary v1
- Single file path (not dir) → works; nonexistent path → tool error, not crash
- Huge file (>1MB text) → chunked; >10MB → skipped with reason
- CSV with quoted commas/newlines → minimal RFC4180 parser handles quotes
- HTML with script/style → stripped before text extraction

## Risks
- Markdown-backend ingest of .md files could collide with the brain's own storage dir → runner refuses to ingest a path inside the adapter's own data root (markdown backend only)
- Path traversal: tool has fs access by design (local MCP), but normalize + document

## Artifact Manifest
- `.pipeline/{acceptance-trace,test-evidence,review-results}.json` (gitignored)
