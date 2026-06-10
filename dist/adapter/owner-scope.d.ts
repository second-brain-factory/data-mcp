import type { DataAdapter, Filter, ListResult, PageOptions, SortClause } from './types.js';
export interface OwnerRoutingConfig {
    ownerId: string;
    sharedOwnerId: string;
}
export declare class OwnerScopeProxy implements DataAdapter {
    private inner;
    private ownerId;
    private sharedOwnerId;
    readonly ownerScopeEnabled = true;
    /** Mirrors the inner adapter's optional capability (undefined when unsupported). */
    readonly createCollection?: (collection: string) => Promise<void>;
    constructor(inner: DataAdapter, config: OwnerRoutingConfig);
    get backend(): 'pocketbase' | 'supabase' | 'markdown';
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
    private isScoped;
    private visibleOwners;
    private ownerFilter;
    private withReadFilter;
    private withWriteOwner;
    private withUpdateOwner;
    private resolveWriteOwner;
    private resolveReadOwners;
    private assertReadable;
}
//# sourceMappingURL=owner-scope.d.ts.map