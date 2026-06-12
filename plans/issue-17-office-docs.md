# issue-17: Office document ingestion — PDF/DOCX/XLSX/PPTX via markitdown sidecar

## Problem
Phase-1 ingest (#16) handles plain formats only. The highest-volume real knowledge containers are PDFs, Word docs, spreadsheets, and decks. data-mcp is Node; all serious office parsing is Python — bundling is off the table for an npx-installed MCP server.

## Task Classification
- Type: feature
- Scope mode: EXPANSION
- Required gates: vertical_slices, test_seams, review, surface-guard (stays 22), verify-dist

## Domain Language
- Converter sidecar: external binary that emits markdown; v1 = markitdown, swap-in path = docling
- Converted format: a format whose file is binary on disk and must pass through the sidecar before parsing
- Parser purity invariant (#16): parsers are `(content, ctx) => IngestItem[]`; ALL I/O lives in the runner — conversion is I/O, so it happens in the runner, and the office parser stays pure on the converted markdown

## Architecture Alignment
- Source-of-truth: README Tools/Ingest section, docs/TEAM-SETUP.md, SERVER_INSTRUCTIONS (≤2KB)
- Code sources checked: src/ingest/{types,detect,runner,registry}.ts, parsers/markdown.ts, tools/ingest/ingest.ts, .github/workflows/ci.yml
- Verdict: intentional-change-updates-docs — formats list grows; tool count stays 22
- Required doc updates: README (office formats + markitdown requirement), SERVER_INSTRUCTIONS ingest line, tool description

## Grounded Evidence (verified live, 2026-06-12)
- `uvx --from "markitdown[all]" markitdown <file>` converts all 4 fixture formats; exit 0 + stdout markdown on success, exit 1 + stderr on failure
- Plain `markitdown` (no extras) FAILS on PDF with a pip-install hint — detection must prefer PATH binary but conversion errors surface markitdown's own stderr hint
- `markitdown --version` → `markitdown 0.1.6` (provenance string)
- XLSX → `## Sheet Name` H2 per sheet; PPTX → `<!-- Slide number: N -->` + `# Title`; DOCX → headings + paragraphs
- Fixtures generated: mini.pdf (452B), report.docx (1.4KB), finance.xlsx 2-sheet (3.4KB), deck.pptx (28KB, python-pptx)

## Interfaces and Test Seams
- `src/ingest/convert.ts` — `createConverter(execImpl?)` → `{ available(): Promise<ConverterInfo|null>, convert(path): Promise<string> }` — exec injectable; unit tests use fake exec; detection cached per converter instance (= per ingest call)
- `src/ingest/parsers/office.ts` — PURE `(markdown, ctx+format) => IngestItem[]` — unit-testable with captured markitdown output strings, no Python needed
- Runner branch for converted formats — integration tests with stub converter; real-markitdown e2e gated by availability (`describe.skipIf`)
- `scripts/ingest-office-e2e.mjs` — boots server, ingests office fixtures; skips cleanly when markitdown unavailable; CI leg installs `markitdown[all]` via pip

## Approach
- `detect.ts`: add `CONVERTED_EXTENSION_MAP` (.pdf→pdf, .docx→docx, .xlsx→xlsx, .pptx→pptx; pass-through best-effort: .epub, .doc, .xls, .ppt — handled, not advertised). New `detectConvertedFormat()`.
- `convert.ts`: detection order (1) `markitdown --version` on PATH, (2) `uvx --from markitdown[all] markitdown --version` (longer timeout, may download). Cache verdict per instance. `convert()` runs the detected command with `timeout: 60_000`, `maxBuffer: 32MB`, SIGKILL on hang.
- `sanitize`: strip `<script|iframe|object|embed>` blocks + event-handler attrs from converted markdown before parsing (untrusted file content).
- `parsers/office.ts`: takes converted markdown. XLSX: force one record per H2 section (sheet), title `file — Sheet`. PPTX: split on slide-number comments, title `file — Slide N (Title)`. PDF/DOCX: reuse markdown section logic (export `splitSections` from markdown.ts). All chunked via chunkText.
- `runner.ts`: converted-format branch — size/exists checks as today; skip utf8/binary sniff; converter unavailable → per-file error `"<fmt> support requires markitdown — install with: pip install 'markitdown[all]' (or have uv installed for uvx fallback)"`; conversion failure → per-file error with stderr tail. `metadata.converter: 'markitdown@<version>'`, `metadata.format: '<fmt>'`.
- `IngestOptions.converter?` for test injection; default `createConverter()` per run.
- CI: new `office-ingest` job — setup-python, `pip install 'markitdown[all]'`, build, run `scripts/ingest-office-e2e.mjs`.

## Success Invariant
With markitdown available, ingesting a directory of PDF/DOCX/XLSX/PPTX files produces recallable, correctly-titled knowledge records with converter provenance; without markitdown, the same call completes cleanly with per-file install-hint errors and plain formats unaffected; re-runs create zero duplicates.

## Vertical Slices
### Slice 1: converter sidecar + office parser (pure layer)
AFK · convert.ts with injectable exec; office.ts parser; unit tests on captured markitdown output
### Slice 2: runner integration + graceful degradation
AFK · converted-format branch; install-hint errors; dedupe/idempotency for office records; tool description update
### Slice 3: e2e + CI leg + docs
AFK · fixtures committed; ingest-office-e2e.mjs; CI office job; README/INSTRUCTIONS

## Incident Regression Map
- #13 context-pollution: NO new tools; parser plugin only; instructions stay ≤2KB (test-guarded)
- #16 plain-format invariants must not regress: existing fixtures dir untouched (office fixtures in `tests/fixtures/ingest-office/` so files_scanned=5 assertions hold)
- Committed-dist discipline: scratch build + rsync; verify-dist PASS; revert sourcemap-only noise

## Risk-Triggered Gates
- success-invariant-check: applies (above)
- async-reliability-check: applies — child process timeout (60s SIGKILL), no orphan processes, per-file failure isolation
- generated-artifact-check: N/A
- schema-migration-check: N/A (metadata jsonb exists)
- ui-journey-check: N/A
- architecture-docs-check: applies (formats list in 3 doc surfaces)

## Files Affected
- `src/ingest/convert.ts` — NEW converter sidecar
- `src/ingest/parsers/office.ts` — NEW pure parser for converted markdown
- `src/ingest/detect.ts` — converted-extension map
- `src/ingest/types.ts` — ConverterInfo, IngestOptions.converter
- `src/ingest/runner.ts` — converted-format branch
- `src/ingest/parsers/markdown.ts` — export splitSections
- `src/tools/ingest/ingest.ts` — description mentions office formats
- `src/server.ts` — instructions line (≤2KB)
- `tests/ingest-office.test.ts`, `tests/fixtures/ingest-office/` — NEW
- `scripts/ingest-office-e2e.mjs` — NEW
- `.github/workflows/ci.yml` — office-ingest job
- `README.md`, `package.json` (0.12.0), `dist/**`

## Acceptance Criteria
- [ ] AC1: with markitdown, PDF/DOCX/XLSX/PPTX fixtures each produce correct chunked records (e2e; CI leg with pip-installed markitdown)
- [ ] AC2: without markitdown, per-file error with install hint; batch continues; plain formats unaffected
- [ ] AC3: converter detection cached per ingest call (unit: fake exec called once for N files)
- [ ] AC4: 60s timeout per file; hung converter killed, reported as per-file error
- [ ] AC5: script/iframe content stripped from converted markdown before storage
- [ ] AC6: XLSX → one record per sheet, sheet name in title
- [ ] AC7: tool count stays 22 (surface guard untouched and green)
- [ ] AC8: CI has a markitdown leg
- [ ] AC9: office re-ingest idempotent (content-hash dedupe holds)
- [ ] AC10: instructions ≤2KB; README updated

## Edge Cases
- markitdown on PATH but missing [pdf] extras → conversion fails per-file with markitdown's own pip hint (verified live)
- Empty conversion output (blank PDF) → skipped_empty
- uvx first-run package download exceeding detect timeout → detection failure = converter unavailable (hint mentions pip install)
- .doc/.xls/.ppt legacy: attempted, failure surfaces per-file; never advertised in docs
- Office file > 10MB → existing skip path

## Risks
- uvx download latency on cold cache → detection timeout generous (120s) but conversion timeout 60s per AC4
- markitdown output format drift between versions → parser tolerant: section split is best-effort, whole-doc fallback always works

## Artifact Manifest
- `.pipeline/{classification,acceptance-trace,test-evidence,review-results}.json` (gitignored)
