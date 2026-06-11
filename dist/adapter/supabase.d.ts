/**
 * Supabase adapter implementation.
 *
 * Uses service role key for authentication.
 * textSearch uses PostgreSQL tsvector when available, ILIKE fallback.
 * ILIKE search sanitizes \, %, _ characters.
 */
import type { DataAdapter, Filter, ListResult, SortClause, PageOptions } from './types.js';
export declare class SupabaseAdapter implements DataAdapter {
    readonly backend: "supabase";
    private client;
    constructor(url: string, key: string, memberJwt?: string);
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
//# sourceMappingURL=supabase.d.ts.map