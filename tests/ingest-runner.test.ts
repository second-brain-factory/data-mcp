/**
 * Unit tests for the ingest runner + tool: directory walking, dry-run
 * semantics, dedupe/idempotency, per-file error isolation, owner_scope
 * passthrough, and the markdown-root safety refusal.
 *
 * Uses the real fixtures in tests/fixtures/ingest/ plus an in-memory mock
 * adapter (same seam as record-tools.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter, Filter, ListResult } from '../src/adapter/types.js';
import { runIngest, contentHash } from '../src/ingest/runner.js';
import { registerIngest } from '../src/tools/ingest/ingest.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ingest');

type Handler = (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

/** In-memory knowledge store honoring the (type,title[,owner_scope]) dedupe filter. */
function makeMemoryAdapter(opts: { ownerScopeEnabled?: boolean } = {}) {
    const records: Array<Record<string, unknown>> = [];
    const adapter = {
        backend: 'markdown',
        async create(_collection: string, data: Record<string, unknown>) {
            const rec = { id: `r${records.length + 1}`, created_at: new Date().toISOString(), ...data };
            records.push(rec);
            return rec;
        },
        async getOne(_c: string, id: string) { return { id }; },
        async list(_collection: string, options?: { filter?: Filter }): Promise<ListResult<Record<string, unknown>>> {
            const groups = options?.filter ?? [];
            const items = records.filter((r) =>
                groups.length === 0 || groups.some((clauses) => clauses.every((c) => r[c.field] === c.value)));
            return { items, totalItems: items.length, page: 1, perPage: 20 };
        },
        async textSearch() { return []; },
        async update(_c: string, id: string, data: Record<string, unknown>) { return { id, ...data }; },
        async delete() { },
        async upsert() { throw new Error('not used'); },
        async count() { return records.length; },
        async collectionExists() { return true; },
        async listCollections() { return ['knowledge']; },
        ownerScopeEnabled: opts.ownerScopeEnabled ?? false,
    } as unknown as DataAdapter;
    return { adapter, records };
}

function makeStubServer(): { server: McpServer; handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    const server = {
        registerTool: (name: string, _config: unknown, handler: Handler) => {
            handlers.set(name, handler);
        },
    } as unknown as McpServer;
    return { server, handlers };
}

function parse(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
    return JSON.parse(result.content[0].text);
}

describe('runIngest', () => {
    it('dry_run scans and reports without writing', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: FIXTURES, dryRun: true });
        expect(summary.dry_run).toBe(true);
        expect(summary.files_scanned).toBe(5);
        expect(summary.files_ingested).toBe(5);
        expect(summary.records_created).toBeGreaterThanOrEqual(5);
        expect(summary.files_errored).toBe(0);
        expect(records).toHaveLength(0);
    });

    it('writes records with provenance metadata when dryRun=false', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: FIXTURES, dryRun: false });
        expect(records.length).toBe(summary.records_created);
        const md = records.find((r) => r.title === 'Onboarding Guide');
        expect(md).toBeDefined();
        expect(md!.type).toBe('reference');
        expect(md!.source).toBe('ingest:markdown');
        expect(md!.tags).toEqual(['onboarding', 'process']);
        const meta = md!.metadata as Record<string, unknown>;
        expect(meta.format).toBe('markdown');
        expect(meta.source_path).toContain('onboarding.md');
        expect(meta.content_hash).toBe(contentHash(md!.content as string));
        const csv = records.find((r) => r.title === 'people');
        expect((csv!.metadata as Record<string, unknown>).columns).toEqual(['name', 'role', 'city']);
        const html = records.find((r) => r.title === 'Release Notes — v2');
        expect(html).toBeDefined();
        expect(html!.content).not.toContain('console.log');
    });

    it('re-ingest is idempotent: zero new records, all deduplicated', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const first = await runIngest(adapter, { path: FIXTURES, dryRun: false });
        const countAfterFirst = records.length;
        const second = await runIngest(adapter, { path: FIXTURES, dryRun: false });
        expect(records.length).toBe(countAfterFirst);
        expect(second.records_created).toBe(0);
        expect(second.records_deduplicated).toBe(first.records_created);
    });

    it('ingests a single file path', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'docs', 'notes.txt'), dryRun: false });
        expect(summary.files_scanned).toBe(1);
        expect(records).toHaveLength(1);
        expect(records[0].title).toBe('notes');
    });

    it('skips binaries, unsupported extensions, empty files, and dotfiles; errors do not abort the batch', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'ingest-test-'));
        try {
            await writeFile(join(dir, 'good.txt'), 'fine content');
            await writeFile(join(dir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
            await writeFile(join(dir, 'fake.txt'), Buffer.from([0, 1, 2, 3]));
            await writeFile(join(dir, 'empty.md'), '');
            await writeFile(join(dir, '.hidden.md'), 'secret');
            await writeFile(join(dir, 'broken.json'), '{not json');
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: false });
            expect(summary.files_scanned).toBe(5); // .hidden.md excluded
            expect(summary.files_errored).toBe(1); // broken.json
            expect(summary.files_skipped).toBe(3); // png unsupported, fake.txt binary, empty.md
            expect(records).toHaveLength(1);
            expect(records[0].title).toBe('good');
            const errored = summary.reports.find((r) => r.path.endsWith('broken.json'));
            expect(errored?.status).toBe('error');
            expect(errored?.error).toBeTruthy();
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it('passes owner_scope when the adapter supports scoping', async () => {
        const { adapter, records } = makeMemoryAdapter({ ownerScopeEnabled: true });
        await runIngest(adapter, { path: join(FIXTURES, 'docs', 'notes.txt'), dryRun: false, ownerScope: 'shared' });
        expect(records[0].owner_scope).toBe('shared');
    });

    it('scopes dedupe by owner_scope: same title can exist privately and shared', async () => {
        const { adapter, records } = makeMemoryAdapter({ ownerScopeEnabled: true });
        const file = join(FIXTURES, 'docs', 'notes.txt');
        await runIngest(adapter, { path: file, dryRun: false, ownerScope: 'private' });
        await runIngest(adapter, { path: file, dryRun: false, ownerScope: 'shared' });
        expect(records).toHaveLength(2);
    });

    it('refuses to ingest inside a forbidden root (brain storage)', async () => {
        const { adapter } = makeMemoryAdapter();
        await expect(runIngest(adapter, {
            path: join(FIXTURES, 'docs'),
            dryRun: true,
            forbiddenRoots: [FIXTURES],
        })).rejects.toThrow(/Refusing to ingest/);
    });

    it('flags changed content as duplicate with a changed note, never updates', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'ingest-chg-'));
        try {
            const file = join(dir, 'doc.txt');
            await writeFile(file, 'version one');
            const { adapter, records } = makeMemoryAdapter();
            await runIngest(adapter, { path: file, dryRun: false });
            await writeFile(file, 'version two');
            const second = await runIngest(adapter, { path: file, dryRun: false });
            expect(records).toHaveLength(1);
            expect(records[0].content).toBe('version one');
            expect(second.records_created).toBe(0);
            expect(second.reports[0].error).toContain('changed');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe('ingest tool', () => {
    function setup(adapterOpts: { ownerScopeEnabled?: boolean } = {}) {
        const { server, handlers } = makeStubServer();
        const { adapter, records } = makeMemoryAdapter(adapterOpts);
        registerIngest(server, adapter);
        return { handler: handlers.get('ingest')!, records };
    }

    it('registers under the name ingest', () => {
        const { handler } = setup();
        expect(handler).toBeDefined();
    });

    it('defaults to dry_run and says so in the message', async () => {
        const { handler, records } = setup();
        const out = parse(await handler({ path: FIXTURES }));
        expect(out.dry_run).toBe(true);
        expect(out.message).toContain('[DRY RUN]');
        expect(out.message).toContain('dry_run: false');
        expect(records).toHaveLength(0);
    });

    it('writes when dry_run is false', async () => {
        const { handler, records } = setup();
        const out = parse(await handler({ path: FIXTURES, dry_run: false }));
        expect(out.dry_run).toBe(false);
        expect(records.length).toBe(out.records_created);
    });

    it('returns a clean error for a nonexistent path', async () => {
        const { handler } = setup();
        const result = await handler({ path: '/nonexistent/nowhere-at-all' });
        expect(result.isError).toBe(true);
        expect(parse(result).error).toContain('Path not found');
    });
});
