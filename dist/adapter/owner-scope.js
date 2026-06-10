import { AdapterError } from '../errors/adapter-error.js';

const DEFAULT_SCOPED_COLLECTIONS = new Set([
    'knowledge',
    'decisions',
    'sessions',
    'goals',
    'tasks',
    'contacts',
    'knowledge_links',
]);

export class OwnerScopeProxy {
    inner;
    ownerId;
    sharedOwnerId;
    ownerScopeEnabled = true;
    constructor(inner, config) {
        this.inner = inner;
        this.ownerId = config.ownerId;
        this.sharedOwnerId = config.sharedOwnerId;
    }
    get backend() {
        return this.inner.backend;
    }
    async create(collection, data) {
        return this.inner.create(collection, this.withWriteOwner(collection, data));
    }
    async getOne(collection, id) {
        const record = await this.inner.getOne(collection, id);
        this.assertReadable(collection, record);
        return record;
    }
    async list(collection, options) {
        return this.inner.list(collection, this.withReadFilter(collection, options));
    }
    async textSearch(collection, query, options) {
        return this.inner.textSearch(collection, query, this.withReadFilter(collection, options));
    }
    async update(collection, id, data) {
        await this.getOne(collection, id);
        return this.inner.update(collection, id, this.withUpdateOwner(collection, data));
    }
    async delete(collection, id) {
        await this.getOne(collection, id);
        return this.inner.delete(collection, id);
    }
    async upsert(collection, data, uniqueFields) {
        const scopedData = this.withWriteOwner(collection, data);
        const scopedUniqueFields = this.isScoped(collection) && !uniqueFields.includes('owner_id')
            ? [...uniqueFields, 'owner_id']
            : uniqueFields;
        return this.inner.upsert(collection, scopedData, scopedUniqueFields);
    }
    async count(collection, filter) {
        return this.inner.count(collection, this.ownerFilter(collection, filter));
    }
    async collectionExists(collection) {
        return this.inner.collectionExists(collection);
    }
    async listCollections() {
        return this.inner.listCollections();
    }
    isScoped(collection) {
        return DEFAULT_SCOPED_COLLECTIONS.has(collection);
    }
    visibleOwners() {
        return this.ownerId === this.sharedOwnerId
            ? [this.sharedOwnerId]
            : [this.ownerId, this.sharedOwnerId];
    }
    ownerFilter(collection, filter) {
        if (!this.isScoped(collection))
            return filter;
        const groups = filter && filter.length > 0 ? filter : [[]];
        return groups.map((andGroup) => {
            let requestedOwners;
            const cleanGroup = [];
            for (const clause of andGroup) {
                if (clause.field === 'owner_scope') {
                    requestedOwners = this.resolveReadOwners(clause.value);
                    continue;
                }
                cleanGroup.push(clause);
            }
            const owners = requestedOwners ?? this.visibleOwners();
            const ownerClause = owners.length === 1
                ? { field: 'owner_id', op: 'eq', value: owners[0] }
                : { field: 'owner_id', op: 'in', value: owners };
            return [...cleanGroup, ownerClause];
        });
    }
    withReadFilter(collection, options) {
        if (!this.isScoped(collection))
            return options;
        return { ...options, filter: this.ownerFilter(collection, options?.filter) };
    }
    withWriteOwner(collection, data) {
        if (!this.isScoped(collection))
            return stripOwnerScope(data);
        const ownerId = this.resolveWriteOwner(data);
        return { ...stripOwnerScope(data), owner_id: ownerId };
    }
    withUpdateOwner(collection, data) {
        if (!this.isScoped(collection))
            return stripOwnerScope(data);
        if (!hasOwnerIntent(data))
            return stripOwnerScope(data);
        const ownerId = this.resolveWriteOwner(data);
        return { ...stripOwnerScope(data), owner_id: ownerId };
    }
    resolveWriteOwner(data) {
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
    resolveReadOwners(value) {
        const scopes = Array.isArray(value) ? value : [value];
        const owners = [];
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
    assertReadable(collection, record) {
        if (!this.isScoped(collection))
            return;
        if (this.visibleOwners().includes(record.owner_id))
            return;
        throw new AdapterError('RECORD_NOT_FOUND', `Record not found in '${collection}'`);
    }
}

function stripOwnerScope(data) {
    const { owner_scope: _ownerScope, ...clean } = data;
    return clean;
}

function hasOwnerIntent(data) {
    return Object.prototype.hasOwnProperty.call(data, 'owner_scope')
        || Object.prototype.hasOwnProperty.call(data, 'owner_id');
}
