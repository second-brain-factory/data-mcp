#!/usr/bin/env node
/**
 * Team E2E test for @iwo-szapar/data-mcp — Supabase backend, LOCAL build (dist/).
 *
 * Simulates a 2-person team (alice, bob) sharing one Supabase project.
 * Each member runs their own MCP server process (stdio) with their own
 * MEMORYOS_OWNER_ID; both share the same MEMORYOS_SHARED_OWNER_ID.
 *
 * Run: npm run build && SB_SUPABASE_URL=... SB_SUPABASE_KEY=... node scripts/team-e2e-supabase.mjs
 *
 * SKIPS (exit 0) when SB_SUPABASE_URL / SB_SUPABASE_KEY are not set, so it is
 * safe to wire into CI before secrets exist.
 *
 * Designed for a SHARED test project:
 *  - owner IDs are unique per run (e2e-alice-<runid>), so concurrent/old runs
 *    never bleed into each other's visibility checks
 *  - teardown deletes this run's rows from every scoped table (best effort)
 *
 * Contract differences vs the markdown suite (scripts/team-e2e.mjs):
 *  - Supabase needs real DDL, so setup_migrate must REPORT, never create
 *    (auto-apply is PRD T7, not shipped). Slice 0 asserts created === 0 and
 *    that the schema is already in place. If owner_id columns are missing,
 *    apply migrations/supabase/ in order — 009_align_to_production.sql adds
 *    owner_id to all scoped tables.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SB_SUPABASE_URL;
const SUPABASE_KEY = process.env.SB_SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('SKIP: SB_SUPABASE_URL / SB_SUPABASE_KEY not set — Supabase team E2E not run.');
  console.log('Set both env vars to run this suite against a Supabase project.');
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SERVER = join(REPO_ROOT, 'dist', 'index.js');
const PKG_VERSION = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).version;

// Run-unique owners: shared test project hygiene. No run sees another run's rows.
const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ALICE = `e2e-alice-${RUN_ID}`;
const BOB = `e2e-bob-${RUN_ID}`;
const SHARED = `e2e-firma-${RUN_ID}`;
const SCOPED_TABLES = ['knowledge', 'decisions', 'sessions', 'goals', 'tasks', 'contacts', 'knowledge_links', 'handoffs'];

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
      SB_BACKEND: 'supabase',
      SB_SUPABASE_URL: SUPABASE_URL,
      SB_SUPABASE_KEY: SUPABASE_KEY,
      MEMORYOS_OWNER_ID: ownerId,
      MEMORYOS_SHARED_OWNER_ID: SHARED,
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

async function cleanup() {
  // realtime transport stub: supabase-js >= 2.108 throws at createClient() on
  // Node 20 without native WebSocket unless a transport is supplied. We never
  // use realtime here.
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    realtime: { transport: class { close() {} } },
  });
  for (const table of SCOPED_TABLES) {
    try {
      await sb.from(table).delete().in('owner_id', [ALICE, BOB, SHARED]);
    } catch (err) {
      console.log(`  cleanup warning: ${table}: ${err?.message ?? err}`);
    }
  }
}

console.log(`Supabase project: ${SUPABASE_URL}`);
console.log(`Server: ${SERVER}`);
console.log(`Run id: ${RUN_ID} (alice=${ALICE}, bob=${BOB}, shared=${SHARED})`);
console.log('Connecting alice and bob...');
const alice = await connect(ALICE);
const bob = await connect(BOB);

try {
  // --- 0. setup_migrate contract: REPORT, never create (no auto-DDL on supabase) ---
  console.log('\n[0] setup_migrate report-only contract');
  const migrate = await call(alice, 'setup_migrate', {});
  check('setup_migrate identifies supabase backend', migrate.backend === 'supabase', JSON.stringify(migrate).slice(0, 300));
  check('setup_migrate creates nothing on supabase (report-only, auto-apply is PRD T7)', (migrate.created ?? -1) === 0, JSON.stringify(migrate).slice(0, 300));
  check(
    'schema already applied (needs_migration = 0)',
    (migrate.needs_migration ?? -1) === 0,
    `needs_migration=${migrate.needs_migration}. Apply migrations/supabase/ in order — 009_align_to_production.sql adds owner_id to scoped tables. Details: ${JSON.stringify(migrate.details?.needs_migration ?? []).slice(0, 300)}`,
  );

  // --- 1. Boot + surface ---
  console.log('\n[1] Boot + tool surface');
  const sv = alice.getServerVersion();
  check(`server version matches package.json (${PKG_VERSION})`, sv?.version === PKG_VERSION, `got ${sv?.version}`);
  const tools = (await alice.listTools()).tools;
  check('21 tools registered', tools.length === 21, `got ${tools.length}`);
  const learnTool = tools.find((t) => t.name === 'knowledge_learn');
  check('knowledge_learn exposes owner_scope param', JSON.stringify(learnTool?.inputSchema ?? {}).includes('owner_scope'));

  // --- 2. Private isolation ---
  console.log('\n[2] Private isolation');
  const alicePrivate = await call(alice, 'knowledge_learn', {
    type: 'insight', title: `Alice private ${RUN_ID}: salary band notes`, content: 'Confidential comp planning detail.',
    owner_scope: 'private', tags: ['e2e-private', `e2e-${RUN_ID}`],
  });
  check('alice stores private knowledge', alicePrivate.stored === true, JSON.stringify(alicePrivate).slice(0, 200));

  const bobSearch = await call(bob, 'knowledge_recall', { query: 'salary band' });
  const bobSeesPrivate = JSON.stringify(bobSearch).includes(`Alice private ${RUN_ID}`);
  check('bob cannot recall alice private item', !bobSeesPrivate, JSON.stringify(bobSearch).slice(0, 300));

  const aliceSearch = await call(alice, 'knowledge_recall', { query: 'salary band' });
  check('alice can recall her own private item', JSON.stringify(aliceSearch).includes(`Alice private ${RUN_ID}`), JSON.stringify(aliceSearch).slice(0, 300));

  // --- 3. Shared visibility ---
  console.log('\n[3] Shared visibility');
  const aliceShared = await call(alice, 'knowledge_learn', {
    type: 'pattern', title: `Team convention ${RUN_ID}: deploy on Tuesdays`, content: 'We always deploy on Tuesday mornings after standup.',
    owner_scope: 'shared', tags: ['e2e-shared', `e2e-${RUN_ID}`],
  });
  check('alice stores shared knowledge', aliceShared.stored === true);

  const bobShared = await call(bob, 'knowledge_recall', { query: 'deploy on Tuesdays' });
  check('bob sees alice shared item', JSON.stringify(bobShared).includes(`Team convention ${RUN_ID}`), JSON.stringify(bobShared).slice(0, 300));

  // --- 4. owner_scope filter on recall ---
  console.log('\n[4] owner_scope recall filter');
  const recallTool = tools.find((t) => t.name === 'knowledge_recall');
  const recallHasScope = JSON.stringify(recallTool?.inputSchema ?? {}).includes('owner_scope');
  check('knowledge_recall exposes owner_scope param', recallHasScope);
  if (recallHasScope) {
    const aliceSharedOnly = await call(alice, 'knowledge_recall', { query: `${RUN_ID}`, owner_scope: 'shared' });
    const s = JSON.stringify(aliceSharedOnly);
    check('scope=shared returns shared, not private', s.includes(`Team convention ${RUN_ID}`) && !s.includes(`Alice private ${RUN_ID}`), s.slice(0, 300));
  }

  // --- 5. Shared task handoff ---
  console.log('\n[5] Shared task handoff (alice creates, bob completes)');
  const task = await call(alice, 'record_create', {
    collection: 'tasks', data: { title: `E2E ${RUN_ID}: bob please review the pilot deck`, priority: 'high' }, owner_scope: 'shared',
  });
  const taskId = task.task?.id ?? task.item?.id ?? task.id;
  check('alice creates shared task', Boolean(taskId), JSON.stringify(task).slice(0, 300));

  if (taskId) {
    const bobTasks = await call(bob, 'record_query', { collection: 'tasks' });
    check('bob sees shared task in his list', JSON.stringify(bobTasks).includes(`E2E ${RUN_ID}`), JSON.stringify(bobTasks).slice(0, 300));
    const done = await call(bob, 'record_update', { collection: 'tasks', id: taskId, data: { status: 'done' } });
    const doneStr = JSON.stringify(done);
    check('bob completes alice\'s shared task', !doneStr.toLowerCase().includes('error') && !doneStr.includes('NOT_FOUND'), doneStr.slice(0, 300));
  }

  // --- 6. Cross-owner write protection ---
  console.log('\n[6] Cross-owner write protection');
  const privId = alicePrivate.item?.id;
  if (privId) {
    const bobUpdate = await call(bob, 'record_update', { collection: 'knowledge', id: privId, data: { content: 'bob tampering' } })
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

  // --- 8. Handoff packets (issue #9) — live table roundtrip ---
  console.log('\n[8] Handoff packets');
  const handoff = await call(alice, 'handoff_create', {
    title: `E2E ${RUN_ID}: auth debugging handoff`,
    to_member: BOB,
    what_changed: 'Rotated the JWT secret and re-minted member tokens.',
    tried: [{ approach: 'token refresh', outcome: 'failed — expired mid-flight' }],
    needs_verification: ['staging login flow'],
  });
  const handoffId = handoff.handoff?.id ?? handoff.item?.id ?? handoff.id;
  check('alice creates handoff for bob', Boolean(handoffId), JSON.stringify(handoff).slice(0, 300));

  if (handoffId) {
    const bobInbox = await call(bob, 'handoff_list', { to_member: 'me' });
    const inboxStr = JSON.stringify(bobInbox);
    check('bob sees handoff via to_member "me"', inboxStr.includes(`E2E ${RUN_ID}`), inboxStr.slice(0, 300));
    check('evidence fields intact over supabase (tried objects)', inboxStr.includes('expired mid-flight'), inboxStr.slice(0, 300));
    const accepted = await call(bob, 'handoff_update', { id: handoffId, status: 'accepted' });
    const accStr = JSON.stringify(accepted);
    check('bob accepts handoff (accepted_at stamped)', accStr.includes('accepted_at') && !accStr.toLowerCase().includes('"error"'), accStr.slice(0, 300));
  } else {
    check('bob sees handoff via to_member "me"', false, 'no handoff id captured');
    check('evidence fields intact over supabase (tried objects)', false, 'no handoff id captured');
    check('bob accepts handoff (accepted_at stamped)', false, 'no handoff id captured');
  }
} finally {
  console.log('\nCleaning up run data...');
  await cleanup();
  await alice.close();
  await bob.close();
}

// --- summary ---
console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed: ' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
