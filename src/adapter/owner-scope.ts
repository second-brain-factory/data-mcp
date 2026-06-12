import { AdapterError } from '../errors/adapter-error.js';
import type { DataAdapter, Filter, FilterClause, ListResult, PageOptions, SortClause } from './types.js';

const DEFAULT_SCOPED_COLLECTIONS = new Set([
    'knowledge',
    'decisions',
    'sessions',
    'goals',
    'tasks',
    'contacts',
    'knowledge_links',
    'handoffs',
]);

export interface OwnerRoutingConfig {
    ownerId: string;
    sharedOwnerId: string;
}

export class OwnerScopeProxy implements DataAdapter {
    private inner: DataAdapter;
    private ownerId: string;
    private sharedOwnerId: string;
    readonly ownerScopeEnabled = true;
    /** Exposed so tools can resolve "me" and validate recipient/scope combos. */
    get currentOwnerId(): string {
        return this.ownerId;
    }
    /** Mirrors the inner adapter's optional capability (undefined when unsupported). */
    readonly createCollection?: (collection: string) => Promise<void>;
    /** Mirrors the inner adapter's optional capability (undefined when unsupported). */
    readonly ensureWorkspaceProtections?: () => Promise<string[]>;
    constructor(inner: DataAdapter, config: OwnerRoutingConfig) {
        this.inner = inner;
        this.ownerId = config.ownerId;
        this.sharedOwnerId = config.sharedOwnerId;
        if (inner.createCollection) {
            this.createCollection = (collection: string) => inner.createCollection!(collection);
        }
        if (inner.ensureWorkspaceProtections) {
            this.ensureWorkspaceProtections = () => inner.ensureWorkspaceProtections!();
        }
    }
    get backend(): 'pocketbase' | 'supabase' | 'markdown' {
        return this.inner.backend;
    }
    async create<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>): Promise<T> {
        return this.inner.create<T>(collection, this.withWriteOwner(collection, data));
    }
    async getOne<T extends Record<string, unknown>>(collection: string, id: string): Promise<T> {
        const record = await this.inner.getOne<T>(collection, id);
        this.assertReadable(collection, record);
        return record;
    }
    async list<T extends Record<string, unknown>>(collection: string, options?: {
        filter?: Filter;
        sort?: SortClause[];
        page?: PageOptions;
    }): Promise<ListResult<T>> {
        return this.inner.list<T>(collection, this.withReadFilter(collection, options));
    }
    async textSearch<T extends Record<string, unknown>>(collection: string, query: string, options?: {
        fields?: string[];
        filter?: Filter;
        limit?: number;
    }): Promise<T[]> {
        return this.inner.textSearch<T>(collection, query, this.withReadFilter(collection, options));
    }
    async update<T extends Record<string, unknown>>(collection: string, id: string, data: Record<string, unknown>): Promise<T> {
        await this.getOne(collection, id);
        return this.inner.update<T>(collection, id, this.withUpdateOwner(collection, data));
    }
    async delete(collection: string, id: string): Promise<void> {
        await this.getOne(collection, id);
        return this.inner.delete(collection, id);
    }
    async upsert<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>, uniqueFields: string[]): Promise<T> {
        const scopedData = this.withWriteOwner(collection, data);
        const scopedUniqueFields = this.isScoped(collection) && !uniqueFields.includes('owner_id')
            ? [...uniqueFields, 'owner_id']
            : uniqueFields;
        return this.inner.upsert<T>(collection, scopedData, scopedUniqueFields);
    }
    async count(collection: string, filter?: Filter): Promise<number> {
        return this.inner.count(collection, this.ownerFilter(collection, filter));
    }
    async collectionExists(collection: string): Promise<boolean> {
        return this.inner.collectionExists(collection);
    }
    async listCollections(): Promise<string[]> {
        return this.inner.listCollections();
    }
    private isScoped(collection: string): boolean {
        return DEFAULT_SCOPED_COLLECTIONS.has(collection);
    }
    private visibleOwners(): string[] {
        return this.ownerId === this.sharedOwnerId
            ? [this.sharedOwnerId]
            : [this.ownerId, this.sharedOwnerId];
    }
    private ownerFilter(collection: string, filter?: Filter): Filter | undefined {
        if (!this.isScoped(collection))
            return filter;
        const groups = filter && filter.length > 0 ? filter : [[]];
        return groups.map((andGroup) => {
            let requestedOwners: string[] | undefined;
            const cleanGroup: FilterClause[] = [];
            for (const clause of andGroup) {
                if (clause.field === 'owner_scope') {
                    requestedOwners = this.resolveReadOwners(clause.value);
                    continue;
                }
                cleanGroup.push(clause);
            }
            const owners = requestedOwners ?? this.visibleOwners();
            const ownerClause: FilterClause = owners.length === 1
                ? { field: 'owner_id', op: 'eq', value: owners[0] }
                : { field: 'owner_id', op: 'in', value: owners };
            return [...cleanGroup, ownerClause];
        });
    }
    private withReadFilter<O extends {
        filter?: Filter;
    }>(collection: string, options?: O): O | undefined {
        if (!this.isScoped(collection))
            return options;
        return { ...options, filter: this.ownerFilter(collection, options?.filter) } as O;
    }
    private withWriteOwner(collection: string, data: Record<string, unknown>): Record<string, unknown> {
        if (!this.isScoped(collection))
            return stripOwnerScope(data);
        const ownerId = this.resolveWriteOwner(data);
        return { ...stripOwnerScope(data), owner_id: ownerId };
    }
    private withUpdateOwner(collection: string, data: Record<string, unknown>): Record<string, unknown> {
        if (!this.isScoped(collection))
            return stripOwnerScope(data);
        if (!hasOwnerIntent(data))
            return stripOwnerScope(data);
        const ownerId = this.resolveWriteOwner(data);
        return { ...stripOwnerScope(data), owner_id: ownerId };
    }
    private resolveWriteOwner(data: Record<string, unknown>): string {
        const ownerScope = typeof data.owner_scope === 'string' ? data.owner_scope : undefined;
        if (ownerScope === 'shared')
            return this.sharedOwnerId;
        if (ownerScope === 'private')
            return this.ownerId;
        const requestedOwner = typeof data.owner_id === 'string' ? data.owner_id.trim() : '';
        if (!requestedOwner)
            return this.ownerId;
        if (requestedOwner === this.ownerId || requestedOwner === this.sharedOwnerId)
            return requestedOwner;
        throw new AdapterError('VALIDATION_ERROR', 'owner_id must be the current owner or shared owner');
    }
    private resolveReadOwners(value: FilterClause['value']): string[] {
        const scopes = Array.isArray(value) ? value : [value];
        const owners: string[] = [];
        for (const scope of scopes) {
            if (scope === 'private')
                owners.push(this.ownerId);
            else if (scope === 'shared')
                owners.push(this.sharedOwnerId);
            else
                throw new AdapterError('VALIDATION_ERROR', 'owner_scope must be private or shared');
        }
        return [...new Set(owners)];
    }
    private assertReadable(collection: string, record: Record<string, unknown>): void {
        if (!this.isScoped(collection))
            return;
        if (this.visibleOwners().includes(record.owner_id as string))
            return;
        throw new AdapterError('RECORD_NOT_FOUND', `Record not found in '${collection}'`);
    }
}

function stripOwnerScope(data: Record<string, unknown>): Record<string, unknown> {
    const { owner_scope: _ownerScope, ...clean } = data;
    return clean;
}

function hasOwnerIntent(data: Record<string, unknown>): boolean {
    return Object.prototype.hasOwnProperty.call(data, 'owner_scope')
        || Object.prototype.hasOwnProperty.call(data, 'owner_id');
}
