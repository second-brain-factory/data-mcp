/**
 * DataAdapter interface — the core abstraction between tools and backends.
 *
 * All tools interact with data through this interface.
 * PocketBase and Supabase adapters implement it.
 * SchemaMapProxy wraps any adapter to remap collection names.
 */
export interface PageOptions {
    limit?: number;
    offset?: number;
}
export interface SortClause {
    field: string;
    direction: 'asc' | 'desc';
}
/**
 * Filter as OR-of-AND groups.
 * Each inner group is ANDed; outer groups are ORed.
 * Example: [[{field:'type',op:'eq',value:'fact'}]] means type = 'fact'
 * Example: [[{field:'type',op:'eq',value:'fact'}],[{field:'type',op:'eq',value:'pattern'}]]
 *   means type = 'fact' OR type = 'pattern'
 */
export interface FilterClause {
    field: string;
    op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'contains';
    value: string | number | boolean | string[] | null;
}
export type Filter = FilterClause[][];
export interface ListResult<T> {
    items: T[];
    totalItems: number;
    page: number;
    perPage: number;
}
export interface DataAdapter {
    /** Backend identifier */
    readonly backend: 'pocketbase' | 'supabase' | 'markdown';
    /** Create a record in a collection */
    create<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>): Promise<T>;
    /** Get a single record by ID */
    getOne<T extends Record<string, unknown>>(collection: string, id: string): Promise<T>;
    /** List records with optional filters, sorting, and pagination */
    list<T extends Record<string, unknown>>(collection: string, options?: {
        filter?: Filter;
        sort?: SortClause[];
        page?: PageOptions;
    }): Promise<ListResult<T>>;
    /** Full-text search on a collection */
    textSearch<T extends Record<string, unknown>>(collection: string, query: string, options?: {
        fields?: string[];
        filter?: Filter;
        limit?: number;
    }): Promise<T[]>;
    /** Update a record by ID (partial update) */
    update<T extends Record<string, unknown>>(collection: string, id: string, data: Record<string, unknown>): Promise<T>;
    /** Delete a record by ID */
    delete(collection: string, id: string): Promise<void>;
    /** Upsert: create or update based on unique fields */
    upsert<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>, uniqueFields: string[]): Promise<T>;
    /** Count records matching optional filter */
    count(collection: string, filter?: Filter): Promise<number>;
    /** Check if a collection exists */
    collectionExists(collection: string): Promise<boolean>;
    /** List all collection names */
    listCollections(): Promise<string[]>;
    readonly ownerScopeEnabled?: boolean;
}
//# sourceMappingURL=types.d.ts.map
