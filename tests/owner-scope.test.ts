/**
 * Unit tests for OwnerScopeProxy — owner routing, stamping, filtering,
 * and cross-owner validation. Uses a recording mock adapter (no backend).
 */
import { describe, it, expect } from 'vitest';
import { OwnerScopeProxy } from '../src/adapter/owner-scope.js';
import { AdapterError } from '../src/errors/adapter-error.js';
import type { DataAdapter, Filter, ListResult } from '../src/adapter/types.js';

interface Call {
    method: string;
    args: unknown[];
}

function makeMockAdapter(overrides: Partial<DataAdapter> = {}): { adapter: DataAdapter; calls: Call[] } {
    const calls: Call[] = [];
    const record = (method: string, ...args: unknown[]) => calls.push({ method, args });
    const emptyList: ListResult<Record<string, unknown>> = { items: [], totalItems: 0, page: 1, perPage: 50 };
    const adapter: DataAdapter = {
        backend: 'markdown',
        async create(collection, data) {
            record('create', collection, data);
            return { id: 'r1', ...data } as never;
        },
        async getOne(collection, id) {
            record('getOne', collection, id);
            return { id, owner_id: 'iwo' } as never;
        },
        async list(collection, options) {
            record('list', collection, options);
            return emptyList as never;
        },
        async textSearch(collection, query, options) {
            record('textSearch', collection, query, options);
            return [] as never;
        },
        async update(collection, id, data) {
            record('update', collection, id, data);
            return { id, ...data } as never;
        },
        async delete(collection, id) {
            record('delete', collection, id);
        },
        async upsert(collection, data, uniqueFields) {
            record('upsert', collection, data, uniqueFields);
            return { id: 'r1', ...data } as never;
        },
        async count(collection, filter) {
            record('count', collection, filter);
            return 0;
        },
        async collectionExists(collection) {
            record('collectionExists', collection);
            return true;
        },
        async listCollections() {
            record('listCollections');
            return ['knowledge'];
        },
        ...overrides,
    };
    return { adapter, calls };
}

const config = { ownerId: 'iwo', sharedOwnerId: 'firma' };

describe('OwnerScopeProxy create (write owner stamping)', () => {
    it('stamps owner_id with the current owner by default on scoped collections', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.create('knowledge', { title: 'a' });
        expect(calls[0].args[1]).toEqual({ title: 'a', owner_id: 'iwo' });
    });

    it('routes owner_scope "shared" to the shared owner and strips owner_scope', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.create('knowledge', { title: 'a', owner_scope: 'shared' });
        expect(calls[0].args[1]).toEqual({ title: 'a', owner_id: 'firma' });
    });

    it('routes owner_scope "private" to the current owner', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.create('knowledge', { title: 'a', owner_scope: 'private' });
        expect(calls[0].args[1]).toEqual({ title: 'a', owner_id: 'iwo' });
    });

    it('accepts an explicit owner_id equal to the shared owner', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.create('knowledge', { title: 'a', owner_id: 'firma' });
        expect(calls[0].args[1]).toEqual({ title: 'a', owner_id: 'firma' });
    });

    it('rejects a cross-owner owner_id with VALIDATION_ERROR', async () => {
        const { adapter } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        const err = await proxy.create('knowledge', { title: 'a', owner_id: 'marek' }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AdapterError);
        expect((err as AdapterError).code).toBe('VALIDATION_ERROR');
        expect((err as AdapterError).message).toBe('owner_id must be the current owner or shared owner');
    });

    it('does not stamp owner_id on unscoped collections but still strips owner_scope', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.create('settings', { key: 'v', owner_scope: 'shared' });
        expect(calls[0].args[1]).toEqual({ key: 'v' });
    });
});

describe('OwnerScopeProxy list/textSearch/count (read filter)', () => {
    it('appends an owner_id "in" clause with both visible owners', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.list('knowledge');
        const options = calls[0].args[1] as { filter: Filter };
        expect(options.filter).toEqual([[{ field: 'owner_id', op: 'in', value: ['iwo', 'firma'] }]]);
    });

    it('uses a single "eq" clause when ownerId equals sharedOwnerId', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, { ownerId: 'firma', sharedOwnerId: 'firma' });
        await proxy.list('knowledge');
        const options = calls[0].args[1] as { filter: Filter };
        expect(options.filter).toEqual([[{ field: 'owner_id', op: 'eq', value: 'firma' }]]);
    });

    it('translates an owner_scope filter clause into the matching owner_id clause', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.list('knowledge', {
            filter: [[
                { field: 'type', op: 'eq', value: 'fact' },
                { field: 'owner_scope', op: 'eq', value: 'private' },
            ]],
        });
        const options = calls[0].args[1] as { filter: Filter };
        expect(options.filter).toEqual([[
            { field: 'type', op: 'eq', value: 'fact' },
            { field: 'owner_id', op: 'eq', value: 'iwo' },
        ]]);
    });

    it('expands owner_scope ["private","shared"] into an "in" clause', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.list('knowledge', {
            filter: [[{ field: 'owner_scope', op: 'in', value: ['private', 'shared'] }]],
        });
        const options = calls[0].args[1] as { filter: Filter };
        expect(options.filter).toEqual([[{ field: 'owner_id', op: 'in', value: ['iwo', 'firma'] }]]);
    });

    it('rejects unknown owner_scope values with VALIDATION_ERROR', async () => {
        const { adapter } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        const err = await proxy
            .list('knowledge', { filter: [[{ field: 'owner_scope', op: 'eq', value: 'everyone' }]] })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AdapterError);
        expect((err as AdapterError).code).toBe('VALIDATION_ERROR');
    });

    it('adds owner clause to every OR group', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.list('tasks', {
            filter: [
                [{ field: 'status', op: 'eq', value: 'open' }],
                [{ field: 'status', op: 'eq', value: 'done' }],
            ],
        });
        const options = calls[0].args[1] as { filter: Filter };
        expect(options.filter).toHaveLength(2);
        for (const group of options.filter) {
            expect(group[1]).toEqual({ field: 'owner_id', op: 'in', value: ['iwo', 'firma'] });
        }
    });

    it('does not touch filters for unscoped collections', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.list('settings', { filter: [[{ field: 'key', op: 'eq', value: 'x' }]] });
        const options = calls[0].args[1] as { filter: Filter };
        expect(options.filter).toEqual([[{ field: 'key', op: 'eq', value: 'x' }]]);
    });

    it('applies the owner filter to textSearch', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.textSearch('knowledge', 'query');
        const options = calls[0].args[2] as { filter: Filter };
        expect(options.filter).toEqual([[{ field: 'owner_id', op: 'in', value: ['iwo', 'firma'] }]]);
    });

    it('applies the owner filter to count', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.count('knowledge');
        expect(calls[0].args[1]).toEqual([[{ field: 'owner_id', op: 'in', value: ['iwo', 'firma'] }]]);
    });
});

describe('OwnerScopeProxy getOne/update/delete (read guard)', () => {
    it('returns records owned by a visible owner', async () => {
        const { adapter } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await expect(proxy.getOne('knowledge', 'r1')).resolves.toMatchObject({ owner_id: 'iwo' });
    });

    it('hides foreign-owner records behind RECORD_NOT_FOUND', async () => {
        const { adapter } = makeMockAdapter({
            async getOne(_c, id) {
                return { id, owner_id: 'marek' } as never;
            },
        });
        const proxy = new OwnerScopeProxy(adapter, config);
        const err = await proxy.getOne('knowledge', 'r1').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AdapterError);
        expect((err as AdapterError).code).toBe('RECORD_NOT_FOUND');
    });

    it('blocks update of a foreign-owner record', async () => {
        const { adapter, calls } = makeMockAdapter({
            async getOne(_c, id) {
                return { id, owner_id: 'marek' } as never;
            },
        });
        const proxy = new OwnerScopeProxy(adapter, config);
        await expect(proxy.update('knowledge', 'r1', { title: 'x' })).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
        expect(calls.find((c) => c.method === 'update')).toBeUndefined();
    });

    it('blocks delete of a foreign-owner record', async () => {
        const { adapter, calls } = makeMockAdapter({
            async getOne(_c, id) {
                return { id, owner_id: 'marek' } as never;
            },
        });
        const proxy = new OwnerScopeProxy(adapter, config);
        await expect(proxy.delete('knowledge', 'r1')).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
        expect(calls.find((c) => c.method === 'delete')).toBeUndefined();
    });

    it('update without owner intent strips owner_scope and does not stamp owner_id', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.update('knowledge', 'r1', { title: 'x' });
        const updateCall = calls.find((c) => c.method === 'update')!;
        expect(updateCall.args[2]).toEqual({ title: 'x' });
    });

    it('update with owner_scope "shared" re-stamps owner_id to the shared owner', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.update('knowledge', 'r1', { title: 'x', owner_scope: 'shared' });
        const updateCall = calls.find((c) => c.method === 'update')!;
        expect(updateCall.args[2]).toEqual({ title: 'x', owner_id: 'firma' });
    });
});

describe('OwnerScopeProxy upsert (unique field scoping)', () => {
    it('appends owner_id to unique fields on scoped collections', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.upsert('knowledge', { title: 'a' }, ['title']);
        expect(calls[0].args[1]).toEqual({ title: 'a', owner_id: 'iwo' });
        expect(calls[0].args[2]).toEqual(['title', 'owner_id']);
    });

    it('does not duplicate owner_id when already a unique field', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.upsert('knowledge', { title: 'a' }, ['title', 'owner_id']);
        expect(calls[0].args[2]).toEqual(['title', 'owner_id']);
    });

    it('leaves unique fields untouched on unscoped collections', async () => {
        const { adapter, calls } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        await proxy.upsert('settings', { key: 'v' }, ['key']);
        expect(calls[0].args[1]).toEqual({ key: 'v' });
        expect(calls[0].args[2]).toEqual(['key']);
    });
});

describe('OwnerScopeProxy passthrough capabilities', () => {
    it('exposes ownerScopeEnabled and mirrors backend', () => {
        const { adapter } = makeMockAdapter();
        const proxy = new OwnerScopeProxy(adapter, config);
        expect(proxy.ownerScopeEnabled).toBe(true);
        expect(proxy.backend).toBe('markdown');
    });

    it('mirrors createCollection when the inner adapter supports it', async () => {
        const created: string[] = [];
        const { adapter } = makeMockAdapter({
            createCollection: async (collection: string) => {
                created.push(collection);
            },
        });
        const proxy = new OwnerScopeProxy(adapter, config);
        expect(proxy.createCollection).toBeDefined();
        await proxy.createCollection!('knowledge');
        expect(created).toEqual(['knowledge']);
    });

    it('leaves createCollection undefined when the inner adapter lacks it', () => {
        const { adapter } = makeMockAdapter();
        delete (adapter as { createCollection?: unknown }).createCollection;
        const proxy = new OwnerScopeProxy(adapter, config);
        expect(proxy.createCollection).toBeUndefined();
    });
});
