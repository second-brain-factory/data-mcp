/**
 * Schema mapping — translates logical collection names to actual backend names.
 *
 * SchemaMap: holds the mapping table.
 * SchemaMapProxy: wraps any DataAdapter, remapping collection names transparently.
 *
 * Example: SB_SCHEMA_MAP='{"knowledge":"sb_knowledge","sessions":"sb_sessions"}'
 * Tools call adapter.create('knowledge', ...) and it becomes adapter.create('sb_knowledge', ...)
 */
export class SchemaMap {
    map;
    reverseMap;
    constructor(mapping) {
        this.map = new Map(Object.entries(mapping));
        const reverse = new Map();
        for (const [logical, actual] of this.map) {
            reverse.set(actual, logical);
        }
        this.reverseMap = reverse;
    }
    /** Translate logical name to actual backend name */
    resolve(logicalName) {
        return this.map.get(logicalName) ?? logicalName;
    }
    /** Translate actual backend name back to logical name */
    unresolve(actualName) {
        return this.reverseMap.get(actualName) ?? actualName;
    }
    get isEmpty() {
        return this.map.size === 0;
    }
}
export class SchemaMapProxy {
    inner;
    schema;
    constructor(inner, schema) {
        this.inner = inner;
        this.schema = schema;
    }
    get backend() {
        return this.inner.backend;
    }
    async create(collection, data) {
        return this.inner.create(this.schema.resolve(collection), data);
    }
    async getOne(collection, id) {
        return this.inner.getOne(this.schema.resolve(collection), id);
    }
    async list(collection, options) {
        return this.inner.list(this.schema.resolve(collection), options);
    }
    async textSearch(collection, query, options) {
        return this.inner.textSearch(this.schema.resolve(collection), query, options);
    }
    async update(collection, id, data) {
        return this.inner.update(this.schema.resolve(collection), id, data);
    }
    async delete(collection, id) {
        return this.inner.delete(this.schema.resolve(collection), id);
    }
    async upsert(collection, data, uniqueFields) {
        return this.inner.upsert(this.schema.resolve(collection), data, uniqueFields);
    }
    async count(collection, filter) {
        return this.inner.count(this.schema.resolve(collection), filter);
    }
    async collectionExists(collection) {
        return this.inner.collectionExists(this.schema.resolve(collection));
    }
    async listCollections() {
        const collections = await this.inner.listCollections();
        return collections.map((name) => this.schema.unresolve(name));
    }
}
//# sourceMappingURL=schema-map.js.map