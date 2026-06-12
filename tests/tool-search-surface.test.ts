/**
 * Tool-search surface tests.
 *
 * Under client-side tool search (Claude Code MCP Tool Search, API
 * defer_loading) two things become load-bearing and silently breakable:
 *
 *   1. Server `instructions` — the only text the model sees before deciding
 *      to search this server. Must stay under Claude Code's ~2KB truncation,
 *      and must mention every tool prefix (a stale prefix list means a whole
 *      capability becomes undiscoverable).
 *   2. `_meta["anthropic/alwaysLoad"]` on hot-path tools — keeps them loaded
 *      when everything else is deferred.
 *
 * Exercised through a real SDK client over InMemoryTransport so we test the
 * wire-visible result, not internals.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import type { DataAdapter } from '../src/adapter/types.js';

const EXPECTED_TOOL_COUNT = 22;

/** Hot-path tools that must stay loaded under tool search. */
const ALWAYS_LOAD_TOOLS = [
    'knowledge_recall',
    'knowledge_store',
    'knowledge_learn',
    'session_log',
    'record_query',
];

/** Every tool name must start with one of these prefixes, and every prefix
 *  must appear in the server instructions. */
const PREFIX_GROUPS = [
    'knowledge_',
    'session_',
    'handoff_',
    'record_',
    'brain_',
    'link_',
    'setup_',
    'ingest',
];

function makeNoopAdapter(): DataAdapter {
    return {
        backend: 'markdown',
        async create() { throw new Error('not used'); },
        async getOne() { throw new Error('not used'); },
        async list() { return { items: [], totalItems: 0, page: 1, perPage: 20 }; },
        async textSearch() { return []; },
        async update() { throw new Error('not used'); },
        async delete() { },
        async collectionExists() { return true; },
        async countRecords() { return 0; },
        ownerScopeEnabled: false,
    } as unknown as DataAdapter;
}

describe('tool-search surface', () => {
    let client: Client;
    let tools: Awaited<ReturnType<Client['listTools']>>['tools'];

    beforeAll(async () => {
        const server = createServer(makeNoopAdapter());
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        client = new Client({ name: 'tool-search-surface-test', version: '0.0.0' });
        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport),
        ]);
        tools = (await client.listTools()).tools;
    });

    it(`lists ${EXPECTED_TOOL_COUNT} tools`, () => {
        expect(tools).toHaveLength(EXPECTED_TOOL_COUNT);
    });

    it('marks hot-path tools with anthropic/alwaysLoad', () => {
        for (const name of ALWAYS_LOAD_TOOLS) {
            const tool = tools.find((t) => t.name === name);
            expect(tool, `${name} should be registered`).toBeDefined();
            expect(tool?._meta?.['anthropic/alwaysLoad'], `${name} should set anthropic/alwaysLoad`).toBe(true);
        }
    });

    it('does not mark cold tools alwaysLoad (defeats deferral if everything is hot)', () => {
        const hot = tools.filter((t) => t._meta?.['anthropic/alwaysLoad'] === true);
        expect(hot.map((t) => t.name).sort()).toEqual([...ALWAYS_LOAD_TOOLS].sort());
    });

    it('keeps readOnlyHint on converted read-only tools', () => {
        for (const name of ['knowledge_recall', 'record_query']) {
            const tool = tools.find((t) => t.name === name);
            expect(tool?.annotations?.readOnlyHint, `${name} readOnlyHint`).toBe(true);
        }
    });

    it('serves instructions under the 2KB client truncation limit', () => {
        const instructions = client.getInstructions();
        expect(instructions).toBeTruthy();
        expect(Buffer.byteLength(instructions as string, 'utf8')).toBeLessThanOrEqual(2048);
    });

    it('instructions mention every tool prefix (stale-list guard)', () => {
        const instructions = client.getInstructions() as string;
        for (const prefix of PREFIX_GROUPS) {
            expect(instructions, `instructions should mention ${prefix}*`).toContain(`${prefix}`);
        }
    });

    it('every registered tool belongs to a documented prefix group', () => {
        for (const tool of tools) {
            const matched = PREFIX_GROUPS.some((p) => tool.name.startsWith(p));
            expect(matched, `${tool.name} should match a documented prefix`).toBe(true);
        }
    });
});
