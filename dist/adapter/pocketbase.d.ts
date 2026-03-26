/**
 * PocketBase adapter implementation.
 *
 * Authenticates via _superusers collection (admin auth).
 * Translates Filter to PocketBase filter syntax.
 * textSearch falls back to ~ (LIKE) operator on title+content fields.
 */
import type { DataAdapter, Filter, ListResult, SortClause, PageOptions } from './types.js';
export declare class PocketBaseAdapter implements DataAdapter {
    private readonly url;
    private readonly adminEmail;
    private readonly adminPassword;
    readonly backend: "pocketbase";
    private pb;
    private authenticated;
    constructor(url: string, adminEmail: string, adminPassword: string);
    private ensureAuth;
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
//# sourceMappingURL=pocketbase.d.ts.map