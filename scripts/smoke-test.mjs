#!/usr/bin/env node
/**
 * smoke-test.mjs — T0 stdio smoke test (issue-1219).
 *
 * Expects a freshly built dist/ (run `npm run build` first).
 * NOTE: the committed dist/ is the canonical 0.6.0 comparison base for
 * scripts/verify-dist.sh and intentionally carries the old hardcoded
 * server version (0.1.0). The version assertion below only passes against
 * a rebuild from src/. CI order: verify-dist (scratch build) -> build ->
 * smoke-test. Locally: `npm run build && node scripts/smoke-test.mjs`
 * then `git checkout -- dist/ && git clean -fd dist/` to restore canon.
 *
 * Starts the server with the markdown backend against a temp dir,
 * performs an MCP initialize + tools/list over stdio, and asserts:
 *   - server responds to initialize
 *   - serverInfo.version matches package.json version
 *   - exactly 44 tools are registered
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EXPECTED_TOOL_COUNT = 44;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const root = mkdtempSync(join(tmpdir(), 'data-mcp-smoke-'));
const child = spawn('node', ['dist/index.js'], {
    env: { ...process.env, SB_BACKEND: 'markdown', SB_MARKDOWN_ROOT: root },
    stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const pending = new Map();
let nextId = 1;

child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
        }
    }
});

function request(method, params) {
    const id = nextId++;
    const p = new Promise((resolve, reject) => {
        pending.set(id, resolve);
        setTimeout(() => { pending.delete(id); reject(new Error(`timeout waiting for ${method}`)); }, 10000);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return p;
}

function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

let failed = false;
function check(label, ok, detail) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed = true;
}

try {
    const init = await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'smoke-test', version: '0.0.0' },
    });
    check('initialize responds', !!init.result, init.error?.message);
    check('server version matches package.json', init.result?.serverInfo?.version === pkg.version,
        `got ${init.result?.serverInfo?.version}, want ${pkg.version}`);
    notify('notifications/initialized', {});

    const tools = await request('tools/list', {});
    const count = tools.result?.tools?.length ?? 0;
    check(`tools/list returns ${EXPECTED_TOOL_COUNT} tools`, count === EXPECTED_TOOL_COUNT, `got ${count}`);
} catch (err) {
    check('smoke test ran', false, err.message);
} finally {
    child.kill();
    rmSync(root, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
