# issue-19: Ingest workspace exports — Notion, Slack, Google Keep, Evernote ENEX

## Problem

Team and personal knowledge lives in Notion workspaces, Slack history, Google Keep, and Evernote. All four have official no-API-key export paths. The #16 framework currently treats a Notion export's `.md` files as generic markdown (ID-junk titles, no folder tags), Slack day files as generic JSON pretty-prints, Keep notes as generic JSON, and `.enex` as unsupported. We need shape-aware parsing that produces recallable records.

## Task Classification
- Type: feature
- Scope mode: EXPANSION
- Required gates: vertical_slices, test_seams, review, detection-matrix, scale-claim-verification
- Merge policy: auto-merge-approved (standing approval for issues 16–20 batch)

## Domain Language
- "export context": directory-level facts the runner discovers in a pre-pass (e.g. Slack `users.json` map) and hands to parsers via ctx. Parsers stay pure — ALL I/O stays in the runner.
- "path refinement": picking a more specific parser from the file's path/name pattern (Notion's `<name> <32-hex>.md`), analogous to #18's content refinement (`refineJsonFormat`).
- Parser purity invariant (#16): parsers are `(content, ctx) => IngestItem[]`.

## Architecture Alignment
- Source-of-truth docs: N/A — data-mcp has no `docs/architecture/`; README + SERVER_INSTRUCTIONS are the doc surface.
- Code sources checked: `src/ingest/{detect,registry,runner,types,chunk}.ts`, `src/ingest/parsers/{markdown,csv,json,conversation}.ts`, `src/tools/ingest/ingest.ts`, `src/server.ts`.
- Alignment verdict: aligned — registry/refinement seams from #16/#18 extend naturally; one additive ctx change.
- Required doc updates: README ingest section, SERVER_INSTRUCTIONS ingest line (≤2KB guard), tool description.
- Test/review proof: instructions-size guard test; doc-alignment-check in review.

## Interfaces and Test Seams
- `parseNotionMd` / `parseNotionDb` / `parseSlackDay` / `parseKeep` / `parseEnex` — pure parsers; seam: unit tests on fixture strings.
- `detectExportContext(rootDir entries)` — pure given a file listing (runner does the readdir); seam: detection matrix unit tests.
- `refinePathFormat(relPath, exportKind)` — pure; seam: unit tests.
- `runIngest` on fixture export directories with in-memory adapter — same harness as `ingest-llm.test.ts`.
- End-to-end recall — new section `[12]` in `scripts/team-e2e.mjs` with a fixture Notion+Slack mini-export.

## Approach

**1. Export-context pre-pass (runner, new).** After `walk()`, the runner inspects the file list relative to the target root:
- Root has `users.json` AND `channels.json` AND `<dir>/<YYYY-MM-DD>.json` day files → `slack` context. Runner loads + parses `users.json` once into an `id → display_name` map and stores it on the context.
- Any file matches `/ [0-9a-f]{32}\.(md|csv)$/` → `notion` context (no preloaded data needed).
- Neither → no context; per-file behavior identical to today (regression guarantee).
Context detection is a pure function over the relative path list; only the `users.json` load is I/O, in the runner.

**2. IngestContext extension (additive).** Add optional fields: `relPath` (root-relative path, always set by runner) and `export?: { kind: 'slack' | 'notion'; users?: Map<string,string> }`. Existing parsers ignore them — zero behavior change.

**3. Notion (path refinement).**
- `<name> <32-hex>.md` → `notion` parser: title = name with ID suffix stripped; strip 32-hex suffixes from link text and link targets in body (`[Page abc…123](Page%20abc…123.md)` → `[Page](Page.md)`); tags = `['notion', ...folder segments]` (segments lowercased, their own ID suffixes stripped, max 20 total via existing cap).
- `<name> <32-hex>.csv` → `notion-db` parser: one record per row, content as `Column: value` lines (reuses csv parsing internals), title = `<db name> — <first column value>` (fallback row N), tags `['notion', 'database', <db name slug>]`.
- Refinement is by filename pattern alone, so it works even when a single file is ingested without the directory context. `_all.csv` duplicates that Notion emits alongside filtered views: only the canonical `<name> <32-hex>.csv` is parsed; `<name> <32-hex>_all.csv` is skipped to avoid double records.

**4. Slack.**
- Day files `<channel>/<date>.json` route to `slack` parser ONLY inside a slack export context (a random `2026-06-12.json` elsewhere stays generic json).
- One record per channel per day file. Title `#<channel> <YYYY-MM-DD>`. Natural dedupe: re-export adds only new days. (Deliberate deviation from PRD's "small days merged to weekly" — cross-file merging breaks the per-file report model; revisit if record volume is a real problem.)
- Message rendering: `<display_name>: text`; `<@U123>` mentions resolved via ctx users map (fallback to raw ID); thread replies grouped under their parent within the file, indented with `  ↳`; skip `subtype: channel_join|channel_leave` and `bot_message` where text is empty.
- Tags `['slack', '#<channel>']`; `metadata.date` = day-file date. Long days chunk via existing `chunkConversation` (message-boundary).
- `channels.json` / `users.json` / `integration_logs.json` themselves → `skipped_unsupported` inside slack context (metadata, not knowledge).

**5. Google Keep (content refinement).** Extend `refineJsonFormat`: a JSON **object** (not array) whose head contains `"textContent"` → `keep`. Parser: title from `title` (fallback baseName), content from `textContent` (+ `listContent` items as `- [x] item` lines), tags `['keep', ...labels[].name]`, skip when `isArchived` or `isTrashed` true (return `[]` → `skipped_empty`). `metadata.note_date` from `userEditedTimestampUsec`. Takeout Docs (`.docx`/`.html`) already route through #17 markitdown / Phase-1 HTML — no new code, covered by a test.

**6. Evernote ENEX (new base extension).** `.enex` → `enex` parser. Zero-dep regex extraction: split on `<note>…</note>`, pull `<title>`, `<created>` (ISO-ish `yyyyMMddTHHmmssZ`), `<tag>` elements, `<content>` CDATA → strip ENML/HTML tags (reuse the Phase-1 HTML tag-strip helper), decode entities. One record per note, tags `['evernote', ...note tags]`, `metadata.note_date`. Multi-MB notebooks fine under the 10MB cap; oversized `.enex` files stay `skipped_too_large` v1.

**7. Scale.** MAX_FILES stays 200 by default; inside a recognized export context the cap rises to 2000 (constant `EXPORT_MAX_FILES`), `capped` flag still honored and surfaced in summary. Memory stays bounded: files processed one at a time; only the users map is held across files.

## Success Invariant
A user pointing `ingest` at an extracted Notion, Slack, Takeout-Keep, or Evernote export gets correctly-titled, tagged, dated knowledge records per page/day/note — and re-ingesting a newer export adds only new/changed content. Plain directories and generic JSON behave exactly as before.

## Vertical Slices

### Slice 1: ENEX + Keep (per-file, no export context — tracer bullet)
Type: AFK. Blocked by: None.
User-visible outcome: `.enex` files and extracted Keep notes ingest to per-note records.
Public interface: `ingest` tool / `runIngest`.
Test seam: parser unit tests + runIngest with memory adapter on fixtures.
Acceptance criteria:
- [ ] ENEX multi-note fixture → one record per note; HTML entities decoded; tags/dates preserved
- [ ] Keep fixture: labels → tags; archived/trashed notes skipped; list notes render checkboxes
- [ ] `refineJsonFormat` object-shape extension does not change array/chat-export behavior (existing tests green)

### Slice 2: Notion (path refinement + relPath ctx)
Type: AFK. Blocked by: Slice 1 (ships ctx.relPath plumbing).
User-visible outcome: extracted Notion export ingests with clean titles, stripped links, folder tags, DB rows.
Acceptance criteria:
- [ ] ID suffixes stripped from titles AND link text/targets
- [ ] Folder path → tags
- [ ] DB csv → one labeled record per row; `_all.csv` duplicates skipped
- [ ] A Notion-named file outside any export dir still parses correctly (pattern-only refinement)

### Slice 3: Slack (export context pre-pass)
Type: AFK. Blocked by: Slice 2.
User-visible outcome: extracted Slack export ingests per channel-day with resolved names and grouped threads.
Acceptance criteria:
- [ ] Mentions resolved via users.json; unknown IDs fall back gracefully
- [ ] Thread replies grouped under parent; join/leave noise skipped
- [ ] Tags `['slack','#<channel>']`; `metadata.date` set
- [ ] Day-file-shaped JSON outside a slack context stays generic json (detection matrix)

### Slice 4: Detection matrix, scale, dedupe, docs, ship
Type: AFK. Blocked by: Slice 3.
Acceptance criteria:
- [ ] Detection test matrix: all four export shapes + plain dir + chat exports (#18) classified correctly
- [ ] Re-ingest of grown exports adds only new content (per format)
- [ ] Export-context file cap (2000) honored with `capped` surfaced; memory bounded (one file at a time)
- [ ] team-e2e section [12]; tool count stays 22; SERVER_INSTRUCTIONS ≤2KB; README updated; version 0.14.0

## Incident Regression Map
- #16: dedupe is (type,title[,owner_scope]) — Slack titles include the date and Notion titles are page names; within-export duplicate Notion page names get the #18 deterministic ` (2)` suffix helper.
- #17: verify fixtures against live parse output before committing.
- #18: `files_scanned=5` assertions lock `tests/fixtures/ingest/` — new fixtures go in `tests/fixtures/ingest-workspace/`.
- Detection false positives are the top risk class → dedicated matrix test (slack day file outside context, json with coincidental `textContent`? — refine requires object root + key in head, documented residual risk).

## Risk-Triggered Gates
- success-invariant-check: applies (always)
- doc-alignment-check: applies (README, SERVER_INSTRUCTIONS, tool description)
- scale-claim-check: applies (export cap + bounded memory must have test evidence; no timing claim this round)
- async/schema/identity/payment/email/ui/architecture-docs/generated-artifact checks: N/A (local-only parser feature)

## Files Affected
- `src/ingest/parsers/enex.ts` — NEW
- `src/ingest/parsers/keep.ts` — NEW
- `src/ingest/parsers/notion.ts` — NEW (md + db row parsers)
- `src/ingest/parsers/slack.ts` — NEW
- `src/ingest/export-context.ts` — NEW: pure context detection + types
- `src/ingest/detect.ts` — `.enex` extension; `refineJsonFormat` keep extension; `refinePathFormat`
- `src/ingest/registry.ts` — register new parsers (enex in SUPPORTED_FORMATS; others refined)
- `src/ingest/runner.ts` — pre-pass, ctx.relPath/export plumbing, EXPORT_MAX_FILES
- `src/ingest/types.ts` — IngestContext additive fields
- `src/tools/ingest/ingest.ts`, `src/server.ts`, `README.md` — docs
- `tests/fixtures/ingest-workspace/{notion,slack,keep}/…`, `tests/fixtures/ingest-workspace/notes.enex` — NEW anonymized fixtures
- `tests/ingest-workspace.test.ts` — NEW
- `scripts/team-e2e.mjs` — section [12]
- `package.json` (0.14.0)

## Acceptance Criteria (PRD, traced)
- [ ] AC1: each format's anonymized fixture → correct records (unit + e2e)
- [ ] AC2: Notion ID suffixes stripped from titles AND links; DB rows column-labeled
- [ ] AC3: Slack mentions resolved, threads grouped, per-channel tags
- [ ] AC4: Keep labels → tags; archived/trashed skipped
- [ ] AC5: ENEX multi-note → one record per note; entities decoded
- [ ] AC6: detection matrix distinguishes all four shapes from plain dirs
- [ ] AC7: dedupe across re-exports
- [ ] AC8: large-export bounds — file cap respected + surfaced, bounded memory
- [ ] AC9: tool count 22; instructions ≤2KB; README updated; 0.14.0

## Edge Cases
- Notion page with empty name after ID strip → fallback to raw baseName
- Notion nested DB row with empty first column → `Row N` title
- Slack day file with only join/leave events → no record (`skipped_empty`)
- Slack users.json malformed → context degrades to no-resolution (raw IDs), batch continues
- Keep note with empty textContent AND listContent → skipped_empty
- ENEX with no `<note>` blocks → skipped_empty; malformed CDATA → per-note skip, file continues
- Export root nested one level deeper than target (user points at parent of `Takeout/`) → contexts detected per-directory-walk root only; document "point at the export root"

## Risks
- Vendor export drift: all detection is shape/pattern-based; unknown shapes degrade to existing generic parsers, never break.
- Slack thread replies that live in a different day file than their parent render as standalone messages that day — accepted v1 limitation, noted in README.
- 32-hex pattern false positive on user files coincidentally named like Notion pages — title strip is the only effect; content parsing identical to markdown. Accepted.
- Weekly merge deviation (one record per channel-day instead) may create many records for chatty workspaces — mitigated by dedupe + chunking; revisit with real usage.

## Artifact Manifest
- `.pipeline/classification.json`
- `.pipeline/acceptance-trace.json`
- `.pipeline/test-evidence.json`
- `.pipeline/review-results.json`
- `.pipeline/ship-manifest.json`
