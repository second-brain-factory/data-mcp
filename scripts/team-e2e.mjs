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
 *     external mkdir) and writes a .gitignore covering _archive/ so
 *     soft-deleted records never reach a shared team repo (0.7.4)
 *  1. Server boots from local build, version matches package.json, 22 tools
 *  2. Private knowledge written by alice is invisible to bob
 *  3. Shared knowledge written by alice is visible to bob
 *  4. owner_scope filter on recall (private vs shared)
 *  5. Tasks: shared task created by alice can be completed by bob
 *  6. Bob cannot update alice's private record by id (no existence leak)
 *  7. brain_stats sees only the caller's visible records
 *  8. Search stemming + any-term fallback (issue #1297): inflected and
 *     multi-word queries find items; exact-match queries unchanged
 *  9. Handoff packets (issue #9): alice hands off to bob with evidence
 *     fields, bob lists/accepts/completes, private-to-other rejected,
 *     third-member visibility rules hold
 * 10. Ingest (issue #16): dry-run previews without writing, real run makes
 *     fixture content recallable, re-ingest creates zero duplicates,
 *     brain-root ingestion refused
 * 11. LLM chat exports (issue #18): ChatGPT + Claude conversations.json
 * 12. Workspace exports (issue #19): Notion, Slack, Keep, Evernote ENEX
 *     ingest by shape detection, conversations recallable by topic,
 *     regenerated branches excluded, re-ingest idempotent
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

// _archive/ gitignore guard (0.7.4): soft-deleted records must never reach a
// shared team repo via `git add -A`. setup_migrate must write the rule on the
// first run and not duplicate it on re-runs.
const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
check('setup_migrate writes .gitignore covering _archive/', gitignore.split('\n').some((l) => l.trim() === '_archive/'), JSON.stringify(gitignore).slice(0, 200));
check('first setup_migrate reports protections_created', Array.isArray(migrate.details?.protections_created) && migrate.details.protections_created.length > 0, JSON.stringify(migrate.details ?? {}).slice(0, 300));
check('.gitignore _archive/ rule not duplicated after second run', gitignore.split('\n').filter((l) => l.trim() === '_archive/').length === 1);

// --- 1. Boot + surface ---
console.log('\n[1] Boot + tool surface');
const sv = alice.getServerVersion();
check(`server version matches package.json (${PKG_VERSION})`, sv?.version === PKG_VERSION, `got ${sv?.version}`);
const tools = (await alice.listTools()).tools;
check('22 tools registered', tools.length === 22, `got ${tools.length}`);
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
const task = await call(alice, 'record_create', {
  collection: 'tasks', data: { title: 'E2E: bob please review the pilot deck', priority: 'high' }, owner_scope: 'shared',
});
const taskId = task.task?.id ?? task.item?.id ?? task.id;
check('alice creates shared task', Boolean(taskId), JSON.stringify(task).slice(0, 300));

if (taskId) {
  const bobTasks = await call(bob, 'record_query', { collection: 'tasks' });
  check('bob sees shared task in his list', JSON.stringify(bobTasks).includes('pilot deck'), JSON.stringify(bobTasks).slice(0, 300));
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

// --- 8. Search stemming + any-term fallback (issue #1297) ---
console.log('\n[8] Search stemming + any-term fallback');
const searchSeed = await call(alice, 'knowledge_learn', {
  type: 'insight', title: 'Pricing experiment results', content: 'The Q2 pricing experiment increased conversion by 12 percent.',
  owner_scope: 'shared', tags: ['e2e-search'],
});
check('seed item stored for search slice', searchSeed.stored === true);

// 8a. Exact-match query still works (ranking path untouched)
const exact = await call(alice, 'knowledge_recall', { query: 'Pricing experiment' });
const exactStr = JSON.stringify(exact);
check('exact-match query finds item without fallback', exactStr.includes('Pricing experiment results') && !exactStr.includes('any_term_fallback'), exactStr.slice(0, 300));

// 8b. Inflected single word: "experiments" (plural) must match "experiment"
const inflected = await call(alice, 'knowledge_recall', { query: 'experiments' });
check('inflected query (experiments) finds item via stemming', JSON.stringify(inflected).includes('Pricing experiment results'), JSON.stringify(inflected).slice(0, 300));

// 8c. Multi-word natural query where the full phrase is NOT a substring
const multi = await call(alice, 'knowledge_recall', { query: 'pricing conversion results' });
const multiStr = JSON.stringify(multi);
check('multi-word query falls back to any-term matching', multiStr.includes('Pricing experiment results'), multiStr.slice(0, 300));
check('fallback response reports matched_via', multiStr.includes('any_term_fallback'), multiStr.slice(0, 300));

// 8d. Verb inflection: "experimenting" -> stem "experiment"
const verbed = await call(alice, 'knowledge_recall', { query: 'experimenting with prices' });
check('verb-inflected multi-word query finds item', JSON.stringify(verbed).includes('Pricing experiment results'), JSON.stringify(verbed).slice(0, 300));

// 8e. Garbage query still returns zero (fallback does not hallucinate matches)
const garbage = await call(alice, 'knowledge_recall', { query: 'zzqx flibbertigibbet' });
check('nonsense query returns no results', (garbage.total ?? -1) === 0, JSON.stringify(garbage).slice(0, 200));

// --- 9. Handoff packets (issue #9) ---
console.log('\n[9] Handoff packets');
const handoff = await call(alice, 'handoff_create', {
  title: 'E2E: webhook retry investigation',
  to_member: 'bob',
  what_changed: 'Narrowed failure to the retry path; reproducer in scripts/repro.sh',
  tried: [{ approach: 'replay original event', outcome: 'still 500 — not payload-dependent' }],
  assumptions: ['idempotency keys are unique per attempt'],
  blocked_on: 'need prod log access',
  next_steps: ['check Stripe API version pinning'],
  needs_verification: ['confirm the reproducer still fails on main'],
  recheck_by: '2026-07-01',
});
const handoffId = handoff.item?.id;
check('alice creates handoff for bob (shared by default)', Boolean(handoffId), JSON.stringify(handoff).slice(0, 300));

const bobInbox = await call(bob, 'handoff_list', { to_member: 'me', status: 'open' });
const bobInboxStr = JSON.stringify(bobInbox);
check('bob sees the open handoff via to_member "me"', bobInboxStr.includes('webhook retry investigation'), bobInboxStr.slice(0, 300));
check('packet evidence fields intact (tried + needs_verification)', bobInboxStr.includes('not payload-dependent') && bobInboxStr.includes('reproducer still fails'), bobInboxStr.slice(0, 400));

if (handoffId) {
  const accepted = await call(bob, 'handoff_update', { id: handoffId, status: 'accepted' });
  check('bob accepts: accepted_at stamped', typeof accepted.item?.accepted_at === 'string' && accepted.item.accepted_at.length > 0, JSON.stringify(accepted).slice(0, 300));
  const completed = await call(bob, 'handoff_update', { id: handoffId, status: 'completed' });
  check('bob completes: completed_at stamped', typeof completed.item?.completed_at === 'string', JSON.stringify(completed).slice(0, 300));
  const aliceView = await call(alice, 'handoff_list', { status: 'completed' });
  check('alice sees the handoff completed', JSON.stringify(aliceView).includes('webhook retry investigation'), JSON.stringify(aliceView).slice(0, 300));
}

const privateToOther = await call(alice, 'handoff_create', {
  title: 'E2E: should be rejected', to_member: 'bob', owner_scope: 'private',
});
const privRejStr = JSON.stringify(privateToOther);
check('private handoff to another member is rejected', privRejStr.includes('invisible') || privRejStr.includes('error'), privRejStr.slice(0, 300));

const selfNote = await call(alice, 'handoff_create', {
  title: 'E2E: alice self-handoff note', to_member: 'alice', owner_scope: 'private',
});
check('private self-handoff allowed', selfNote.created === true, JSON.stringify(selfNote).slice(0, 300));

const bobHandoffs = await call(bob, 'handoff_list', {});
check('bob cannot see alice private self-handoff', !JSON.stringify(bobHandoffs).includes('self-handoff note'), JSON.stringify(bobHandoffs).slice(0, 300));

// --- 10. Ingest (issue #16) ---
console.log('\n[10] Ingest');
const FIXTURES = join(REPO_ROOT, 'tests', 'fixtures', 'ingest');

const dryRun = await call(alice, 'ingest', { path: FIXTURES });
check('ingest defaults to dry_run preview', dryRun.dry_run === true && (dryRun.records_created ?? 0) > 0, JSON.stringify(dryRun).slice(0, 300));

const dryRecall = await call(alice, 'knowledge_recall', { query: 'Onboarding Guide' });
check('dry_run writes nothing', (dryRecall.total ?? -1) === 0, JSON.stringify(dryRecall).slice(0, 300));

const realRun = await call(alice, 'ingest', { path: FIXTURES, dry_run: false });
check('ingest writes records', realRun.dry_run === false && (realRun.records_created ?? 0) > 0 && (realRun.files_errored ?? -1) === 0, JSON.stringify(realRun).slice(0, 300));

const ingested = await call(alice, 'knowledge_recall', { query: 'Onboarding Guide' });
check('ingested markdown recallable via knowledge_recall', JSON.stringify(ingested).includes('Onboarding Guide'), JSON.stringify(ingested).slice(0, 300));

const rerun = await call(alice, 'ingest', { path: FIXTURES, dry_run: false });
check('re-ingest is idempotent (zero new records)', (rerun.records_created ?? -1) === 0 && (rerun.records_deduplicated ?? 0) > 0, JSON.stringify(rerun).slice(0, 300));

const brainRoot = await call(alice, 'ingest', { path: ROOT, dry_run: false });
check('ingesting the brain root is refused', JSON.stringify(brainRoot).includes('Refusing to ingest'), JSON.stringify(brainRoot).slice(0, 300));

const badPath = await call(alice, 'ingest', { path: join(ROOT, '..', 'nope-does-not-exist-e2e') });
check('nonexistent path returns clean error', JSON.stringify(badPath).includes('Path not found'), JSON.stringify(badPath).slice(0, 200));

// --- 11. LLM chat exports (issue #18) ---
console.log('\n[11] LLM chat exports');
const LLM_FIXTURES = join(REPO_ROOT, 'tests', 'fixtures', 'ingest-llm');

const llmRun = await call(alice, 'ingest', { path: LLM_FIXTURES, dry_run: false });
check('chat exports ingest with zero errors', (llmRun.files_errored ?? -1) === 0 && (llmRun.records_created ?? 0) >= 5, JSON.stringify(llmRun).slice(0, 400));

const topicRecall = await call(alice, 'knowledge_recall', { query: 'sourdough starter' });
check('claude conversation recallable by topic', (topicRecall.total ?? 0) > 0 && JSON.stringify(topicRecall).includes('Sourdough'), JSON.stringify(topicRecall).slice(0, 300));

const gptRecall = await call(alice, 'knowledge_recall', { query: 'pasta dough hydration' });
const gptText = JSON.stringify(gptRecall);
check('chatgpt conversation recallable by topic, canonical path only', (gptRecall.total ?? 0) > 0 && !gptText.includes('REGENERATED-AWAY'), gptText.slice(0, 300));

const llmRerun = await call(alice, 'ingest', { path: LLM_FIXTURES, dry_run: false });
check('chat export re-ingest is idempotent', (llmRerun.records_created ?? -1) === 0 && (llmRerun.records_deduplicated ?? 0) > 0, JSON.stringify(llmRerun).slice(0, 300));

// --- 12. Workspace exports (issue #19) ---
// Each export is ingested from ITS OWN root (real usage: "point at the
// export root") — slack context detection requires users.json at the root.
console.log('\n[12] Workspace exports');
const WS_FIXTURES = join(REPO_ROOT, 'tests', 'fixtures', 'ingest-workspace');

const notionRun = await call(alice, 'ingest', { path: join(WS_FIXTURES, 'notion'), dry_run: false });
const slackRun = await call(alice, 'ingest', { path: join(WS_FIXTURES, 'slack'), dry_run: false });
const keepRun = await call(alice, 'ingest', { path: join(WS_FIXTURES, 'keep'), dry_run: false });
const enexRun = await call(alice, 'ingest', { path: join(WS_FIXTURES, 'notes.enex'), dry_run: false });
const wsCreated = ['notion', 'slack', 'keep', 'enex'].map((k, i) => [notionRun, slackRun, keepRun, enexRun][i].records_created ?? 0);
const wsErrors = [notionRun, slackRun, keepRun, enexRun].reduce((n, r) => n + (r.files_errored ?? 1), 0);
check('all four workspace exports ingest with zero errors', wsErrors === 0 && wsCreated.reduce((a, b) => a + b, 0) >= 10, JSON.stringify({ wsCreated, wsErrors }));

const notionRecall = await call(alice, 'knowledge_recall', { query: 'Roadmap MVP summer' });
const notionHit = (notionRecall.results ?? []).find((r) => r.title === 'Roadmap');
check('notion page recallable with clean title and ID-free content', !!notionHit && !/[0-9a-f]{32}/.test(`${notionHit.title}\n${notionHit.content}`), JSON.stringify(notionHit ?? notionRecall).slice(0, 300));

const slackRecall = await call(alice, 'knowledge_recall', { query: 'staging deploy migration' });
const slackHit = (slackRecall.results ?? []).find((r) => r.title === '#general 2024-06-12');
check('slack channel-day recallable with resolved names', !!slackHit && slackHit.content.includes('Marco Rossi') && !slackHit.content.includes('U02BBB222'), JSON.stringify(slackHit ?? slackRecall).slice(0, 300));

const enexRecall = await call(alice, 'knowledge_recall', { query: 'hydration coil folds' });
check('evernote note recallable with decoded entities', (enexRecall.total ?? 0) > 0 && JSON.stringify(enexRecall).includes('Sourdough hydration experiments'), JSON.stringify(enexRecall).slice(0, 300));

const keepGone = await call(alice, 'knowledge_recall', { query: 'ARCHIVED-NOTE-MARKER' });
check('archived keep note NOT ingested', !(keepGone.results ?? []).some((r) => `${r.title}\n${r.content}`.includes('ARCHIVED-NOTE-MARKER')), JSON.stringify(keepGone).slice(0, 200));

const wsRerun = await call(alice, 'ingest', { path: join(WS_FIXTURES, 'notion'), dry_run: false });
check('workspace export re-ingest is idempotent', (wsRerun.records_created ?? -1) === 0 && (wsRerun.records_deduplicated ?? 0) > 0, JSON.stringify(wsRerun).slice(0, 300));

// --- summary ---
console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed: ' + failures.join(', '));
await alice.close();
await bob.close();
process.exit(fail === 0 ? 0 : 1);
