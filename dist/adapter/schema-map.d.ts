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
export declare class SchemaMap {
    private readonly map;
    private readonly reverseMap;
    constructor(mapping: Record<string, string>);
    /** Translate logical name to actual backend name */
    resolve(logicalName: string): string;
    /** Translate actual backend name back to logical name */
    unresolve(actualName: string): string;
    get isEmpty(): boolean;
}
export declare class SchemaMapProxy implements DataAdapter {
    private readonly inner;
    private readonly schema;
    constructor(inner: DataAdapter, schema: SchemaMap);
    get backend(): 'pocketbase' | 'supabase';
    create<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>): Promise<T>;
    getOne<T extends Record<string, unknown>>(collection: string, id: string): Promise<T>;
    list<T extends Record<string, unknown>>(collection: string, options?: {
        filter?: Filter;
        sort?: SortClause[];
        page?: PageOptions;
    }): Promise<ListResult<T>>;
    textSearch<T extends Record<string, unknown>>(collection: string, query: string, options?: {
        fields?: string[];
        filter?: Filter;
        limit?: number;
    }): Promise<T[]>;
    update<T extends Record<string, unknown>>(collection: string, id: string, data: Record<string, unknown>): Promise<T>;
    delete(collection: string, id: string): Promise<void>;
    upsert<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>, uniqueFields: string[]): Promise<T>;
    count(collection: string, filter?: Filter): Promise<number>;
    collectionExists(collection: string): Promise<boolean>;
    listCollections(): Promise<string[]>;
}
//# sourceMappingURL=schema-map.d.ts.map