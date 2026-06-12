#!/usr/bin/env node
/**
 * Hardened-mode E2E for Supabase team setup (issue #5) — runs against the
 * LOCAL build (dist/) and a LIVE Supabase project with migration 011 applied.
 *
 * Hardened mode = each member uses SB_SUPABASE_ANON_KEY + SB_SUPABASE_MEMBER_JWT
 * (minted by scripts/mint-member-jwt.mjs). RLS scopes members at the DATABASE
 * level, closing the shared service-key bypass.
 *
 * Verifies:
 *  1. MCP team contract through member-JWT clients (private isolation,
 *     shared visibility, cross-owner not-found)
 *  2. THE POINT: direct PostgREST with member A's JWT cannot read member B's
 *     private rows (fails closed) but CAN read shared rows
 *  3. Service-role path unchanged (full access remains for admin)
 *
 * Env: SB_SUPABASE_URL, SB_SUPABASE_ANON_KEY, SB_SUPABASE_SERVICE_KEY,
 *      SUPABASE_JWT_SECRET
 * Run: npm run build && node scripts/team-e2e-supabase-hardened.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mintMemberJwt } from './mint-member-jwt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, '..', 'dist', 'index.js');
const URL = process.env.SB_SUPABASE_URL;
const ANON = process.env.SB_SUPABASE_ANON_KEY;
const SERVICE = process.env.SB_SUPABASE_SERVICE_KEY;
const SECRET = process.env.SUPABASE_JWT_SECRET;
if (!URL || !ANON || !SERVICE || !SECRET) {
  console.log('SKIP: set SB_SUPABASE_URL, SB_SUPABASE_ANON_KEY, SB_SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET');
  process.exit(0);
}

const RUN = `hard${Date.now().toString(36)}`;
const ALICE = `${RUN}-alice`;
const BOB = `${RUN}-bob`;
const SHARED = `${RUN}-team`;
const SECRET_TEXT = `alice-private-secret-${RUN}`;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const aliceJwt = mintMemberJwt({ ownerId: ALICE, sharedOwnerId: SHARED, secret: SECRET });
const bobJwt = mintMemberJwt({ ownerId: BOB, sharedOwnerId: SHARED, secret: SECRET });

async function connect(ownerId, memberJwt) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: {
      ...process.env,
      SB_BACKEND: 'supabase',
      SB_SUPABASE_URL: URL,
      SB_SUPABASE_ANON_KEY: ANON,
      SB_SUPABASE_MEMBER_JWT: memberJwt,
      SB_SUPABASE_KEY: '', // must not be needed in hardened mode
      MEMORYOS_OWNER_ID: ownerId,
      MEMORYOS_SHARED_OWNER_ID: SHARED,
    },
  });
  const client = new Client({ name: `hardened-${ownerId}`, version: '1.0.0' });
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

async function rest(path, bearer, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: ANON, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function restService(path, opts = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

console.log(`Run: ${RUN}`);
console.log('Connecting alice and bob with member JWTs (hardened mode)...');
const alice = await connect(ALICE, aliceJwt);
const bob = await connect(BOB, bobJwt);

try {
  // --- 1. MCP contract through member JWTs ---
  console.log('\n[1] MCP team contract via member-JWT clients');
  const stored = await call(alice, 'knowledge_learn', {
    type: 'insight', title: `Alice private (${RUN})`, content: SECRET_TEXT,
  });
  const recordId = stored.item?.id ?? stored.id;
  check('alice stores private knowledge via member JWT', Boolean(recordId), JSON.stringify(stored).slice(0, 200));

  const sharedStored = await call(alice, 'knowledge_learn', {
    type: 'insight', title: `Team demo schedule (${RUN})`, content: `Shared note ${RUN}: demo Fridays.`, owner_scope: 'shared',
  });
  check('alice stores shared knowledge', Boolean(sharedStored.item?.id ?? sharedStored.id), JSON.stringify(sharedStored).slice(0, 200));

  const bobRecall = await call(bob, 'knowledge_recall', { query: 'alice private' });
  check('bob MCP recall cannot see alice private', !JSON.stringify(bobRecall).includes(SECRET_TEXT), JSON.stringify(bobRecall).slice(0, 200));

  const bobShared = await call(bob, 'knowledge_recall', { query: 'demo schedule' });
  check('bob MCP recall sees shared item', JSON.stringify(bobShared).includes(`${RUN}`), JSON.stringify(bobShared).slice(0, 200));

  const bobUpdate = await call(bob, 'record_update', { collection: 'knowledge', id: recordId, data: { content: 'overwritten' } });
  check('bob cross-owner update rejected not-found', /not.?found/i.test(JSON.stringify(bobUpdate)), JSON.stringify(bobUpdate).slice(0, 200));

  // --- 2. THE POINT: direct PostgREST with bob's JWT ---
  console.log('\n[2] Direct PostgREST bypass attempt with bob member JWT');
  const bobDirect = await rest(`knowledge?owner_id=eq.${ALICE}&select=id,title,content`, bobJwt);
  check('bob direct REST sees ZERO alice private rows (fails closed)', bobDirect.status === 200 && Array.isArray(bobDirect.body) && bobDirect.body.length === 0, JSON.stringify(bobDirect).slice(0, 300));

  const bobDirectAll = await rest(`knowledge?select=content&content=ilike.*${RUN}*`, bobJwt);
  const leakedDirect = JSON.stringify(bobDirectAll.body ?? '').includes(SECRET_TEXT);
  check('alice secret absent from ANY bob direct query', !leakedDirect, JSON.stringify(bobDirectAll).slice(0, 300));

  const bobDirectShared = await rest(`knowledge?owner_id=eq.${SHARED}&select=id,title`, bobJwt);
  check('bob direct REST CAN read shared rows', bobDirectShared.status === 200 && bobDirectShared.body.length >= 1, JSON.stringify(bobDirectShared).slice(0, 200));

  const bobInsertAsAlice = await rest('knowledge', bobJwt, {
    method: 'POST',
    body: JSON.stringify({ title: 'forged', content: 'forged', type: 'insight', owner_id: ALICE }),
    headers: { Prefer: 'return=representation' },
  });
  check('bob cannot INSERT rows stamped as alice (WITH CHECK)', bobInsertAsAlice.status >= 400, JSON.stringify(bobInsertAsAlice).slice(0, 200));

  // --- 3. Service role unchanged ---
  console.log('\n[3] Service-role path unchanged');
  const svc = await restService(`knowledge?owner_id=eq.${ALICE}&select=id,title`);
  check('service key still sees all rows (BYPASSRLS)', svc.status === 200 && svc.body.length >= 1, JSON.stringify(svc).slice(0, 200));

  // --- 4. Handoff isolation under RLS (issue #9) ---
  console.log('\n[4] Handoff isolation under member-JWT RLS');
  const selfHandoff = await call(alice, 'handoff_create', {
    title: `Alice private self-handoff (${RUN})`,
    to_member: ALICE,
    owner_scope: 'private',
    what_changed: SECRET_TEXT,
  });
  check('alice creates private self-handoff via member JWT', Boolean(selfHandoff.item?.id ?? selfHandoff.id), JSON.stringify(selfHandoff).slice(0, 200));

  const sharedHandoff = await call(alice, 'handoff_create', {
    title: `Shared handoff to bob (${RUN})`,
    to_member: BOB,
    tried: [{ approach: 'rls probe', outcome: 'isolated' }],
  });
  check('alice creates shared handoff to bob', Boolean(sharedHandoff.item?.id ?? sharedHandoff.id), JSON.stringify(sharedHandoff).slice(0, 200));

  const bobHandoffDirect = await rest(`handoffs?owner_id=eq.${ALICE}&select=id,title,what_changed`, bobJwt);
  check('bob direct REST sees ZERO alice private handoffs (RLS fails closed)', bobHandoffDirect.status === 200 && Array.isArray(bobHandoffDirect.body) && bobHandoffDirect.body.length === 0, JSON.stringify(bobHandoffDirect).slice(0, 300));

  const bobHandoffShared = await rest(`handoffs?owner_id=eq.${SHARED}&select=id,title`, bobJwt);
  check('bob direct REST CAN read shared handoffs', bobHandoffShared.status === 200 && bobHandoffShared.body.length >= 1, JSON.stringify(bobHandoffShared).slice(0, 200));

  const bobInbox = await call(bob, 'handoff_list', { to_member: 'me' });
  const bobInboxStr = JSON.stringify(bobInbox);
  check('bob handoff_list "me" sees shared handoff, not alice private', bobInboxStr.includes(`Shared handoff to bob (${RUN})`) && !bobInboxStr.includes(SECRET_TEXT), bobInboxStr.slice(0, 300));
}
finally {
  console.log('\nTeardown...');
  for (const table of ['knowledge', 'decisions', 'sessions', 'goals', 'tasks', 'contacts', 'knowledge_links', 'handoffs']) {
    for (const owner of [ALICE, BOB, SHARED]) {
      const res = await restService(`${table}?owner_id=eq.${owner}`, { method: 'DELETE' });
      if (res.status >= 400) console.log(`  teardown warning: ${table}/${owner}: ${res.status}`);
    }
  }
  await alice.close().catch(() => {});
  await bob.close().catch(() => {});
}

console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (failures.length) { console.log('Failed: ' + failures.join(', ')); process.exit(1); }
