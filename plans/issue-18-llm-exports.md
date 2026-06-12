# issue-18: Ingest LLM chat exports — ChatGPT conversations.json + Claude data export

## Problem

Months of decisions and context are locked in ChatGPT/Claude conversation history. Both vendors ship official exports whose payload is a `conversations.json`. The #16 ingest framework treats any `.json` as a generic pretty-print record — useless for recall. We need vendor-aware parsers that map one conversation → one knowledge record.

## Task Classification
- Type: feature
- Scope mode: EXPANSION
- Required gates: vertical_slices, test_seams, review, perf-claim-verification (1000-convo AC)

## Domain Language
- "canonical path": ChatGPT's `mapping` is a node graph with branches (regenerations/edits); the linked-list walk backward from `current_node` via `parent` pointers yields the conversation as the user last saw it.
- "chat export": vendor data-export payload; ChatGPT = node-graph `conversations.json`, Claude = flat array with `chat_messages`.
- Parser purity invariant (#16): parsers are `(content, ctx) => IngestItem[]`; ALL I/O in runner.

## Architecture Alignment
- Source-of-truth docs: N/A — data-mcp has no `docs/architecture/`; README + SERVER_INSTRUCTIONS are the doc surface.
- Code sources checked: `src/ingest/{detect,registry,runner,chunk}.ts`, `src/ingest/parsers/json.ts`, `src/tools/ingest/ingest.ts`, `src/server.ts`.
- Alignment verdict: aligned (json.ts already reserves this seam: "Specialized JSON shapes get their own parsers in later phases").
- Required doc updates: README ingest section, SERVER_INSTRUCTIONS ingest line (≤2KB guard), tool description.
- Test/review proof: instructions-size guard test; doc-alignment-check in review.

## Interfaces and Test Seams
- `parseChatGpt(content, ctx)` / `parseClaude(content, ctx)` — pure parsers; seam: direct unit tests on fixture JSON strings.
- `sniffChatExport(parsed)` — pure shape sniffer; seam: unit tests.
- `runIngest` refinement branch — seam: runIngest with in-memory adapter on fixture files (same harness as ingest-office.test.ts).
- End-to-end recall — seam: team-e2e style MCP client OR extend existing e2e checks; chosen: new checks appended to `scripts/team-e2e.mjs` ingest section is NOT done (files_scanned assertions are fixture-dir-locked) → separate fixtures dir + runIngest-level e2e via vitest + recall check through adapter. Tool-level recall covered by existing ingest plumbing; one vitest test asserts ingested conversation content is findable via adapter.textSearch path equivalent (knowledge_recall e2e deferred to smoke of markdown backend in unit harness).

## Approach

**Detection — content refinement, not new extensions.** `.json` keeps mapping to format `json`. The runner, after reading + parsing-safe sniff, refines: if the JSON is an array whose elements have `mapping` + `current_node` → format `chatgpt`; elements with `chat_messages` → format `claude`; else generic `json`. Implemented as a pure `refineJsonFormat(content)` in detect.ts called by the runner only when format === 'json'. Records then get `source: 'ingest:chatgpt' | 'ingest:claude'` and proper `metadata.format` for free via existing runner plumbing.

**ChatGPT parser** (`src/ingest/parsers/chatgpt.ts`): per conversation, walk backward from `current_node` via `parent`, reverse; keep `user`/`assistant` text messages (`content.parts` string entries; `content_type: 'code'`, `execution_output`, author role `tool` → single `[tool use]` marker, collapsed when consecutive); skip system/empty. Compact transcript `User: …\n\nAssistant: …`. Title = conversation title (fallback "Untitled conversation"); within-export duplicate titles get deterministic ` (2)`, ` (3)` suffixes (export sorted stable by create_time). `metadata.conversation_date` from `create_time` (ISO). Tags `['chatgpt', 'conversation']`.

**Claude parser** (`src/ingest/parsers/claude.ts`): flat walk of `chat_messages` (`sender: human|assistant`); message text from `text` field, fallback to joining `content[].text` blocks (newer export shape). Same record mapping; tags `['claude', 'conversation']`; date from conversation `created_at`.

**Long conversations**: shared `chunkConversation(messages)` packs whole messages into ≤8000-char chunks (message-boundary AC); single oversized message falls back to `chunkText`. `titleChunks` adds `(part n/m)`.

**Size cap**: real heavy exports exceed the 10MB `MAX_FILE_BYTES`. Files named exactly `conversations.json` get `CHAT_EXPORT_MAX_BYTES = 200MB`. Plain `JSON.parse` (memory-bounded in practice; streaming rejected for v1 — zero-dep streaming JSON is high complexity, AC met without it; proven by perf test).

**Zip**: pre-extraction (PRD allows). `.zip` stays `skipped_unsupported`.

## Success Invariant
A user pointing `ingest` at an extracted ChatGPT or Claude export gets one recallable knowledge record per real conversation (split into parts when long), with vendor tags and conversation dates — and re-ingesting a newer export only adds new conversations. Malformed exports degrade per-file, never aborting the batch.

## Vertical Slices

### Slice 1: Claude export ingestion (simpler shape first — tracer bullet through detection refinement)
Type: AFK. Blocked by: None.
User-visible outcome: extracted Claude export ingests to per-conversation records.
Public interface: `ingest` tool / `runIngest`.
Test seam: parser unit tests on fixture JSON + runIngest with memory adapter.
Acceptance criteria:
- [ ] Claude fixture (anonymized, committed) → one record per conversation, tags `['claude','conversation']`, `metadata.conversation_date` set
- [ ] `refineJsonFormat` sniffs claude vs generic json; generic json behavior unchanged (existing tests stay green)
- [ ] Both `text` and `content[]` block message shapes parse

### Slice 2: ChatGPT export ingestion (mapping walk + branches)
Type: AFK. Blocked by: Slice 1 (shares refinement + conversation chunker).
User-visible outcome: extracted ChatGPT export ingests; regenerated branches excluded.
Acceptance criteria:
- [ ] ChatGPT fixture → per-conversation records, tags `['chatgpt','conversation']`
- [ ] Branch fixture: regenerated answer → only canonical-path content in record
- [ ] Tool/code messages → `[tool use]`, consecutive collapsed; system/empty conversations skipped
- [ ] Long conversation splits at message boundaries with `(part n/m)`
- [ ] Duplicate titles within one export get deterministic suffixes

### Slice 3: Scale, dedupe proof, docs, ship
Type: AFK. Blocked by: Slice 2.
Acceptance criteria:
- [ ] Synthetic 1000-conversation export ingests < 60s (perf test with VERIFIED claim evidence)
- [ ] `conversations.json` files up to 200MB accepted (cap test)
- [ ] Re-ingest of grown export adds only new conversations (dedupe AC)
- [ ] Malformed/truncated JSON → per-file error, batch continues
- [ ] Tool count stays 22; SERVER_INSTRUCTIONS ≤2KB; README updated; version 0.13.0

## Incident Regression Map
- #16 learning: dedupe is (type,title[,owner_scope]) — same-title conversations within one export WOULD silently drop without parser-level title dedupe → deterministic suffixes.
- #17 learning: e2e caught a wrong fixture (1-slide deck); commit fixtures only after verifying parse output against them live.
- Regression guard: existing `files_scanned=5` assertions lock `tests/fixtures/ingest/` — chat fixtures go in `tests/fixtures/ingest-llm/`.

## Risk-Triggered Gates
- success-invariant-check: applies (always)
- generated-artifact-check: N/A (no repo generation)
- async-reliability-check, schema-migration-check, identity-routing-check, payment-integrity-check, email-delivery-check, ui-journey-check: N/A (local-only parser feature)
- architecture-docs-check: N/A (no docs/architecture in repo)
- doc-alignment-check: applies (README, SERVER_INSTRUCTIONS, tool description)
- perf-claim-check: applies (1000-convo < 60s must be VERIFIED with timing evidence)

## Files Affected
- `src/ingest/parsers/chatgpt.ts` — NEW: mapping walk, canonical path, transcript builder
- `src/ingest/parsers/claude.ts` — NEW: flat walk, both message shapes
- `src/ingest/parsers/conversation.ts` — NEW: shared transcript/chunking/title-dedupe helpers
- `src/ingest/detect.ts` — `refineJsonFormat(content)` sniffer
- `src/ingest/registry.ts` — register chatgpt/claude parsers (not in SUPPORTED_FORMATS extension list; refinement formats)
- `src/ingest/runner.ts` — json refinement call + `CHAT_EXPORT_MAX_BYTES` carve-out
- `src/tools/ingest/ingest.ts` — description mentions chat exports
- `src/server.ts` — SERVER_INSTRUCTIONS ingest line (≤2KB)
- `tests/fixtures/ingest-llm/` — NEW: chatgpt.json (with branch), claude.json (anonymized)
- `tests/ingest-llm.test.ts` — NEW: parser + runner + perf tests
- `README.md`, `package.json` (0.13.0)

## Acceptance Criteria (PRD, traced)
- [ ] AC1: real-shape fixtures for both vendors parse to correct records
- [ ] AC2: ChatGPT branch fixture → canonical-path-only content
- [ ] AC3: long-conversation splitting at message boundaries proven by test
- [ ] AC4: re-ingest of grown export adds only NEW conversations
- [ ] AC5: malformed/truncated JSON → per-file error, batch continues
- [ ] AC6: 1000-conversation export < 60s, memory-bounded
- [ ] AC7: conversation dates in metadata; recall finds conversations by topic
- [ ] AC8: tool count stays 22; instructions ≤2KB; README updated

## Edge Cases
- Conversation with empty/whitespace title → "Untitled conversation"
- Conversation with only system messages → skipped (no item)
- `parts` containing non-string entries (multimodal) → non-strings dropped, `[image]` placeholder when nothing remains? No — drop silently; if message ends empty, skip message
- `current_node` missing/dangling → fall back to longest path? No — skip conversation, count in a parser-level skip (keeps batch alive)
- Claude `chat_messages: []` → skip conversation
- Generic JSON arrays that coincidentally have a `mapping` key on non-objects → sniffer requires object elements with BOTH `mapping` object and `current_node` string on first element
- 0-byte / non-array conversations.json → generic json path or per-file error (JSON.parse throws)

## Risks
- Vendor format drift: sniffer is shape-based not version-based; unknown shapes fall back to generic json (degraded, not broken)
- Memory on 200MB exports: JSON.parse peak ~3-4x file size; acceptable for a local CLI-context MCP; documented in README
- Title-suffix determinism depends on export ordering: sort conversations by create_time before title assignment

## Artifact Manifest
- `.pipeline/classification.json` (written)
- `.pipeline/acceptance-trace.json`
- `.pipeline/test-evidence.json`
- `.pipeline/review-results.json`
- `.pipeline/ship-manifest.json`
