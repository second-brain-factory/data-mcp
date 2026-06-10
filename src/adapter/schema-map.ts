/**
 * Schema mapping — translates logical collection names to actual backend names.
 *
 * SchemaMap: holds the mapping table.
 * SchemaMapProxy: wraps any DataAdapter, remapping collection names transparently.
 *
 * Example: SB_SCHEMA_MAP='{"knowledge":"sb_knowledge","sessions":"sb_sessions"}'
 * Tools call adapter.create('knowledge', ...) and it becomes adapter.create('sb_knowledge', ...)
 */

import type { DataAdapter, Filter, ListResult, SortClause, PageOptions } from './types.js';

export class SchemaMap {
    private readonly map: Map<string, string>;
    private readonly reverseMap: Map<string, string>;
    constructor(mapping: Record<string, string>) {
        this.map = new Map(Object.entries(mapping));
        const reverse = new Map<string, string>();
        for (const [logical, actual] of this.map) {
            reverse.set(actual, logical);
        }
        this.reverseMap = reverse;
    }
    /** Translate logical name to actual backend name */
    resolve(logicalName: string): string {
        return this.map.get(logicalName) ?? logicalName;
    }
    /** Translate actual backend name back to logical name */
    unresolve(actualName: string): string {
        return this.reverseMap.get(actualName) ?? actualName;
    }
    get isEmpty(): boolean {
        return this.map.size === 0;
    }
}

export class SchemaMapProxy implements DataAdapter {
    private readonly inner: DataAdapter;
    private readonly schema: SchemaMap;
    constructor(inner: DataAdapter, schema: SchemaMap) {
        this.inner = inner;
        this.schema = schema;
    }
    get backend(): 'pocketbase' | 'supabase' {
        return this.inner.backend as 'pocketbase' | 'supabase';
    }
    async create<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>): Promise<T> {
        return this.inner.create<T>(this.schema.resolve(collection), data);
    }
    async getOne<T extends Record<string, unknown>>(collection: string, id: string): Promise<T> {
        return this.inner.getOne<T>(this.schema.resolve(collection), id);
    }
    async list<T extends Record<string, unknown>>(collection: string, options?: {
        filter?: Filter;
        sort?: SortClause[];
        page?: PageOptions;
    }): Promise<ListResult<T>> {
        return this.inner.list<T>(this.schema.resolve(collection), options);
    }
    async textSearch<T extends Record<string, unknown>>(collection: string, query: string, options?: {
        fields?: string[];
        filter?: Filter;
        limit?: number;
    }): Promise<T[]> {
        return this.inner.textSearch<T>(this.schema.resolve(collection), query, options);
    }
    async update<T extends Record<string, unknown>>(collection: string, id: string, data: Record<string, unknown>): Promise<T> {
        return this.inner.update<T>(this.schema.resolve(collection), id, data);
    }
    async delete(collection: string, id: string): Promise<void> {
        return this.inner.delete(this.schema.resolve(collection), id);
    }
    async upsert<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>, uniqueFields: string[]): Promise<T> {
        return this.inner.upsert<T>(this.schema.resolve(collection), data, uniqueFields);
    }
    async count(collection: string, filter?: Filter): Promise<number> {
        return this.inner.count(this.schema.resolve(collection), filter);
    }
    async collectionExists(collection: string): Promise<boolean> {
        return this.inner.collectionExists(this.schema.resolve(collection));
    }
    async listCollections(): Promise<string[]> {
        const collections = await this.inner.listCollections();
        return collections.map((name) => this.schema.unresolve(name));
    }
}
