# issue-20: Email archive ingestion — mbox (Gmail Takeout / Thunderbird) + .eml

## Problem

Email threads hold decisions and context predating any note system. Gmail Takeout produces mbox; every client saves `.eml`. The ingest tool can't read either.

## Task Classification
- Type: feature
- Scope mode: EXPANSION
- Required gates: vertical_slices, test_seams, review, scale-claim (memory)
- Merge policy: auto-merge-approved (standing approval for issues 16–20 batch)

## Domain Language
- mbox: RFC 4155 — messages delimited by `From ` lines at column 0
- Message: RFC 2822 headers + MIME body; encoded-words per RFC 2047
- Thread: messages grouped by References/In-Reply-To + normalized subject

## Architecture Alignment
- Source of truth: `README.md` ingest section, `src/server.ts` SERVER_INSTRUCTIONS, issue #13 single-tool constraint, #16 parser purity invariant
- Verdict: intentional-change-updates-docs (README + tool description + SERVER_INSTRUCTIONS in same PR; 2KB guard stays green)

## Interfaces and Test Seams
- `runIngest(adapter, opts)` — public seam for all integration tests (in-memory adapter)
- `parseEmailMessage(raw)` / `groupEmailThreads(emails)` — pure unit seams
- `ingest` MCP tool — e2e seam via team-e2e section [13]

## Approach

**Purity split (the central decision):** a multi-GB mbox cannot pass through the
`(content, ctx) => IngestItem[]` contract — V8 strings cap near 512MB and the runner
buffers whole files. So the streaming I/O lives in the runner (where ALL I/O already
lives) and the parsing stays pure at message granularity:

1. `src/ingest/email/mime.ts` — pure: `parseEmailMessage(raw: string) => ParsedEmail`.
   Header unfolding, RFC 2047 encoded-word decode (B/Q; utf-8/iso-8859-1/us-ascii via
   Buffer, others best-effort latin1), MIME multipart walk (nested), quoted-printable +
   base64 decode, prefer `text/plain`, fall back to tag-stripped `text/html` via the
   existing `htmlToText`, skip attachment parts (names recorded). Body text capped at
   16KB per message at parse time (records cap content at 10000 chars anyway) — this is
   what bounds memory.
2. `src/ingest/email/threads.ts` — pure: `groupEmailThreads(emails) => IngestItem[]`.
   Group by References/In-Reply-To chain, fall back to normalized subject (strip
   Re:/Fwd:/Fw: prefixes, case-insensitive). One record per thread, chronological,
   rendered via the existing `chunkConversation` (`From <sender> (<date>):` blocks,
   `(part n/m)` splitting). Quoted-reply trimming: strip `>`-quoted blocks and their
   `On ... wrote:` attribution lines in multi-message threads. Bulk-mail skip:
   `List-Unsubscribe` header or `Precedence: bulk|list` → excluded (counted in
   `source_meta.bulk_skipped`), unless `include_bulk: true`.
3. `src/ingest/parsers/eml.ts` — pure registry parser for `.eml` (fits existing 10MB
   path): single message per record via the same mime + thread modules.
4. Runner: `.mbox` extension → streamed path (never `fs.readFile`). Stream splitter
   reads chunks, splits on `\nFrom ` boundaries, feeds each raw message to
   `parseEmailMessage`, frees the raw buffer, accumulates capped `ParsedEmail`s, then
   `groupEmailThreads` → `writeItem` loop. mbox bypasses `MAX_FILE_BYTES` (like
   conversations.json) with a 4GB sanity cap.
5. New optional tool param `include_bulk?: boolean` (default false) threaded through
   `IngestOptions`.

## Success Invariant
A Gmail Takeout mbox or a folder of .eml files ingests to one recallable record per
thread with decoded headers and deduplicated quoted content, without the process
exceeding bounded memory, and re-ingest creates zero duplicates.

## Vertical Slices

### Slice 1: Pure MIME message parser
Type: AFK · Blocked by: None
Outcome: `parseEmailMessage` handles headers (folding, RFC 2047), multipart (nested),
QP/base64, text-plain preference, html fallback, attachment names, body cap.
Test seam: unit tests on raw message fixtures.
- [ ] AC7: non-ASCII encoded-word headers decoded (B and Q, utf-8 + latin1)
- [ ] multipart/alternative prefers text/plain; html-only message converts via htmlToText
- [ ] base64 and quoted-printable bodies decode; attachments skipped with names kept

### Slice 2: Thread grouping + .eml parser
Type: AFK · Blocked by: Slice 1
Outcome: `.eml` files ingest end-to-end; threads group; quotes trimmed; bulk skipped.
Test seam: `runIngest` with in-memory adapter on .eml fixture directory.
- [ ] AC3: Re:/Fwd: variants + References land in one record
- [ ] AC4: quoted-reply trimming proven (no duplicated content in a thread record)
- [ ] AC5: bulk-mail skip on by default; `include_bulk: true` ingests it
- [ ] AC6: .eml single file + directory modes (directory groups shared threads)

### Slice 3: mbox streaming in the runner
Type: AFK · Blocked by: Slice 2
Outcome: `.mbox` files of any size ingest via the stream path.
Test seam: `runIngest` on mbox fixture; synthetic large-mbox memory test.
- [ ] AC1: multi-thread mbox fixture (multipart, b64, QP, html-only) → correct thread records
- [ ] AC2: large synthetic mbox streamed with bounded memory (see deviation D2)
- [ ] mbox `From ` escaping (`>From `) unescaped in bodies; dedupe/idempotency holds

### Slice 4: Docs, e2e, version
Type: AFK · Blocked by: Slice 3
Outcome: README (incl. PII note + got-your-back combo), tool description,
SERVER_INSTRUCTIONS (≤2KB), team-e2e section [13], v0.15.0.
- [ ] AC8: PII note documented (participants in metadata, owner_scope default private)
- [ ] e2e: mbox + eml ingest, thread recall, idempotent re-ingest
- [ ] 2KB instructions guard green; smoke at 0.15.0

## Approved-deviation requests (mirror of #19 pattern)
- **D1 — progress reporting:** MCP is request/response; no live progress channel.
  Summary reports message/thread/bulk-skipped counts instead. (AC2's "progress
  reporting" satisfied via final counts.)
- **D2 — memory AC scaled for CI:** generate a ~64MB synthetic mbox in-test (a 1GB
  fixture would blow up CI) and assert RSS delta < 150MB; the bound is architectural
  (streaming + 16KB/message cap), not size-dependent.
- **D3 — .eml cross-file threading:** directory of .eml DOES thread-group (cheap — same
  pure function), but only within one ingest run; mbox is the primary thread path.
- **D4 — extensionless Thunderbird folders:** v1 requires the `.mbox` extension;
  README documents "rename Thunderbird folder files to <name>.mbox". Content-sniffing
  extensionless files would touch the walk contract for all formats.

## Incident Regression Map
- #18 lesson: vendor-shape JSON refinement — not applicable (extension-based here)
- #19 lesson: caps/routing only inside recognized contexts — mbox streaming path
  triggers ONLY on `.mbox` extension; all other formats keep the buffered path
- Existing `files_scanned=5` fixture-lock tests must stay green (new fixtures in
  `tests/fixtures/ingest-email/`)

## Risk-Triggered Gates
- success-invariant-check: always
- scale-claim (memory): applies — AC2
- doc-alignment-check: applies — README/tool/instructions
- All payment/identity/schema/email-delivery/UI gates: N/A (local-file MCP tool)

## Files Affected
- `src/ingest/email/mime.ts` — NEW pure MIME parser
- `src/ingest/email/threads.ts` — NEW pure thread grouping + rendering
- `src/ingest/parsers/eml.ts` — NEW registry parser
- `src/ingest/detect.ts` — `.eml` in EXTENSION_MAP; `.mbox` detection
- `src/ingest/registry.ts` — register eml
- `src/ingest/runner.ts` — mbox streaming branch + `include_bulk` plumb
- `src/tools/ingest/ingest.ts` — `include_bulk` param + description
- `src/server.ts`, `README.md` — docs
- `tests/ingest-email.test.ts`, `tests/fixtures/ingest-email/` — NEW
- `scripts/team-e2e.mjs` — section [13]
- `package.json` — 0.15.0

## Edge Cases
- Malformed message in mbox → per-message skip, batch continues (mirrors per-file isolation)
- `From ` inside body without escaping (rare broken producers) → split heuristic requires
  `From ` + plausible envelope rest-of-line; misfires degrade to an extra parse error, never data loss
- Empty thread after quote-trimming → keep the newest message untrimmed (never emit empty records)
- Duplicate Message-IDs across mbox → second occurrence skipped (idempotent within file)
- CRLF vs LF line endings — both handled throughout

## Risks
- Hand-rolled MIME misses an exotic encoding → per-message error isolation + best-effort
  latin1 fallback; faithful raw header kept in `source_meta` for debugging
- Quote-trimming over-trims inline replies → trim only contiguous `>`-blocks ≥2 lines;
  inline single-line quotes survive

## Artifact Manifest
- `.pipeline/classification.json`, `.pipeline/acceptance-trace.json`,
  `.pipeline/test-evidence.json`, `.pipeline/review-results.json`
