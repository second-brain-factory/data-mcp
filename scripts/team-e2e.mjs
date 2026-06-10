#!/usr/bin/env node
/**
 * Team E2E test for @iwo-szapar/data-mcp — runs against the LOCAL build (dist/).
 *
 * Simulates a 2-person team (alice, bob) sharing one markdown backend root.
 * Each member runs their own MCP server process (stdio) with their own
 * MEMORYOS_OWNER_ID; both share MEMORYOS_SHARED_OWNER_ID=firma.
 *
 * Run: npm run build && node scripts/team-e2e.mjs
 *
 * Verifies:
 *  0. setup_migrate bootstraps a fresh markdown root (C2 regression guard,
 *     issue-1260: writes must work immediately after setup_migrate with no
 *     external mkdir)
 *  1. Server boots from local build, version matches package.json, 41 tools
 *  2. Private knowledge written by alice is invisible to bob
 *  3. Shared knowledge written by alice is visible to bob
 *  4. owner_scope filter on recall (private vs shared)
 *  5. Tasks: shared task created by alice can be completed by bob
 *  6. Bob cannot update alice's private record by id (no existence leak)
 *  7. brain_stats sees only the caller's visible records
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SERVER = join(REPO_ROOT, 'dist', 'index.js');
const PKG_VERSION = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version;
const ROOT = mkdtempSync(join(tmpdir(), 'data-mcp-team-e2e-'));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

async function connect(ownerId) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...process.env,
      SB_BACKEND: 'markdown',
      SB_MARKDOWN_ROOT: ROOT,
      MEMORYOS_OWNER_ID: ownerId,
      MEMORYOS_SHARED_OWNER_ID: 'firma',
    },
  });
  const client = new Client({ name: `e2e-${ownerId}`, version: '1.0.0' });
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

console.log(`Backend root: ${ROOT}`);
console.log(`Server: ${SERVER}`);
console.log('Connecting alice and bob...');
const alice = await connect('alice');
const bob = await connect('bob');

// --- 0. Schema bootstrap via setup_migrate (C2 regression guard) ---
// A fresh markdown root must become writable through MCP tool calls alone.
// No external mkdir. If this slice fails, fresh installs are dead on arrival.
console.log('\n[0] Schema bootstrap via setup_migrate');
const migrate = await call(alice, 'setup_migrate', {});
check('setup_migrate reports created collections', (migrate.created ?? 0) > 0 || (migrate.existing ?? 0) > 0, JSON.stringify(migrate).slice(0, 300));
check('setup_migrate leaves nothing needing migration', (migrate.needs_migration ?? -1) === 0, JSON.stringify(migrate).slice(0, 300));

const migrate2 = await call(alice, 'setup_migrate', {});
check('setup_migrate is idempotent (second run creates nothing)', (migrate2.created ?? -1) === 0 && (migrate2.needs_migration ?? -1) === 0, JSON.stringify(migrate2).slice(0, 300));

// --- 1. Boot + surface ---
console.log('\n[1] Boot + tool surface');
const sv = alice.getServerVersion();
check(`server version matches package.json (${PKG_VERSION})`, sv?.version === PKG_VERSION, `got ${sv?.version}`);
const tools = (await alice.listTools()).tools;
check('41 tools registered', tools.length === 41, `got ${tools.length}`);
const learnTool = tools.find((t) => t.name === 'knowledge_learn');
check('knowledge_learn exposes owner_scope param', JSON.stringify(learnTool?.inputSchema ?? {}).includes('owner_scope'));

// --- 2. Private isolation ---
console.log('\n[2] Private isolation');
const alicePrivate = await call(alice, 'knowledge_learn', {
  type: 'insight', title: 'Alice private: salary band notes', content: 'Confidential comp planning detail.',
  owner_scope: 'private', tags: ['e2e-private'],
});
check('alice stores private knowledge (no external mkdir needed)', alicePrivate.stored === true, JSON.stringify(alicePrivate).slice(0, 200));

const bobSearch = await call(bob, 'knowledge_recall', { query: 'salary band' });
const bobSeesPrivate = JSON.stringify(bobSearch).includes('Alice private');
check('bob cannot recall alice private item', !bobSeesPrivate, JSON.stringify(bobSearch).slice(0, 300));

const aliceSearch = await call(alice, 'knowledge_recall', { query: 'salary band' });
check('alice can recall her own private item', JSON.stringify(aliceSearch).includes('Alice private'));

// --- 3. Shared visibility ---
console.log('\n[3] Shared visibility');
const aliceShared = await call(alice, 'knowledge_learn', {
  type: 'pattern', title: 'Team convention: deploy on Tuesdays', content: 'We always deploy on Tuesday mornings after standup.',
  owner_scope: 'shared', tags: ['e2e-shared'],
});
check('alice stores shared knowledge', aliceShared.stored === true);

const bobShared = await call(bob, 'knowledge_recall', { query: 'Tuesday' });
check('bob sees alice shared item', JSON.stringify(bobShared).includes('deploy on Tuesdays'), JSON.stringify(bobShared).slice(0, 300));

// --- 4. owner_scope filter on recall ---
console.log('\n[4] owner_scope recall filter');
const recallTool = tools.find((t) => t.name === 'knowledge_recall');
const recallHasScope = JSON.stringify(recallTool?.inputSchema ?? {}).includes('owner_scope');
check('knowledge_recall exposes owner_scope param', recallHasScope);
if (recallHasScope) {
  const aliceSharedOnly = await call(alice, 'knowledge_recall', { query: 'Tuesday', owner_scope: 'shared' });
  const s = JSON.stringify(aliceSharedOnly);
  check('scope=shared returns shared, not private', s.includes('deploy on Tuesdays') && !s.includes('Alice private'), s.slice(0, 300));
}

// --- 5. Shared task handoff ---
console.log('\n[5] Shared task handoff (alice creates, bob completes)');
const task = await call(alice, 'task_create', {
  title: 'E2E: bob please review the pilot deck', owner_scope: 'shared', priority: 'high',
});
const taskId = task.task?.id ?? task.item?.id ?? task.id;
check('alice creates shared task', Boolean(taskId), JSON.stringify(task).slice(0, 300));

if (taskId) {
  const bobTasks = await call(bob, 'task_list', {});
  check('bob sees shared task in his list', JSON.stringify(bobTasks).includes('pilot deck'), JSON.stringify(bobTasks).slice(0, 300));
  const done = await call(bob, 'task_update', { id: taskId, status: 'done' });
  const doneStr = JSON.stringify(done);
  check('bob completes alice\'s shared task', !doneStr.toLowerCase().includes('error') && !doneStr.includes('NOT_FOUND'), doneStr.slice(0, 300));
}

// --- 6. Cross-owner write protection ---
console.log('\n[6] Cross-owner write protection');
const privId = alicePrivate.item?.id;
if (privId) {
  const bobUpdate = await call(bob, 'knowledge_update', { id: privId, content: 'bob tampering' })
    .catch((e) => ({ _err: String(e) }));
  const updStr = JSON.stringify(bobUpdate);
  check('bob blocked from updating alice private record', updStr.includes('NOT_FOUND') || updStr.includes('not found') || updStr.includes('_err') || updStr.includes('error'), updStr.slice(0, 300));
} else {
  check('bob blocked from updating alice private record', false, 'no private id captured');
}

// --- 7. brain_stats scoping ---
console.log('\n[7] brain_stats scoping');
const aliceStats = await call(alice, 'brain_stats', {});
const bobStats = await call(bob, 'brain_stats', {});
const aliceKn = aliceStats.collections?.knowledge ?? aliceStats.knowledge?.total ?? JSON.stringify(aliceStats).match(/"knowledge"[^0-9]*([0-9]+)/)?.[1];
const bobKn = bobStats.collections?.knowledge ?? bobStats.knowledge?.total ?? JSON.stringify(bobStats).match(/"knowledge"[^0-9]*([0-9]+)/)?.[1];
console.log(`  alice knowledge count: ${aliceKn}, bob: ${bobKn}`);
check('alice sees more knowledge than bob (private+shared vs shared)', Number(aliceKn) > Number(bobKn), `alice=${aliceKn} bob=${bobKn}`);

// --- summary ---
console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed: ' + failures.join(', '));
await alice.close();
await bob.close();
process.exit(fail === 0 ? 0 : 1);
