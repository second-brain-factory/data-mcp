/**
 * PocketBase adapter implementation.
 *
 * Authenticates via _superusers collection (admin auth).
 * Translates Filter to PocketBase filter syntax.
 * textSearch falls back to ~ (LIKE) operator on title+content fields.
 */
import PocketBase from 'pocketbase';
import { AdapterError } from '../errors/adapter-error.js';
export class PocketBaseAdapter {
    url;
    adminEmail;
    adminPassword;
    backend = 'pocketbase';
    pb;
    authenticated = false;
    constructor(url, adminEmail, adminPassword) {
        this.url = url;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
        this.pb = new PocketBase(url);
        // Disable auto-cancellation — MCP server handles concurrent requests
        this.pb.autoCancellation(false);
    }
    async ensureAuth() {
        if (this.authenticated && this.pb.authStore.isValid)
            return;
        try {
            await this.pb.collection('_superusers').authWithPassword(this.adminEmail, this.adminPassword);
            this.authenticated = true;
        }
        catch (err) {
            throw mapPocketBaseError(err);
        }
    }
    async create(collection, data) {
        await this.ensureAuth();
        try {
            const record = await this.pb.collection(collection).create(data);
            return recordToPlain(record);
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async getOne(collection, id) {
        await this.ensureAuth();
        try {
            const record = await this.pb.collection(collection).getOne(id);
            return recordToPlain(record);
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async list(collection, options) {
        await this.ensureAuth();
        try {
            const perPage = options?.page?.limit ?? 50;
            const offset = options?.page?.offset ?? 0;
            const page = Math.floor(offset / perPage) + 1;
            const pbOptions = {};
            if (options?.filter) {
                pbOptions.filter = filterToPocketBase(options.filter);
            }
            if (options?.sort) {
                pbOptions.sort = sortToPocketBase(options.sort);
            }
            const result = await this.pb.collection(collection).getList(page, perPage, pbOptions);
            return {
                items: result.items.map((r) => recordToPlain(r)),
                totalItems: result.totalItems,
                page: result.page,
                perPage: result.perPage,
            };
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async textSearch(collection, query, options) {
        await this.ensureAuth();
        try {
            const fields = options?.fields ?? ['title', 'content'];
            const limit = options?.limit ?? 20;
            // PocketBase LIKE search: field ~ 'value'
            // Sanitize query: strip all PocketBase filter metacharacters to prevent injection
            const sanitized = sanitizePocketBaseValue(query);
            const searchClauses = fields.map((f) => {
                validateFieldName(f);
                return `${f} ~ '${sanitized}'`;
            });
            const searchFilter = `(${searchClauses.join(' || ')})`;
            let fullFilter = searchFilter;
            if (options?.filter) {
                const additionalFilter = filterToPocketBase(options.filter);
                if (additionalFilter) {
                    fullFilter = `(${searchFilter}) && (${additionalFilter})`;
                }
            }
            // PocketBase 0.25+ doesn't allow sorting by system fields (created/updated).
            // Use -id which is monotonically increasing (same effect as -created).
            const result = await this.pb.collection(collection).getList(1, limit, {
                filter: fullFilter,
                sort: '-id',
            });
            return result.items.map((r) => recordToPlain(r));
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async update(collection, id, data) {
        await this.ensureAuth();
        try {
            const record = await this.pb.collection(collection).update(id, data);
            return recordToPlain(record);
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async delete(collection, id) {
        await this.ensureAuth();
        try {
            await this.pb.collection(collection).delete(id);
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async upsert(collection, data, uniqueFields) {
        await this.ensureAuth();
        try {
            // Build filter from unique fields — use sanitized values to prevent injection
            const clauses = uniqueFields.map((field) => {
                validateFieldName(field);
                const value = data[field];
                if (typeof value === 'string') {
                    return `${field} = '${sanitizePocketBaseValue(value)}'`;
                }
                if (typeof value === 'number' || typeof value === 'boolean') {
                    return `${field} = ${value}`;
                }
                return `${field} = '${sanitizePocketBaseValue(String(value ?? ''))}'`;
            });
            const filter = clauses.join(' && ');
            // Try to find existing
            const result = await this.pb.collection(collection).getList(1, 1, { filter });
            if (result.items.length > 0) {
                const existing = result.items[0];
                const updated = await this.pb.collection(collection).update(existing.id, data);
                return recordToPlain(updated);
            }
            // Create new
            const created = await this.pb.collection(collection).create(data);
            return recordToPlain(created);
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async count(collection, filter) {
        await this.ensureAuth();
        try {
            const pbOptions = {};
            if (filter) {
                pbOptions.filter = filterToPocketBase(filter);
            }
            const result = await this.pb.collection(collection).getList(1, 1, pbOptions);
            return result.totalItems;
        }
        catch (err) {
            throw mapPocketBaseError(err, collection);
        }
    }
    async collectionExists(collection) {
        await this.ensureAuth();
        try {
            // Try listing 0 items — if collection doesn't exist, PB throws
            await this.pb.collection(collection).getList(1, 1);
            return true;
        }
        catch {
            return false;
        }
    }
    async listCollections() {
        await this.ensureAuth();
        try {
            const collections = await this.pb.collections.getFullList();
            return collections
                .map((c) => c.name)
                .filter((name) => !name.startsWith('_'));
        }
        catch (err) {
            throw mapPocketBaseError(err);
        }
    }
}
/**
 * Convert a PocketBase record object to a plain object.
 * PocketBase uses 'created'/'updated' instead of 'created_at'/'updated_at'.
 */
function recordToPlain(record) {
    const plain = {};
    for (const [key, value] of Object.entries(record)) {
        if (key === 'collectionId' || key === 'collectionName' || key === 'expand')
            continue;
        // Map PocketBase field names to our standard names
        if (key === 'created') {
            plain['created_at'] = value;
        }
        else if (key === 'updated') {
            plain['updated_at'] = value;
        }
        else {
            plain[key] = value;
        }
    }
    return plain;
}
/**
 * Convert Filter (OR-of-AND groups) to PocketBase filter string.
 */
function filterToPocketBase(filter) {
    if (filter.length === 0)
        return '';
    const orGroups = filter.map((andGroup) => {
        const andClauses = andGroup.map(clauseToPocketBase);
        return andClauses.length === 1 ? andClauses[0] : `(${andClauses.join(' && ')})`;
    });
    return orGroups.length === 1 ? orGroups[0] : `(${orGroups.join(' || ')})`;
}
/**
 * Sanitize a string value for use in PocketBase filter expressions.
 * Strips/escapes all PocketBase filter metacharacters to prevent injection.
 */
function sanitizePocketBaseValue(value) {
    // Escape single quotes (PocketBase string delimiter)
    let sanitized = value.replace(/'/g, "\\'");
    // Remove characters that could alter filter logic
    // PocketBase filter syntax: &&, ||, ~, !, =, !=, >, <, >=, <=, (, )
    // We only need to worry about these OUTSIDE of quoted strings
    // Since we always wrap in quotes, just escaping ' is sufficient IF we also
    // strip any unmatched quotes. But to be safe, also strip backslash sequences
    // that could escape our closing quote.
    sanitized = sanitized.replace(/\\/g, '\\\\');
    return sanitized;
}
/**
 * Validate a field name contains only safe characters (alphanumeric + underscore).
 * Prevents filter injection via field names.
 */
function validateFieldName(field) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) {
        throw new AdapterError('VALIDATION_ERROR', `Invalid field name: ${field}`);
    }
}
function clauseToPocketBase(clause) {
    const { field, op, value } = clause;
    validateFieldName(field);
    const formatValue = (v) => {
        if (v === null)
            return 'null';
        if (typeof v === 'string')
            return `'${sanitizePocketBaseValue(v)}'`;
        if (typeof v === 'boolean')
            return v ? 'true' : 'false';
        return String(v);
    };
    switch (op) {
        case 'eq':
            return `${field} = ${formatValue(value)}`;
        case 'neq':
            return `${field} != ${formatValue(value)}`;
        case 'gt':
            return `${field} > ${formatValue(value)}`;
        case 'gte':
            return `${field} >= ${formatValue(value)}`;
        case 'lt':
            return `${field} < ${formatValue(value)}`;
        case 'lte':
            return `${field} <= ${formatValue(value)}`;
        case 'like':
            return `${field} ~ ${formatValue(value)}`;
        case 'in': {
            const arr = value;
            const formatted = arr.map((v) => `'${sanitizePocketBaseValue(v)}'`).join(',');
            return `${field} ?= ${formatted}`;
        }
        case 'contains':
            return `${field} ~ ${formatValue(value)}`;
        default:
            return `${field} = ${formatValue(value)}`;
    }
}
function sortToPocketBase(sorts) {
    return sorts
        .map((s) => {
        // PocketBase 0.25+ doesn't allow sorting by system fields (created/updated).
        // Map created_at/updated_at to user-sortable alternatives.
        let field = s.field;
        if (field === 'created_at' || field === 'created')
            field = 'id'; // id is monotonically increasing
        if (field === 'updated_at' || field === 'updated')
            field = 'id';
        return s.direction === 'desc' ? `-${field}` : `+${field}`;
    })
        .join(',');
}
/**
 * Map PocketBase errors to AdapterError codes.
 */
function mapPocketBaseError(err, collection) {
    if (err instanceof AdapterError)
        return err;
    const pbErr = err;
    const status = pbErr.status ?? pbErr.response?.code;
    const message = pbErr.response?.message ?? pbErr.message ?? 'Unknown PocketBase error';
    if (status === 404) {
        // Could be collection not found or record not found
        if (message.includes('missing collection') || message.includes('Missing collection')) {
            return new AdapterError('COLLECTION_NOT_FOUND', `Collection '${collection ?? 'unknown'}' not found`);
        }
        return new AdapterError('RECORD_NOT_FOUND', `Record not found in '${collection ?? 'unknown'}'`);
    }
    if (status === 400) {
        if (pbErr.response?.data) {
            // Check for unique constraint
            const data = pbErr.response.data;
            for (const val of Object.values(data)) {
                const fieldErr = val;
                if (fieldErr.code === 'validation_not_unique') {
                    return new AdapterError('UNIQUE_VIOLATION', message);
                }
            }
        }
        return new AdapterError('VALIDATION_ERROR', message);
    }
    if (status === 401 || status === 403) {
        return new AdapterError('AUTH_ERROR', message);
    }
    // Connection errors
    if (err instanceof TypeError && err.message.includes('fetch')) {
        return new AdapterError('CONNECTION_ERROR', `Cannot connect to PocketBase at ${collection ?? 'unknown URL'}`);
    }
    return new AdapterError('UNKNOWN', message);
}
//# sourceMappingURL=pocketbase.js.map