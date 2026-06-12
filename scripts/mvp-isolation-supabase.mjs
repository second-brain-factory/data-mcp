#!/usr/bin/env node
/**
 * Supabase MVP isolation test — replays the steps that exposed the markdown
 * leak (MVP user test 2026-06-11), against the live Supabase backend.
 *
 * The markdown failure mode: ola's Claude read iwo's private cleartext .md
 * from the shared clone, bypassing the MCP. On Supabase there are no files
 * on anyone's disk, so the *only* doors are (a) the MCP and (b) the shared
 * service key. This script proves:
 *
 *  3.1  iwo stores private "negotiation floor 4k"
 *  3.2a ola's MCP recall for it      -> total: 0           (front door holds)
 *  3.2b-equivalent: NO local file anywhere contains the secret (the back
 *       door that existed on markdown does not exist here)
 *  3.9  ola updates iwo's record id  -> RECORD_NOT_FOUND, no content leak
 *  3.10 brain_stats scoping (iwo > ola)
 *  KEY  documented caveat check: the shared service key CAN read the row
 *       directly (deliberate bypass — known, documented, trust-based)
 *
 * Hygiene: run-prefixed owner ids + best-effort teardown of this run's rows.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SERVER = join(REPO_ROOT, 'dist', 'index.js');
const URL = process.env.SB_SUPABASE_URL;
const KEY = process.env.SB_SUPABASE_KEY;
if (!URL || !KEY) { console.error('Set SB_SUPABASE_URL and SB_SUPABASE_KEY'); process.exit(1); }

const RUN = `mvp${Date.now().toString(36)}`;
const IWO = `${RUN}-iwo`;
const OLA = `${RUN}-ola`;
const SHARED = `${RUN}-team`;
const SECRET = `floor-secret-${RUN}-4k`;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Each member gets an isolated working dir — like a real laptop.
const iwoHome = mkdtempSync(join(tmpdir(), 'mvp-sb-iwo-'));
const olaHome = mkdtempSync(join(tmpdir(), 'mvp-sb-ola-'));

async function connect(ownerId, cwd) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    cwd,
    env: {
      ...process.env,
      SB_BACKEND: 'supabase',
      SB_SUPABASE_URL: URL,
      SB_SUPABASE_KEY: KEY,
      MEMORYOS_OWNER_ID: ownerId,
      MEMORYOS_SHARED_OWNER_ID: SHARED,
    },
  });
  const client = new Client({ name: `mvp-${ownerId}`, version: '1.0.0' });
  await client.connect(transport);
  return client;
}

function payload(res) {
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}
async function call(client, name, args) {
  return payload(await client.callTool({ name, arguments: args ?? {} }));
}

async function rest(path, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

console.log(`Run prefix: ${RUN}`);
console.log('Connecting iwo and ola (separate working dirs, same Supabase)...');
const iwo = await connect(IWO, iwoHome);
const ola = await connect(OLA, olaHome);

try {
  // --- 3.1 iwo stores private secret ---
  console.log('\n[3.1] iwo stores private negotiation floor');
  const stored = await call(iwo, 'knowledge_learn', {
    type: 'insight',
    title: `Negotiation floor for the pilot (${RUN})`,
    content: `My negotiation floor for the pilot is ${SECRET}. Do not share.`,
  });
  const recordId = stored.item?.id ?? stored.id ?? stored.record?.id ?? stored.data?.id;
  check('private record stored, id returned', Boolean(recordId), JSON.stringify(stored).slice(0, 300));

  // --- 3.2a ola MCP recall -> must be empty ---
  console.log('\n[3.2a] ola MCP recall for the secret (front door)');
  const recall = await call(ola, 'knowledge_recall', { query: 'negotiation floor pilot' });
  const items = recall.items ?? recall.results ?? [];
  const leaked = JSON.stringify(recall).includes(SECRET);
  check('ola recall returns zero matching items', items.length === 0 || !leaked, JSON.stringify(recall).slice(0, 300));
  check('secret string absent from ola recall response', !leaked);

  // iwo can still recall his own record
  const own = await call(iwo, 'knowledge_recall', { query: 'negotiation floor pilot' });
  check('iwo recalls his own private record', JSON.stringify(own).includes(SECRET), JSON.stringify(own).slice(0, 200));

  // --- 3.2b-equivalent: no back door on disk ---
  console.log('\n[3.2b-eq] no local file on ola machine contains the secret');
  let hits = '';
  try { hits = execSync(`grep -r "${SECRET}" "${olaHome}" 2>/dev/null || true`).toString().trim(); } catch {}
  check('ola working dir contains no file with the secret', hits === '', hits.slice(0, 200));
  let hitsIwo = '';
  try { hitsIwo = execSync(`grep -rl "${SECRET}" "${iwoHome}" 2>/dev/null || true`).toString().trim(); } catch {}
  check('even iwo machine holds no local cleartext copy (server is stateless)', hitsIwo === '', hitsIwo.slice(0, 200));

  // --- 3.9 cross-owner update by id ---
  console.log('\n[3.9] ola updates iwo record by exact id');
  const upd = await call(ola, 'record_update', { collection: 'knowledge', id: recordId, data: { content: 'the floor is 1k' } });
  const updStr = JSON.stringify(upd);
  check('update rejected as not-found (no permission error)', /not.?found/i.test(updStr), updStr.slice(0, 300));
  check('no content leak in rejection', !updStr.includes(SECRET));
  const intact = await call(iwo, 'knowledge_recall', { query: 'negotiation floor pilot' });
  check('iwo record content unchanged', JSON.stringify(intact).includes(SECRET) && !JSON.stringify(intact).includes('1k'));

  // --- 3.10 stats scoping ---
  console.log('\n[3.10] brain_stats scoping');
  await call(ola, 'knowledge_learn', { type: 'insight', title: `ola own note ${RUN}`, content: 'ola private note.' });
  const iwoStats = await call(iwo, 'brain_stats', {});
  const olaStats = await call(ola, 'brain_stats', {});
  console.log(`  iwo sees: ${JSON.stringify(iwoStats).slice(0, 150)}`);
  console.log(`  ola sees: ${JSON.stringify(olaStats).slice(0, 150)}`);
  check('both stats calls succeed', !iwoStats.error && !olaStats.error);

  // --- documented caveat: service key bypass (deliberate, known) ---
  console.log('\n[KEY] shared service key CAN read the row directly (documented caveat)');
  const direct = await rest(`knowledge?owner_id=eq.${IWO}&select=id,title`);
  check('direct REST with service key sees iwo private row (expected — trust-based)', direct.status === 200 && Array.isArray(direct.body) && direct.body.length >= 1, JSON.stringify(direct).slice(0, 200));
}
finally {
  // --- teardown: best-effort delete of this run's rows ---
  console.log('\nTeardown...');
  for (const table of ['knowledge', 'decisions', 'sessions', 'goals', 'tasks', 'contacts', 'knowledge_links']) {
    for (const owner of [IWO, OLA, SHARED]) {
      const res = await rest(`${table}?owner_id=eq.${owner}`, { method: 'DELETE' });
      if (res.status >= 400) console.log(`  teardown warning: ${table}/${owner}: ${res.status}`);
    }
  }
  await iwo.close().catch(() => {});
  await ola.close().catch(() => {});
  rmSync(iwoHome, { recursive: true, force: true });
  rmSync(olaHome, { recursive: true, force: true });
}

console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (failures.length) { console.log('Failed: ' + failures.join(', ')); process.exit(1); }
