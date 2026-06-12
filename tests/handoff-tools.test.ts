/**
 * Unit tests for handoff tools — handoff_create / handoff_update / handoff_list.
 *
 * Uses a stub McpServer that captures registered handlers plus a recording
 * mock adapter, so tool behavior is tested through the registered handler
 * (the public seam) without a real backend.
 */
import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter, ListResult } from '../src/adapter/types.js';
import { registerHandoffCreate } from '../src/tools/memory/handoff-create.js';
import { registerHandoffUpdate } from '../src/tools/memory/handoff-update.js';
import { registerHandoffList } from '../src/tools/memory/handoff-list.js';

type Handler = (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

interface Call {
    method: string;
    args: unknown[];
}

function makeStubServer(): { server: McpServer; handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    const server = {
        tool: (...args: unknown[]) => {
            const name = args[0] as string;
            // Handler is the last argument; annotations object may precede it.
            const handler = args[args.length - 1] as Handler;
            handlers.set(name, handler);
        },
    } as unknown as McpServer;
    return { server, handlers };
}

function makeMockAdapter(overrides: Partial<DataAdapter> = {}): { adapter: DataAdapter; calls: Call[] } {
    const calls: Call[] = [];
    const record = (method: string, ...args: unknown[]) => calls.push({ method, args });
    const emptyList: ListResult<Record<string, unknown>> = { items: [], totalItems: 0, page: 1, perPage: 20 };
    const adapter: DataAdapter = {
        backend: 'markdown',
        async create(collection, data) {
            record('create', collection, data);
            return { id: 'h1', created_at: '2026-06-12T00:00:00Z', ...data } as never;
        },
        async getOne(collection, id) {
            record('getOne', collection, id);
            return { id, title: 'existing', to_member: 'bob', status: 'open', accepted_at: null, completed_at: null } as never;
        },
        async list(collection, options) {
            record('list', collection, options);
            return emptyList as never;
        },
        async textSearch() {
            return [] as never;
        },
        async update(collection, id, data) {
            record('update', collection, id, data);
            return { id, title: 'existing', to_member: 'bob', status: 'open', ...data } as never;
        },
        async delete() { },
        async upsert(collection, data) {
            return { id: 'h1', ...data } as never;
        },
        async count() {
            return 0;
        },
        async collectionExists(collection) {
            record('collectionExists', collection);
            return true;
        },
        async listCollections() {
            return ['handoffs'];
        },
        ...overrides,
    };
    return { adapter, calls };
}

function parse(result: { content: Array<{ type: string; text: string }> }): Record<string, unknown> {
    return JSON.parse(result.content[0].text);
}

describe('handoff_create', () => {
    it('creates an open handoff with all packet fields and defaults', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffCreate(server, adapter);
        const result = await handlers.get('handoff_create')!({
            title: 'Debug payment webhook',
            to_member: 'bob',
            what_changed: 'Narrowed to retry path',
            tried: [{ approach: 'replay event', outcome: 'still 500' }],
            assumptions: ['idempotency key is unique'],
            needs_verification: ['confirm Stripe API version'],
        });
        const body = parse(result);
        expect(body.created).toBe(true);
        const createCall = calls.find((c) => c.method === 'create')!;
        const data = createCall.args[1] as Record<string, unknown>;
        expect(data.status).toBe('open');
        expect(data.to_member).toBe('bob');
        expect(data.tried).toEqual([{ approach: 'replay event', outcome: 'still 500' }]);
        expect(data.needs_verification).toEqual(['confirm Stripe API version']);
        // Solo mode (no ownerScopeEnabled): no owner_scope key passed through
        expect('owner_scope' in data).toBe(false);
    });

    it('defaults owner_scope to shared in team mode', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter({ ownerScopeEnabled: true, currentOwnerId: 'alice' } as Partial<DataAdapter>);
        registerHandoffCreate(server, adapter);
        await handlers.get('handoff_create')!({ title: 'T', to_member: 'bob' });
        const data = (calls.find((c) => c.method === 'create')!.args[1]) as Record<string, unknown>;
        expect(data.owner_scope).toBe('shared');
    });

    it('rejects a private handoff to another member with a clear error', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter({ ownerScopeEnabled: true, currentOwnerId: 'alice' } as Partial<DataAdapter>);
        registerHandoffCreate(server, adapter);
        const result = await handlers.get('handoff_create')!({ title: 'T', to_member: 'bob', owner_scope: 'private' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('invisible');
        expect(calls.find((c) => c.method === 'create')).toBeUndefined();
    });

    it('allows a private self-handoff (to_member = current owner)', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter({ ownerScopeEnabled: true, currentOwnerId: 'alice' } as Partial<DataAdapter>);
        registerHandoffCreate(server, adapter);
        const result = await handlers.get('handoff_create')!({ title: 'T', to_member: 'alice', owner_scope: 'private' });
        expect(parse(result).created).toBe(true);
        const data = (calls.find((c) => c.method === 'create')!.args[1]) as Record<string, unknown>;
        expect(data.owner_scope).toBe('private');
    });
});

describe('handoff_update', () => {
    it('stamps accepted_at on transition to accepted', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffUpdate(server, adapter);
        await handlers.get('handoff_update')!({ id: 'h1', status: 'accepted' });
        const updateCall = calls.find((c) => c.method === 'update')!;
        const data = updateCall.args[2] as Record<string, unknown>;
        expect(data.status).toBe('accepted');
        expect(typeof data.accepted_at).toBe('string');
    });

    it('stamps completed_at on transition to completed', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffUpdate(server, adapter);
        await handlers.get('handoff_update')!({ id: 'h1', status: 'completed' });
        const data = (calls.find((c) => c.method === 'update')!.args[2]) as Record<string, unknown>;
        expect(typeof data.completed_at).toBe('string');
    });

    it('does not re-stamp accepted_at when already set', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter({
            async getOne(collection, id) {
                return { id, title: 'existing', status: 'accepted', accepted_at: '2026-06-01T00:00:00Z', completed_at: null } as never;
            },
        });
        registerHandoffUpdate(server, adapter);
        await handlers.get('handoff_update')!({ id: 'h1', status: 'accepted' });
        const data = (calls.find((c) => c.method === 'update')!.args[2]) as Record<string, unknown>;
        expect('accepted_at' in data).toBe(false);
    });

    it('returns a no-op message when no fields provided', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffUpdate(server, adapter);
        const result = await handlers.get('handoff_update')!({ id: 'h1' });
        expect(parse(result).updated).toBe(false);
        expect(calls.find((c) => c.method === 'update')).toBeUndefined();
    });

    it('amends packet fields without status', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffUpdate(server, adapter);
        await handlers.get('handoff_update')!({ id: 'h1', blocked_on: 'waiting on API key', next_steps: ['rotate key'] });
        const data = (calls.find((c) => c.method === 'update')!.args[2]) as Record<string, unknown>;
        expect(data.blocked_on).toBe('waiting on API key');
        expect(data.next_steps).toEqual(['rotate key']);
        // No status transition -> no getOne lookup needed
        expect(calls.find((c) => c.method === 'getOne')).toBeUndefined();
    });
});

describe('handoff_list', () => {
    it('filters by to_member, status, and task_id', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffList(server, adapter);
        await handlers.get('handoff_list')!({ to_member: 'bob', status: 'open', task_id: 't9' });
        const listCall = calls.find((c) => c.method === 'list')!;
        const options = listCall.args[1] as { filter: unknown[][] };
        expect(options.filter[0]).toEqual([
            { field: 'to_member', op: 'eq', value: 'bob' },
            { field: 'status', op: 'eq', value: 'open' },
            { field: 'task_id', op: 'eq', value: 't9' },
        ]);
    });

    it('resolves to_member "me" to currentOwnerId in team mode', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter({ ownerScopeEnabled: true, currentOwnerId: 'alice' } as Partial<DataAdapter>);
        registerHandoffList(server, adapter);
        await handlers.get('handoff_list')!({ to_member: 'me' });
        const options = (calls.find((c) => c.method === 'list')!.args[1]) as { filter: unknown[][] };
        expect(options.filter[0]).toEqual([{ field: 'to_member', op: 'eq', value: 'alice' }]);
    });

    it('errors on to_member "me" in solo mode with guidance', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffList(server, adapter);
        const result = await handlers.get('handoff_list')!({ to_member: 'me' });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('MEMORYOS_OWNER_ID');
        expect(calls.find((c) => c.method === 'list')).toBeUndefined();
    });

    it('lists all handoffs newest-first when no filters given', async () => {
        const { server, handlers } = makeStubServer();
        const { adapter, calls } = makeMockAdapter();
        registerHandoffList(server, adapter);
        await handlers.get('handoff_list')!({});
        const options = (calls.find((c) => c.method === 'list')!.args[1]) as { filter?: unknown; sort: Array<{ field: string; direction: string }> };
        expect(options.filter).toBeUndefined();
        expect(options.sort).toEqual([{ field: 'created_at', direction: 'desc' }]);
    });
});
