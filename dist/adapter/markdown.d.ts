/**
 * Markdown adapter — stores records as YAML-frontmatter markdown files.
 *
 * Per-collection layout:
 *   <root>/<collection>/<id>.md
 *
 * Soft-deletes move files to <root>/_archive/<collection>/<id>.md.
 *
 * No external YAML library — we ship a minimal frontmatter parser inline
 * to avoid a new dependency. The frontmatter format we support is a strict
 * subset of YAML (scalar key:value, string arrays, simple lists). Anything
 * the brain writes via this adapter is round-trippable; arbitrary
 * hand-edited YAML is best-effort.
 *
 * Spec: docs/prds/active/PRD-SB3-DUAL-MODE-A3-DATA-MCP-MARKDOWN.md
 * (factory-dev repo)
 */
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
    createCollection(collection: string): Promise<void>;
    listCollections(): Promise<string[]>;
}
//# sourceMappingURL=markdown.d.ts.map