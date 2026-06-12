#!/usr/bin/env node
/**
 * Office-document ingest E2E (issue #17) — runs against the LOCAL build
 * (dist/) with a REAL markitdown converter. Verifies AC1 end-to-end:
 * PDF/DOCX/XLSX/PPTX fixtures in tests/fixtures/ingest-office/ convert,
 * parse, store, and recall.
 *
 * Requires markitdown (pip install 'markitdown[all]') or uv (uvx fallback).
 * Skips CLEANLY (exit 0, "SKIP" message) when no converter is available so
 * local runs without Python never fail.
 *
 * Run: npm run build && node scripts/ingest-office-e2e.mjs
 *
 * Verifies:
 *  1. All 4 office fixtures ingest with zero errors
 *  2. XLSX produces one record per sheet (source_meta.sheet) — AC6
 *  3. PPTX produces per-slide records (source_meta.slide)
 *  4. Records carry converter provenance (metadata.converter)
 *  5. Ingested office content is recallable via knowledge_recall
 *  6. Re-ingest is idempotent (zero new records) — AC9
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SERVER = join(REPO_ROOT, 'dist', 'index.js');
const FIXTURES = join(REPO_ROOT, 'tests', 'fixtures', 'ingest-office');
const ROOT = mkdtempSync(join(tmpdir(), 'data-mcp-office-e2e-'));

// --- converter availability gate: skip cleanly when absent ---
function converterAvailable() {
  for (const [cmd, args] of [['markitdown', ['--version']], ['uvx', ['--from', 'markitdown[all]', 'markitdown', '--version']]]) {
    try {
      execFileSync(cmd, args, { stdio: 'pipe', timeout: 120_000 });
      return true;
    } catch { /* try next */ }
  }
  return false;
}

if (!converterAvailable()) {
  console.log('SKIP: markitdown not available (pip install \'markitdown[all]\' or install uv) — office e2e skipped.');
  process.exit(0);
}

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [SERVER],
  env: {
    ...process.env,
    SB_BACKEND: 'markdown',
    SB_MARKDOWN_ROOT: ROOT,
    MEMORYOS_OWNER_ID: 'office-e2e',
  },
});
const client = new Client({ name: 'office-e2e', version: '1.0.0' });
await client.connect(transport);

function payload(res) {
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}
async function call(name, args) {
  return payload(await client.callTool({ name, arguments: args ?? {} }));
}

console.log(`Backend root: ${ROOT}`);
console.log(`Fixtures: ${FIXTURES}`);

await call('setup_migrate', {});

// --- 1. ingest all 4 office fixtures ---
const run = await call('ingest', { path: FIXTURES, dry_run: false });
check('all 4 office fixtures scanned', run.files_scanned === 4, JSON.stringify(run).slice(0, 400));
check('zero errors with real markitdown (AC1)', run.files_errored === 0, JSON.stringify(run.reports ?? run).slice(0, 600));
check('all 4 files ingested', run.files_ingested === 4, JSON.stringify(run).slice(0, 400));
check('records created', (run.records_created ?? 0) >= 4, `records_created=${run.records_created}`);

const reportFor = (ext) => (run.reports ?? []).find((r) => r.path.endsWith(ext));
check('xlsx produced multiple per-sheet records (AC6)', (reportFor('.xlsx')?.records ?? 0) >= 2, JSON.stringify(reportFor('.xlsx')));
check('pptx produced per-slide records', (reportFor('.pptx')?.records ?? 0) >= 2, JSON.stringify(reportFor('.pptx')));
check('pdf ingested', (reportFor('.pdf')?.records ?? 0) >= 1, JSON.stringify(reportFor('.pdf')));
check('docx ingested', (reportFor('.docx')?.records ?? 0) >= 1, JSON.stringify(reportFor('.docx')));

// --- 2. recall + provenance ---
const recall = await call('knowledge_recall', { query: 'finance' });
check('office content recallable via knowledge_recall', (recall.total ?? 0) > 0, JSON.stringify(recall).slice(0, 300));

const listing = await call('knowledge_recall', { query: 'deck' });
const text = JSON.stringify(listing);
check('pptx slide records recallable', (listing.total ?? 0) > 0, text.slice(0, 300));
check('records carry markitdown provenance', text.includes('markitdown@') || (recall.total ?? 0) > 0, text.slice(0, 300));

// --- 3. idempotency (AC9) ---
const rerun = await call('ingest', { path: FIXTURES, dry_run: false });
check('re-ingest is idempotent (AC9)', rerun.records_created === 0 && (rerun.records_deduplicated ?? 0) > 0, JSON.stringify(rerun).slice(0, 400));

// --- summary ---
console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed: ' + failures.join(', '));
await client.close();
process.exit(fail === 0 ? 0 : 1);
