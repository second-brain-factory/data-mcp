#!/usr/bin/env node
/**
 * client-smoke.mjs — real-client cold-start check (issue-1300 slice D).
 *
 * Unlike smoke-test.mjs (which runs the local dist/), this simulates what a
 * brand-new user actually experiences: `npx -y @iwo-szapar/data-mcp[@version]`
 * resolved from the npm REGISTRY, driven by the real MCP SDK client over
 * stdio, against an empty markdown root.
 *
 * Checks:
 *   1. cold-start boot via npx (registry package, not local build)
 *   2. published version (matches requested version when pinned)
 *   3. 41 tools registered
 *   4. setup_migrate bootstraps the fresh root (C2 guard against the registry)
 *   5. a write (knowledge_store) works immediately after
 *
 * Usage:
 *   node scripts/client-smoke.mjs            # latest from registry
 *   node scripts/client-smoke.mjs 0.7.1      # pin a version
 *
 * Local-only tool — intentionally NOT wired into CI (depends on the public
 * registry and network; CI covers the local build via smoke-test + team-e2e).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VERSION = process.argv[2]; // optional pin, e.g. 0.7.1
const SPEC = VERSION ? `@iwo-szapar/data-mcp@${VERSION}` : '@iwo-szapar/data-mcp@latest';
const ROOT = mkdtempSync(join(tmpdir(), 'data-mcp-client-smoke-'));
// Run npx from a neutral cwd: inside this repo, npx would resolve the local
// package (same name/version) instead of the registry tarball.
const NPX_CWD = mkdtempSync(join(tmpdir(), 'data-mcp-client-smoke-cwd-'));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function payload(res) {
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '';
  try { return JSON.parse(text); } catch { return { _raw: text }; }
}

console.log(`Package: ${SPEC} (npm registry via npx)`);
console.log(`Markdown root: ${ROOT}`);
console.log('Cold-starting server (npx may download the package)...');

const transport = new StdioClientTransport({
  command: 'npx',
  args: ['-y', SPEC],
  cwd: NPX_CWD,
  env: {
    ...process.env,
    SB_BACKEND: 'markdown',
    SB_MARKDOWN_ROOT: ROOT,
  },
});
const client = new Client({ name: 'client-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  check('cold-start boot via npx', true);

  const sv = client.getServerVersion();
  if (VERSION) {
    check(`server version is ${VERSION}`, sv?.version === VERSION, `got ${sv?.version}`);
  } else {
    console.log(`  INFO registry version: ${sv?.version}`);
    check('server reports a version', Boolean(sv?.version), 'no version reported');
  }

  const tools = (await client.listTools()).tools;
  check('41 tools registered', tools.length === 41, `got ${tools.length}`);

  const migrate = payload(await client.callTool({ name: 'setup_migrate', arguments: {} }));
  check('setup_migrate bootstraps fresh root (C2 guard)', (migrate.created ?? 0) > 0 && (migrate.needs_migration ?? -1) === 0, JSON.stringify(migrate).slice(0, 300));

  const store = payload(await client.callTool({
    name: 'knowledge_store',
    arguments: { type: 'fact', title: 'client-smoke check', content: 'Write works immediately after setup_migrate.' },
  }));
  const storeStr = JSON.stringify(store);
  check('knowledge_store works immediately after migrate', !storeStr.toLowerCase().includes('error') && (store.stored === true || Boolean(store.item?.id ?? store.id)), storeStr.slice(0, 300));
} catch (err) {
  check('client smoke ran', false, err?.message ?? String(err));
} finally {
  await client.close().catch(() => {});
  rmSync(ROOT, { recursive: true, force: true });
  rmSync(NPX_CWD, { recursive: true, force: true });
}

console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed: ' + failures.join(', '));
process.exit(fail === 0 ? 0 : 1);
