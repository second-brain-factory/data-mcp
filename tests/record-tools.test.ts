/**
 * Unit tests for the generic record_* tools (issue #13 consolidation).
 *
 * Focus: behavior parity with the 27 folded CRUD tools — defaults and
 * computed fields from the registry, filter allow-lists, owner_scope
 * gating, the delete confirm gate, and self-correcting validation errors.
 *
 * Uses a stub McpServer capturing registered handlers + a recording mock
 * adapter (same seam as handoff-tools.test.ts).
 */
import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter, ListResult } from '../src/adapter/types.js';
import { registerRecordCreate } from '../src/tools/records/record-create.js';
import { registerRecordUpdate } from '../src/tools/records/record-update.js';
import { registerRecordQuery } from '../src/tools/records/record-query.js';
import { registerRecordDelete } from '../src/tools/records/record-delete.js';

type Handler = (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface Call {
    method: string;
    args: unknown[];
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

function makeMockAdapter(overrides: Partial<DataAdapter> = {}): { adapter: DataAdapter; calls: Call[] } {
    const calls: Call[] = [];
    const record = (method: string, ...args: unknown[]) => calls.push({ method, args });
    const emptyList: ListResult<Record<string, unknown>> = { items: [], totalItems: 0, page: 1, perPage: 20 };
    const adapter = {
        backend: 'markdown',
        async create(collection: string, data: Record<string, unknown>) {
            record('create', collection, data);
            return { id: 'r1', created_at: '2026-06-12T00:00:00Z', ...data };
        },
        async getOne(_c: string, id: string) {
            return { id };
        },
        async list(collection: string, options: unknown) {
            record('list', collection, options);
            return emptyList;
        },
        async textSearch(collection: string, query: string, options: unknown) {
            record('textSearch', collection, query, options);
            return [];
        },
        async update(collection: string, id: string, data: Record<string, unknown>) {
            record('update', collection, id, data);
            return { id, updated_at: '2026-06-12T00:00:00Z', ...data };
        },
        async delete(collection: string, id: string) {
            record('delete', collection, id);
        },
        async upsert() { throw new Error('not used'); },
        async count() { return 0; },
        async collectionExists() { return true; },
        async listCollections() { return []; },
        ownerScopeEnabled: false,
        ...overrides,
    } as DataAdapter;
    return { adapter, calls };
}

function parse(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
    return JSON.parse(result.content[0].text);
}

function setup(overrides: Partial<DataAdapter> = {}) {
    const { server, handlers } = makeStubServer();
    const { adapter, calls } = makeMockAdapter(overrides);
    registerRecordCreate(server, adapter);
    registerRecordUpdate(server, adapter);
    registerRecordQuery(server, adapter);
    registerRecordDelete(server, adapter);
    return { handlers, calls };
}

describe('record_create', () => {
    it('applies task defaults (status todo, priority medium, null due_date)', async () => {
        const { handlers, calls } = setup();
        const res = parse(await handlers.get('record_create')!({
            collection: 'tasks',
            data: { title: '  Ship it  ' },
        }));
        expect(res.created).toBe(true);
        const created = calls.find((c) => c.method === 'create')!.args[1] as Record<string, unknown>;
        expect(created).toMatchObject({ title: 'Ship it', status: 'todo', priority: 'medium', due_date: null, tags: [] });
    });

    it('decisions: seeds outcome null, requires options_considered', async () => {
        const { handlers, calls } = setup();
        const ok = parse(await handlers.get('record_create')!({
            collection: 'decisions',
            data: { title: 'Pick DB', options_considered: ['a', 'b'], chosen_option: 'a' },
        }));
        expect(ok.created).toBe(true);
        expect((calls.find((c) => c.method === 'create')!.args[1] as Record<string, unknown>).outcome).toBeNull();

        const bad = parse(await handlers.get('record_create')!({
            collection: 'decisions',
            data: { title: 'Pick DB', options_considered: [], chosen_option: 'a' },
        }));
        expect(bad.created).toBe(false);
        expect(bad.expected_fields).toBeDefined();
    });

    it('blog: slugifies title and stamps published_at only when published', async () => {
        const { handlers, calls } = setup();
        await handlers.get('record_create')!({
            collection: 'blog_posts',
            data: { title: 'Hello, World!', content: 'body' },
        });
        const draft = calls.find((c) => c.method === 'create')!.args[1] as Record<string, unknown>;
        expect(draft.slug).toBe('hello-world');
        expect(draft.status).toBe('draft');
        expect(draft.published_at).toBeNull();

        calls.length = 0;
        await handlers.get('record_create')!({
            collection: 'blog_posts',
            data: { title: 'Live', content: 'body', status: 'published' },
        });
        const live = calls.find((c) => c.method === 'create')!.args[1] as Record<string, unknown>;
        expect(live.published_at).toBeTruthy();
    });

    it('email_queue: seeds queued status + bookkeeping nulls', async () => {
        const { handlers, calls } = setup();
        await handlers.get('record_create')!({
            collection: 'email_queue',
            data: { to_email: 'a@b.co', subject: 'Hi', body_html: '<p>x</p>' },
        });
        const created = calls.find((c) => c.method === 'create')!.args[1] as Record<string, unknown>;
        expect(created).toMatchObject({ status: 'queued', sent_at: null, error: null, resend_id: null });
    });

    it('rejects unknown fields with the expected schema (self-correction)', async () => {
        const { handlers } = setup();
        const res = parse(await handlers.get('record_create')!({
            collection: 'tasks',
            data: { title: 'x', bogus_field: 1 },
        }));
        expect(res.created).toBe(false);
        expect((res.issues as string[]).join(' ')).toContain('bogus_field');
        expect(res.expected_fields).toHaveProperty('priority');
    });

    it('owner_scope written only when adapter has scoping enabled', async () => {
        const scoped = setup({ ownerScopeEnabled: true } as Partial<DataAdapter>);
        await scoped.handlers.get('record_create')!({
            collection: 'goals',
            data: { title: 'G', timeframe: 'weekly' },
            owner_scope: 'shared',
        });
        expect((scoped.calls.find((c) => c.method === 'create')!.args[1] as Record<string, unknown>).owner_scope).toBe('shared');

        const unscoped = setup();
        await unscoped.handlers.get('record_create')!({
            collection: 'goals',
            data: { title: 'G', timeframe: 'weekly' },
            owner_scope: 'shared',
        });
        expect('owner_scope' in (unscoped.calls.find((c) => c.method === 'create')!.args[1] as Record<string, unknown>)).toBe(false);
    });

    it('knowledge is not creatable via record_create (use knowledge_store)', async () => {
        const { handlers } = setup();
        const res = await handlers.get('record_create')!({ collection: 'knowledge', data: { title: 'x' } });
        expect(res.isError).toBe(true);
    });
});

describe('record_update', () => {
    it('knowledge content change regenerates summary', async () => {
        const { handlers, calls } = setup();
        const long = 'First sentence here. '.repeat(30);
        await handlers.get('record_update')!({
            collection: 'knowledge',
            id: 'k1',
            data: { content: long },
        });
        const updates = calls.find((c) => c.method === 'update')!.args[2] as Record<string, unknown>;
        expect(typeof updates.summary).toBe('string');
        expect((updates.summary as string).length).toBeLessThan(long.length);
    });

    it('blog status transition stamps/clears published_at', async () => {
        const { handlers, calls } = setup();
        await handlers.get('record_update')!({ collection: 'blog_posts', id: 'b1', data: { status: 'published' } });
        expect((calls.find((c) => c.method === 'update')!.args[2] as Record<string, unknown>).published_at).toBeTruthy();

        calls.length = 0;
        await handlers.get('record_update')!({ collection: 'blog_posts', id: 'b1', data: { status: 'archived' } });
        expect((calls.find((c) => c.method === 'update')!.args[2] as Record<string, unknown>).published_at).toBeNull();
    });

    it('empty update returns guard message without adapter call', async () => {
        const { handlers, calls } = setup();
        const res = parse(await handlers.get('record_update')!({ collection: 'tasks', id: 't1', data: {} }));
        expect(res.updated).toBe(false);
        expect(calls.filter((c) => c.method === 'update')).toHaveLength(0);
    });
});

describe('record_query', () => {
    it('rejects non-allow-listed filter fields with the allow-list', async () => {
        const { handlers, calls } = setup();
        const res = parse(await handlers.get('record_query')!({
            collection: 'tasks',
            filters: { owner_scope: 'private' },
        }));
        expect(res.error).toContain('not filterable');
        expect(res.allowed_filters).toEqual(['status', 'priority']);
        expect(calls).toHaveLength(0);
    });

    it('list path: eq filters + created_at desc + paging defaults', async () => {
        const { handlers, calls } = setup();
        await handlers.get('record_query')!({ collection: 'tasks', filters: { status: 'todo' } });
        const opts = calls.find((c) => c.method === 'list')!.args[1] as Record<string, unknown>;
        expect(opts.filter).toEqual([[{ field: 'status', op: 'eq', value: 'todo' }]]);
        expect(opts.sort).toEqual([{ field: 'created_at', direction: 'desc' }]);
        expect(opts.page).toEqual({ limit: 20, offset: 0 });
    });

    it('search path uses per-collection search fields and limit 10 default', async () => {
        const { handlers, calls } = setup();
        await handlers.get('record_query')!({ collection: 'prospects', query: 'acme' });
        const call = calls.find((c) => c.method === 'textSearch')!;
        expect(call.args[0]).toBe('prospects');
        expect((call.args[2] as Record<string, unknown>).fields).toEqual(['name', 'company', 'notes', 'email']);
        expect((call.args[2] as Record<string, unknown>).limit).toBe(10);
    });

    it('query on a non-searchable collection explains instead of erroring', async () => {
        const { handlers } = setup();
        const res = parse(await handlers.get('record_query')!({ collection: 'tasks', query: 'x' }));
        expect(res.error).toContain('does not support text search');
    });

    it('knowledge tags filter keeps AND-contains semantics', async () => {
        const { handlers, calls } = setup();
        await handlers.get('record_query')!({ collection: 'knowledge', tags: ['a', 'b'] });
        const opts = calls.find((c) => c.method === 'list')!.args[1] as Record<string, unknown>;
        expect(opts.filter).toEqual([[
            { field: 'tags', op: 'contains', value: 'a' },
            { field: 'tags', op: 'contains', value: 'b' },
        ]]);
    });

    it('tags rejected on collections without tag filtering', async () => {
        const { handlers } = setup();
        const res = parse(await handlers.get('record_query')!({ collection: 'prospects', tags: ['x'] }));
        expect(res.error).toContain('does not support tag filtering');
    });
});

describe('record_delete', () => {
    it('requires confirm: true', async () => {
        const { handlers, calls } = setup();
        const res = await handlers.get('record_delete')!({ collection: 'knowledge', id: 'k1', confirm: false });
        expect(res.isError).toBe(true);
        expect(calls.filter((c) => c.method === 'delete')).toHaveLength(0);
    });

    it('deletes from allow-listed collections only', async () => {
        const { handlers, calls } = setup();
        const ok = parse(await handlers.get('record_delete')!({ collection: 'knowledge_links', id: 'l1', confirm: true }));
        expect(ok.deleted).toBe(true);
        expect(calls.find((c) => c.method === 'delete')!.args).toEqual(['knowledge_links', 'l1']);
    });
});
