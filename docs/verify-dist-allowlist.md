# verify-dist allowlist evidence (issue-1219)
## Class A — trailing newline (editor-touched after tsc build)
tsc emits no trailing newline; these canon files have one: config.js, config.d.ts, factory.js, factory.d.ts (+ scan for more)
## Class B — hand-authored dist files (never compiler output)
Evidence: no .js.map, blank lines preserved (tsc strips), d.ts missing `private` member stubs tsc always emits:
- dist/adapter/owner-scope.js/.d.ts
- dist/adapter/markdown.js/.d.ts
- dist/tools/memory/link-{create,delete,related,suggest}.js/.d.ts
- dist/tools/setup/setup-bootstrap.js (d.ts map exists? verify)
Consequence: 0.6.0 dist was partially hand-patched compiled output. Reconstructed source becomes the new truth; rebuilt dist for 0.7.0 differs from 0.6.0 in exactly: Class A + Class B normalization + version fixes. Verified instead by smoke tests + per-file review.

## markdown.ts verification (Class B, hand-authored canon)
- js: semantic-identical (normalize: strip blank lines, join split ifs, trailing comma before `)`). Verified via node normalize-compare.
- d.ts: semantic-identical except our build emits header JSDoc (canon hand-authored d.ts lacks it) + our d.ts has sourceMappingURL (canon lacks .map files entirely).
- Canon uses AdapterError codes outside the AdapterErrorCode union ('config','not_found','io','validation') — hand-written JS never type-checked. Source preserves runtime bytes via erased `as never` casts.
- pocketbase/supabase gotcha: `readonly backend: "x" = 'x'` — annotation raw text (double quotes) flows to d.ts, initializer raw text (single quotes) flows to .js.

## Class B additions (canon internally inconsistent — hand-patched .js without d.ts regen)
- tools/register: canon .js JSDoc says "39 register functions", canon .d.ts says "35". Single tsc emit cannot differ. Source says 39 (matches .js + reality: 26+4+11=41 tools but 39... wait, count is of register functions). Our rebuilt d.ts will say 39 (1-word diff vs canon d.ts).
- tools/setup/setup-status: canon .js header has RC-1 incident paragraph; canon .d.ts header lacks it (stale, pre-patch). Our rebuilt d.ts includes the paragraph.
- tools/setup/setup-status.js: canon ENDS with trailing newline after sourceMappingURL (unusual); our emit lacks it. Class A newline diff.
- tools/setup/setup-migrate.d.ts: canon stale (lacks RC-3 paragraph present in canon .js). Our rebuilt d.ts includes it.
- tools/setup/setup-migrate.js + setup-bootstrap.js: canon ends with trailing newline; tsc emits without. Class A.
- tools/setup/setup-bootstrap: canon ships NO .d.ts and NO .map files (hand-patched). Our build emits them — superset, acceptable.
- setup-bootstrap supabaseUrl: canon JS reads `adapter.supabaseUrl` (untyped). Source casts `(adapter as unknown as { supabaseUrl?: string }).supabaseUrl` — verified: tsc erases the assertion fully, emitted JS reads `adapter.supabaseUrl` matching canon byte-for-byte.

## tools/memory batch verification (2026-06-10, final 17)
- session-log: PASS (Class A nl only on .js)
- session-list, goal-create, goal-update, goal-list: PASS / PASS(nl) — all byte-identical modulo trailing newline
- task-create, task-update, task-list: PASS / PASS(nl)
- contact-create, contact-update, contact-list, contact-search: PASS / PASS(nl)
- brain-stats, brain-decay: PASS byte-identical (tuple annotations `Promise<[string, number]>` + `as string|null|undefined` cast erase fully)
- link-create, link-delete, link-related: PASS(nl) — byte-identical modulo trailing newline. Note: link-* canon d.ts have NO header JSDoc (hand-authored, Class B) — matched by omitting blank line after header in .ts so JSDoc binds to import (suppressed in d.ts? NO — verified actual emit matched canon)
- link-suggest: Class B. Canon .js uses single-line `for (x) stmt;` and `if (c) return v;` bodies (tsc always expands to 2 lines). SEMANTIC-IDENTICAL verified via esbuild minify-normalize compare (exit: identical minified output). Local interfaces (KnowledgeItem) + type-only constructs erase; remaining diffs are formatting-only.
- link-related: local erased interface KnowledgeLink for typed field access; emit byte-matches canon.
ALL 26 memory tools now verified. Full module set complete: 26 memory + 4 setup + 11 business + core/adapters.

## issue-1260 (2026-06-10): C2 fix rebuilds — Class B entries retired
The C2 setup_migrate fix changed `src/adapter/{types,markdown,schema-map,owner-scope}.ts` and `src/tools/setup/{setup-migrate,setup-status}.ts`. Their dist counterparts were rebuilt with tsc and committed, so dist is now TRUE compiler output for those modules:
- Removed Class B entries: adapter/markdown.{js,d.ts}, adapter/owner-scope.{js,d.ts}, tools/setup/setup-migrate.d.ts, tools/setup/setup-status.d.ts
- Removed extra: entries: adapter/markdown + adapter/owner-scope .map files (now committed)
- These modules now hold the standard invariant: dist == tsc(src), no allowlist needed.
Behavior delta (intentional, issue-1260): `setup_migrate` auto-creates collection dirs on backends exposing the optional `DataAdapter.createCollection` capability (markdown only); `knowledge_links` added to setup_migrate/setup_status expected-collection lists; supabase/pocketbase behavior unchanged. Regression guard: `scripts/team-e2e.mjs` slice 0.
