/**
 * Supabase adapter implementation.
 *
 * Uses service role key for authentication.
 * textSearch uses PostgreSQL tsvector when available, ILIKE fallback.
 * ILIKE search sanitizes \, %, _ characters.
 */
import { createClient } from '@supabase/supabase-js';
import { AdapterError } from '../errors/adapter-error.js';
/** No-op WebSocket stand-in: satisfies realtime-js's constructor check without ws. */
class InertWebSocket {
    onopen = null;
    onclose = null;
    onerror = null;
    onmessage = null;
    readyState = 3; // CLOSED
    close() { }
    send() { }
    addEventListener() { }
    removeEventListener() { }
}
export class SupabaseAdapter {
    backend = 'supabase';
    client;
    constructor(url, key) {
        // data-mcp never uses Supabase realtime. supabase-js >= 2.108 throws at
        // createClient() on Node 20 ("Node.js 20 detected without native
        // WebSocket support") unless a realtime transport is provided. Pass an
        // inert stub so the server boots on every Node >= 20 (our engines floor).
        this.client = createClient(url, key, {
            realtime: { transport: InertWebSocket },
        });
    }
    async create(collection, data) {
        const { data: result, error } = await this.client
            .from(collection)
            .insert(data)
            .select()
            .single();
        if (error)
            throw mapSupabaseError(error, collection);
        return result;
    }
    async getOne(collection, id) {
        const { data: result, error } = await this.client
            .from(collection)
            .select('*')
            .eq('id', id)
            .single();
        if (error)
            throw mapSupabaseError(error, collection);
        return result;
    }
    async list(collection, options) {
        const limit = options?.page?.limit ?? 50;
        const offset = options?.page?.offset ?? 0;
        let query = this.client.from(collection).select('*', { count: 'exact' });
        query = applyFilter(query, options?.filter);
        if (options?.sort) {
            for (const s of options.sort) {
                query = query.order(s.field, { ascending: s.direction === 'asc' });
            }
        }
        else {
            query = query.order('created_at', { ascending: false });
        }
        query = query.range(offset, offset + limit - 1);
        const { data, error, count } = await query;
        if (error)
            throw mapSupabaseError(error, collection);
        return {
            items: (data ?? []),
            totalItems: count ?? 0,
            page: Math.floor(offset / limit) + 1,
            perPage: limit,
        };
    }
    async textSearch(collection, query, options) {
        const limit = options?.limit ?? 20;
        // Try tsvector search first
        try {
            let q = this.client
                .from(collection)
                .select('*')
                .textSearch('search_vector', query, { type: 'plain', config: 'english' })
                .limit(limit);
            q = applyFilter(q, options?.filter);
            const { data, error } = await q;
            // If tsvector query succeeded (no error), return results even if empty
            // Only fall through to ILIKE if the column/function doesn't exist (error)
            if (!error) {
                return (data ?? []);
            }
            // Error indicates search_vector column likely doesn't exist — fall through
        }
        catch {
            // search_vector column may not exist — fall through to ILIKE
        }
        // ILIKE fallback
        const fields = options?.fields ?? ['title', 'content'];
        const escaped = escapeIlike(query);
        const orClauses = fields.map((f) => `${f}.ilike.%${escaped}%`).join(',');
        let q = this.client
            .from(collection)
            .select('*')
            .or(orClauses)
            .order('created_at', { ascending: false })
            .limit(limit);
        q = applyFilter(q, options?.filter);
        const { data, error } = await q;
        if (error)
            throw mapSupabaseError(error, collection);
        return (data ?? []);
    }
    async update(collection, id, data) {
        const { data: result, error } = await this.client
            .from(collection)
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw mapSupabaseError(error, collection);
        return result;
    }
    async delete(collection, id) {
        const { error } = await this.client
            .from(collection)
            .delete()
            .eq('id', id);
        if (error)
            throw mapSupabaseError(error, collection);
    }
    async upsert(collection, data, uniqueFields) {
        // Build a query to find existing record by unique fields
        let query = this.client.from(collection).select('id');
        for (const field of uniqueFields) {
            const value = data[field];
            if (typeof value === 'string') {
                const escaped = value.replace(/[\\%_]/g, '\\$&');
                query = query.ilike(field, escaped);
            }
            else {
                query = query.eq(field, value);
            }
        }
        const { data: existing } = await query.limit(1).maybeSingle();
        if (existing) {
            return this.update(collection, existing.id, data);
        }
        return this.create(collection, data);
    }
    async count(collection, filter) {
        let query = this.client.from(collection).select('id', { count: 'exact', head: true });
        query = applyFilter(query, filter);
        const { count, error } = await query;
        if (error)
            throw mapSupabaseError(error, collection);
        return count ?? 0;
    }
    async collectionExists(collection) {
        const { error } = await this.client
            .from(collection)
            .select('id', { count: 'exact', head: true })
            .limit(0);
        if (!error)
            return true;
        // PGRST205 = not in schema cache = table doesn't exist
        if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST106') {
            return false;
        }
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
            return false;
        }
        // Some other error — assume table exists but there's a different issue
        return true;
    }
    async listCollections() {
        // Query pg_tables for tables in the public schema
        const { data, error } = await this.client
            .rpc('get_public_tables');
        if (error) {
            // Fallback: try information_schema
            const { data: fallbackData, error: fallbackError } = await this.client
                .from('information_schema.tables')
                .select('table_name')
                .eq('table_schema', 'public')
                .eq('table_type', 'BASE TABLE');
            if (fallbackError)
                throw mapSupabaseError(fallbackError);
            return (fallbackData ?? []).map((r) => r.table_name);
        }
        return (data ?? []).map((r) => r.table_name);
    }
}
/**
 * Escape special ILIKE characters: \, %, _
 */
function escapeIlike(input) {
    return input.replace(/[\\%_]/g, '\\$&');
}
/**
 * Apply Filter (OR-of-AND groups) to a Supabase query.
 * Uses `any` for the query type since PostgREST builder types are complex generics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(query, filter) {
    if (!filter || filter.length === 0)
        return query;
    if (filter.length === 1 && filter[0].length === 1) {
        return applyClause(query, filter[0][0]);
    }
    if (filter.length === 1) {
        let q = query;
        for (const clause of filter[0]) {
            q = applyClause(q, clause);
        }
        return q;
    }
    // Multiple OR groups: build .or() string
    const orParts = filter.map((andGroup) => {
        if (andGroup.length === 1) {
            return clauseToSupabaseOr(andGroup[0]);
        }
        return `and(${andGroup.map(clauseToSupabaseOr).join(',')})`;
    });
    return query.or(orParts.join(','));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyClause(query, clause) {
    const { field, op, value } = clause;
    switch (op) {
        case 'eq': return query.eq(field, value);
        case 'neq': return query.neq(field, value);
        case 'gt': return query.gt(field, value);
        case 'gte': return query.gte(field, value);
        case 'lt': return query.lt(field, value);
        case 'lte': return query.lte(field, value);
        case 'like': return query.ilike(field, `%${escapeIlike(value)}%`);
        case 'in': return query.in(field, value);
        case 'contains': return query.contains(field, [value]);
        default: return query.eq(field, value);
    }
}
/**
 * Validate a field name contains only safe characters (alphanumeric + underscore + dot).
 * Prevents filter injection via field names.
 */
function validateFieldName(field) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) {
        throw new AdapterError('VALIDATION_ERROR', `Invalid field name: ${field}`);
    }
}
/**
 * Encode a value for safe interpolation into PostgREST filter strings.
 * URL-encodes characters that have special meaning in PostgREST syntax.
 */
function encodeFilterValue(value) {
    return encodeURIComponent(String(value));
}
function clauseToSupabaseOr(clause) {
    const { field, op, value } = clause;
    validateFieldName(field);
    switch (op) {
        case 'eq': return `${field}.eq.${encodeFilterValue(value)}`;
        case 'neq': return `${field}.neq.${encodeFilterValue(value)}`;
        case 'gt': return `${field}.gt.${encodeFilterValue(value)}`;
        case 'gte': return `${field}.gte.${encodeFilterValue(value)}`;
        case 'lt': return `${field}.lt.${encodeFilterValue(value)}`;
        case 'lte': return `${field}.lte.${encodeFilterValue(value)}`;
        case 'like': return `${field}.ilike.%${encodeFilterValue(escapeIlike(value))}%`;
        case 'in': return `${field}.in.(${value.map(v => encodeFilterValue(v)).join(',')})`;
        case 'contains': return `${field}.cs.{${encodeFilterValue(value)}}`;
        default: return `${field}.eq.${encodeFilterValue(value)}`;
    }
}
/**
 * Map Supabase/PostgREST errors to AdapterError codes.
 */
function mapSupabaseError(error, collection) {
    const code = error.code ?? '';
    const message = error.message ?? 'Unknown Supabase error';
    // Collection/table not found
    if (code === 'PGRST205' || code === '42P01' || code === 'PGRST106') {
        return new AdapterError('COLLECTION_NOT_FOUND', `Table '${collection ?? 'unknown'}' not found`);
    }
    if (message.includes('relation') && message.includes('does not exist')) {
        return new AdapterError('COLLECTION_NOT_FOUND', `Table '${collection ?? 'unknown'}' not found`);
    }
    // Record not found
    if (code === 'PGRST116') {
        return new AdapterError('RECORD_NOT_FOUND', `Record not found in '${collection ?? 'unknown'}'`);
    }
    // Unique violation
    if (code === '23505') {
        return new AdapterError('UNIQUE_VIOLATION', message);
    }
    // Validation errors
    if (code === '23502' || code === '23503' || code === '22001') {
        return new AdapterError('VALIDATION_ERROR', message);
    }
    // Auth errors
    if (code === '42501' || code === 'PGRST301') {
        return new AdapterError('AUTH_ERROR', message);
    }
    // Connection errors
    if (message.includes('fetch failed') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
        return new AdapterError('CONNECTION_ERROR', `Cannot connect to Supabase`);
    }
    return new AdapterError('UNKNOWN', message);
}
//# sourceMappingURL=supabase.js.map