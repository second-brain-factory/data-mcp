import type { DataAdapter, ListResult, PageOptions, SortClause, Filter } from './types.js';
export declare class MarkdownAdapter implements DataAdapter {
    private root;
    readonly backend: 'markdown';
    constructor(root: string);
    private collectionDir;
    private recordPath;
    private ensureCollection;
    private readRecord;
    private writeRecord;
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
