/**
 * Unit tests for MarkdownAdapter frontmatter roundtrip — specifically the
 * objects-inside-list-items case (handoffs.tried, sessions.decisions_made).
 * Regression: stringifyScalar previously hit String(v) for objects and
 * corrupted values to "[object Object]" (found by team-e2e.mjs check
 * "packet evidence fields intact", issue #9 Slice 1).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MarkdownAdapter } from '../src/adapter/markdown.js';

let root: string;
let adapter: MarkdownAdapter;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'data-mcp-roundtrip-'));
    adapter = new MarkdownAdapter(root);
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('MarkdownAdapter frontmatter roundtrip', () => {
    it('roundtrips objects inside list items (handoffs.tried shape)', async () => {
        const tried = [
            { approach: 'JWT refresh', result: 'failed', notes: 'token expired mid-flight' },
            { approach: 'session pinning', result: 'worked' },
        ];
        const created = await adapter.create('handoffs', {
            title: 'Auth debugging handoff',
            tried,
            status: 'open',
        });
        const fetched = await adapter.getOne<Record<string, unknown>>('handoffs', created.id as string);
        expect(fetched.tried).toEqual(tried);
    });

    it('roundtrips mixed scalar and object list items', async () => {
        const items = ['plain string', { nested: true, count: 3 }, 42];
        const created = await adapter.create('handoffs', { title: 'mixed', tried: items });
        const fetched = await adapter.getOne<Record<string, unknown>>('handoffs', created.id as string);
        expect(fetched.tried).toEqual(items);
    });

    it('roundtrips nested arrays inside list items', async () => {
        const items = [{ steps: ['a', 'b'], depth: 2 }];
        const created = await adapter.create('handoffs', { title: 'nested', tried: items });
        const fetched = await adapter.getOne<Record<string, unknown>>('handoffs', created.id as string);
        expect(fetched.tried).toEqual(items);
    });

    it('leaves strings that merely look like JSON-ish but are invalid as raw strings', async () => {
        const items = ['{not valid json', '[also not]'];
        const created = await adapter.create('handoffs', { title: 'invalid-json', tried: items });
        const fetched = await adapter.getOne<Record<string, unknown>>('handoffs', created.id as string);
        // '{not valid json' doesn't end with } so stays raw; '[also not]' fails
        // JSON.parse and falls back to the raw string.
        expect(fetched.tried).toEqual(items);
    });

    it('still roundtrips plain scalar lists (no regression)', async () => {
        const items = ['alpha', 'beta', 'gamma'];
        const created = await adapter.create('handoffs', { title: 'scalars', next_steps: items });
        const fetched = await adapter.getOne<Record<string, unknown>>('handoffs', created.id as string);
        expect(fetched.next_steps).toEqual(items);
    });
});
