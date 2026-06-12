#!/usr/bin/env node
/**
 * MVP test plan executor — simulates the full team-of-2 manual test plan
 * (docs/MVP-USER-TEST.md) against the PUBLISHED @iwo-szapar/data-mcp from
 * npm. Defaults to the version in this checkout's package.json; override
 * with MVP_PKG_VERSION=x.y.z to test a different published release.
 *
 * Usage:
 *   node scripts/mvp-test-plan.mjs
 *   MVP_PKG_VERSION=0.7.3 node scripts/mvp-test-plan.mjs
 *
 * Real-life fidelity:
 *  - bare git repo + two separate clones (A=iwo, B=aleksandra)
 *  - each member's MCP server points at THEIR OWN clone
 *  - git add/commit/push + pull run between steps, exactly like the
 *    TEAM-SETUP.md sync ritual
 *  - npx runs from a neutral cwd so the local checkout is never resolved
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_VERSION = process.env.MVP_PKG_VERSION
  ?? JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')).version;

const BASE = mkdtempSync(join(tmpdir(), 'mvp-team-test-'));
const BARE = join(BASE, 'team-memory-bare.git');
const CLONE_A = join(BASE, 'clone-iwo');
const CLONE_B = join(BASE, 'clone-aleksandra');
const PKG = `@iwo-szapar/data-mcp@${PKG_VERSION}`;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 400) : ''}`); }
}
function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}
function syncPush(clone, msg) {
  sh('git add -A', clone);
  try { sh(`git commit -m ${JSON.stringify(msg)}`, clone); } catch { /* nothing to commit */ }
  sh('git push origin main', clone);
}
function syncPull(clone) {
  sh('git pull --no-rebase origin main', clone);
}

async function connect(ownerId, root) {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', PKG],
    cwd: BASE, // neutral cwd — npx inside the data-mcp checkout resolves the local package and fails
    env: {
      ...process.env,
      SB_BACKEND: 'markdown',
      SB_MARKDOWN_ROOT: root,
      MEMORYOS_OWNER_ID: ownerId,
      MEMORYOS_SHARED_OWNER_ID: 'team',
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

// ============ PHASE 1: SETUP ============
console.log(`\n=== PHASE 1: Setup (base: ${BASE}) ===`);
sh(`git init --bare ${JSON.stringify(BARE)} -b main`);
sh(`git clone ${JSON.stringify(BARE)} ${JSON.stringify(CLONE_A)} 2>/dev/null`);
sh(`git clone ${JSON.stringify(BARE)} ${JSON.stringify(CLONE_B)} 2>/dev/null`);
for (const c of [CLONE_A, CLONE_B]) {
  sh('git config user.email mvp-test@example.com && git config user.name "MVP Test"', c);
}
// initial commit so pulls work
sh('touch .gitkeep', CLONE_A);
syncPush(CLONE_A, 'init');
syncPull(CLONE_B);

console.log(`Connecting iwo (clone A) and aleksandra (clone B) via npx ${PKG}...`);
const A = await connect('iwo', CLONE_A);
const B = await connect('aleksandra', CLONE_B);

const toolsA = (await A.listTools()).tools;
check('1.3 server exposes 21 tools', toolsA.length === 21, `got ${toolsA.length}`);
const sv = A.getServerVersion();
check(`1.3b published package reports version ${PKG_VERSION}`, sv?.version === PKG_VERSION, `got ${sv?.version}`);

const mig1 = await call(A, 'setup_migrate', {});
check('1.4 setup_migrate creates collections', (mig1.created ?? 0) > 0, JSON.stringify(mig1).slice(0, 200));
const mig2 = await call(A, 'setup_migrate', {});
check('1.4b setup_migrate idempotent (2nd run creates 0)', (mig2.created ?? -1) === 0, JSON.stringify(mig2).slice(0, 200));
syncPush(CLONE_A, 'bootstrap collections');
syncPull(CLONE_B);

// ============ PHASE 2: CORE CONTRACT ============
console.log('\n=== PHASE 2: Core contract ===');

// 1. A stores private
const s1 = await call(A, 'knowledge_learn', {
  type: 'insight', title: 'Negotiation floor for the pilot',
  content: 'My negotiation floor for the pilot is 4k.', owner_scope: 'private', tags: ['mvp-test'],
});
check('2.1 A stores private insight', s1.stored === true, JSON.stringify(s1).slice(0, 200));
const privateId = s1.item?.id;
syncPush(CLONE_A, 'A: private insight');

// 2. B pulls, recalls -> must find NOTHING
syncPull(CLONE_B);
const s2 = await call(B, 'knowledge_recall', { query: 'negotiation floor pilot' });
check('2.2 B cannot see A private item', !JSON.stringify(s2).includes('4k') && !JSON.stringify(s2).includes('Negotiation floor'), JSON.stringify(s2).slice(0, 300));

// 3. A stores shared
const s3 = await call(A, 'knowledge_learn', {
  type: 'pattern', title: 'Team demo schedule',
  content: 'We demo every Friday at 10.', owner_scope: 'shared', tags: ['mvp-test'],
});
check('2.3 A stores shared pattern', s3.stored === true);
syncPush(CLONE_A, 'A: shared demo schedule');

// 4. B pulls, recalls -> must find it
syncPull(CLONE_B);
const s4 = await call(B, 'knowledge_recall', { query: 'demo' });
check('2.4 B sees shared demo schedule', JSON.stringify(s4).includes('Friday at 10'), JSON.stringify(s4).slice(0, 300));

// 5. A creates shared task
const s5 = await call(A, 'record_create', {
  collection: 'tasks', data: { title: 'Review onboarding doc', priority: 'high' }, owner_scope: 'shared',
});
const taskId = s5.task?.id ?? s5.item?.id ?? s5.id;
check('2.5 A creates shared task', Boolean(taskId), JSON.stringify(s5).slice(0, 300));
syncPush(CLONE_A, 'A: shared task');

// 6. B pulls, lists, completes
syncPull(CLONE_B);
const s6list = await call(B, 'record_query', { collection: 'tasks' });
check('2.6a B sees shared task', JSON.stringify(s6list).includes('onboarding doc'), JSON.stringify(s6list).slice(0, 300));
const s6done = await call(B, 'record_update', { collection: 'tasks', id: taskId, data: { status: 'done' } });
const s6str = JSON.stringify(s6done);
check('2.6b B completes the task', !s6str.toLowerCase().includes('error') && !s6str.includes('NOT_FOUND'), s6str.slice(0, 300));
syncPush(CLONE_B, 'B: task done');

// 7. A pulls, verifies done
syncPull(CLONE_A);
const s7 = await call(A, 'record_query', { collection: 'tasks', filters: { status: 'done' } });
check('2.7 A sees task marked done', JSON.stringify(s7).includes('onboarding doc'), JSON.stringify(s7).slice(0, 300));

// 8. B tries to update A's private record by id -> not found, no leak
const s8 = await call(B, 'record_update', { collection: 'knowledge', id: privateId, data: { content: 'tampered' } }).catch((e) => ({ _err: String(e) }));
const s8str = JSON.stringify(s8);
check('2.8 B blocked from updating A private record (no existence leak)',
  s8str.includes('not found') || s8str.includes('NOT_FOUND') || s8str.includes('_err') || s8str.includes('error'), s8str.slice(0, 300));

// 9. brain stats scoping
const statsA = await call(A, 'brain_stats', {});
const statsB = await call(B, 'brain_stats', {});
const knA = Number(JSON.stringify(statsA).match(/"knowledge"[^0-9]*([0-9]+)/)?.[1]);
const knB = Number(JSON.stringify(statsB).match(/"knowledge"[^0-9]*([0-9]+)/)?.[1]);
check('2.9 A knowledge count > B (private+shared vs shared)', knA > knB, `A=${knA} B=${knB}`);

// ============ PHASE 3: SEARCH QUALITY (0.7.3+) ============
console.log('\n=== PHASE 3: Search quality (stemming + any-term fallback) ===');

// 10. A stores shared pricing insight
const s10 = await call(A, 'knowledge_learn', {
  type: 'insight', title: 'Pricing experiment results',
  content: 'The Q2 pricing experiment increased conversion by 12 percent.', owner_scope: 'shared', tags: ['mvp-test'],
});
check('3.10 A stores pricing insight', s10.stored === true);
syncPush(CLONE_A, 'A: pricing insight');
syncPull(CLONE_B);

// 11. B recalls with plural
const s11 = await call(B, 'knowledge_recall', { query: 'pricing experiments' });
check('3.11 plural query finds item via stemming', JSON.stringify(s11).includes('Pricing experiment results'), JSON.stringify(s11).slice(0, 300));

// 12. B natural multi-word query (not a contiguous substring)
const s12 = await call(B, 'knowledge_recall', { query: 'what happened with conversion and pricing' });
const s12str = JSON.stringify(s12);
check('3.12a natural multi-word query finds item', s12str.includes('Pricing experiment results'), s12str.slice(0, 300));
check('3.12b response reports any_term_fallback', s12str.includes('any_term_fallback'), s12str.slice(0, 300));

// 13. nonsense query -> zero
const s13 = await call(B, 'knowledge_recall', { query: 'flibbertigibbet zzqx' });
check('3.13 nonsense query returns zero results', (s13.total ?? -1) === 0, JSON.stringify(s13).slice(0, 200));

// ============ PHASE 4: CONCURRENT-WRITE FRICTION ============
console.log('\n=== PHASE 4: Concurrent-write friction probe ===');

// Both write WITHOUT pulling first
const c1 = await call(A, 'knowledge_learn', {
  type: 'insight', title: 'Concurrent write from iwo', content: 'A wrote this without pulling.', owner_scope: 'shared', tags: ['mvp-test'],
});
const c2 = await call(B, 'knowledge_learn', {
  type: 'insight', title: 'Concurrent write from aleksandra', content: 'B wrote this without pulling.', owner_scope: 'shared', tags: ['mvp-test'],
});
check('4.1a both concurrent writes stored locally', c1.stored === true && c2.stored === true,
  `c1=${JSON.stringify(c1).slice(0, 200)} c2=${JSON.stringify(c2).slice(0, 200)}`);

syncPush(CLONE_A, 'A: concurrent write');
// B pushes second -> must pull/merge first
sh('git add -A', CLONE_B);
try { sh('git commit -m "B: concurrent write"', CLONE_B); } catch (e) { console.log('  B commit: ' + String(e?.stdout ?? e).slice(0, 150)); }
let mergedCleanly = true;
try {
  sh('git pull --no-rebase --no-edit origin main', CLONE_B);
  sh('git push origin main', CLONE_B);
} catch (e) {
  mergedCleanly = false;
  console.log('  merge error: ' + String(e).slice(0, 300));
}
check('4.1b concurrent creates merge cleanly (different files)', mergedCleanly);

syncPull(CLONE_A);
const after = await call(A, 'knowledge_recall', { query: 'concurrent write' });
const afterStr = JSON.stringify(after);
check('4.1c both concurrent items visible to A after sync', afterStr.includes('from iwo') && afterStr.includes('from aleksandra'), afterStr.slice(0, 400));

// 4.2 file inspection: frontmatter intact, no junk
const knowledgeDir = join(CLONE_A, 'knowledge');
const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'));
check('4.2a knowledge dir has expected record count', files.length === 5, `got ${files.length}: ${files.join(', ')}`);
let allValid = true;
let badFile = '';
for (const f of files) {
  const raw = readFileSync(join(knowledgeDir, f), 'utf8');
  if (!raw.includes('owner_id:') || !raw.includes('title:') || !raw.includes('type:')) {
    allValid = false; badFile = f; break;
  }
}
check('4.2b every record has intact frontmatter with owner_id', allValid, badFile);
const junk = readdirSync(BASE).filter((f) => !['team-memory-bare.git', 'clone-iwo', 'clone-aleksandra'].includes(f));
check('4.2c no junk files outside clones', junk.length === 0, junk.join(', '));

// Cleanup test items (plan step: "clean up the test items")
console.log('\n=== Cleanup: deleting test items ===');
const allItems = await call(A, 'record_query', { collection: 'knowledge', limit: 50 });
const ids = (allItems.items ?? allItems.results ?? []).map((i) => i.id).filter(Boolean);
let deleted = 0;
for (const id of ids) {
  const d = await call(A, 'record_delete', { collection: 'knowledge', id, confirm: true }).catch(() => null);
  if (d && !JSON.stringify(d).includes('error')) deleted++;
}
console.log(`  deleted ${deleted}/${ids.length} knowledge items visible to A`);

// ============ SUMMARY ============
console.log(`\n${'='.repeat(60)}\nMVP TEST RESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed: ' + failures.join(' | '));
console.log(`Workspace (inspect then delete): ${BASE}`);
await A.close();
await B.close();
process.exit(fail === 0 ? 0 : 1);
