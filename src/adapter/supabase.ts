/**
 * Supabase adapter implementation.
 *
 * Uses service role key for authentication.
 * textSearch uses PostgreSQL tsvector when available, ILIKE fallback.
 * ILIKE search sanitizes \, %, _ characters.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AdapterError } from '../errors/adapter-error.js';
import type { DataAdapter, Filter, FilterClause, ListResult, SortClause, PageOptions } from './types.js';

export class SupabaseAdapter implements DataAdapter {
  readonly backend = 'supabase' as const;
  private client: SupabaseClient;

  constructor(url: string, key: string) {
    this.client = createClient(url, key);
  }

  async create<T extends Record<string, unknown>>(
    collection: string,
    data: Record<string, unknown>
  ): Promise<T> {
    const { data: result, error } = await this.client
      .from(collection)
      .insert(data)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, collection);
    return result as T;
  }

  async getOne<T extends Record<string, unknown>>(
    collection: string,
    id: string
  ): Promise<T> {
    const { data: result, error } = await this.client
      .from(collection)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw mapSupabaseError(error, collection);
    return result as T;
  }

  async list<T extends Record<string, unknown>>(
    collection: string,
    options?: {
      filter?: Filter;
      sort?: SortClause[];
      page?: PageOptions;
    }
  ): Promise<ListResult<T>> {
    const limit = options?.page?.limit ?? 50;
    const offset = options?.page?.offset ?? 0;

    let query = this.client.from(collection).select('*', { count: 'exact' });
    query = applyFilter(query, options?.filter);

    if (options?.sort) {
      for (const s of options.sort) {
        query = query.order(s.field, { ascending: s.direction === 'asc' });
      }
    } else {
      query = query.order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw mapSupabaseError(error, collection);

    return {
      items: (data ?? []) as T[],
      totalItems: count ?? 0,
      page: Math.floor(offset / limit) + 1,
      perPage: limit,
    };
  }

  async textSearch<T extends Record<string, unknown>>(
    collection: string,
    query: string,
    options?: {
      fields?: string[];
      filter?: Filter;
      limit?: number;
    }
  ): Promise<T[]> {
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

      // If tsvector column exists and returned results, use them
      if (!error && data && data.length > 0) {
        return data as T[];
      }
    } catch {
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
    if (error) throw mapSupabaseError(error, collection);
    return (data ?? []) as T[];
  }

  async update<T extends Record<string, unknown>>(
    collection: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<T> {
    const { data: result, error } = await this.client
      .from(collection)
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw mapSupabaseError(error, collection);
    return result as T;
  }

  async delete(collection: string, id: string): Promise<void> {
    const { error } = await this.client
      .from(collection)
      .delete()
      .eq('id', id);

    if (error) throw mapSupabaseError(error, collection);
  }

  async upsert<T extends Record<string, unknown>>(
    collection: string,
    data: Record<string, unknown>,
    uniqueFields: string[]
  ): Promise<T> {
    // Build a query to find existing record by unique fields
    let query = this.client.from(collection).select('id');
    for (const field of uniqueFields) {
      const value = data[field];
      if (typeof value === 'string') {
        const escaped = value.replace(/[\\%_]/g, '\\$&');
        query = query.ilike(field, escaped);
      } else {
        query = query.eq(field, value as string);
      }
    }

    const { data: existing } = await query.limit(1).maybeSingle();

    if (existing) {
      return this.update<T>(collection, (existing as Record<string, unknown>).id as string, data);
    }

    return this.create<T>(collection, data);
  }

  async count(collection: string, filter?: Filter): Promise<number> {
    let query = this.client.from(collection).select('id', { count: 'exact', head: true });
    query = applyFilter(query, filter);

    const { count, error } = await query;
    if (error) throw mapSupabaseError(error, collection);
    return count ?? 0;
  }

  async collectionExists(collection: string): Promise<boolean> {
    const { error } = await this.client
      .from(collection)
      .select('id', { count: 'exact', head: true })
      .limit(0);

    if (!error) return true;
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

  async listCollections(): Promise<string[]> {
    // Query pg_tables for tables in the public schema
    const { data, error } = await this.client
      .rpc('get_public_tables');

    if (error) {
      // Fallback: try information_schema
      const { data: fallbackData, error: fallbackError } = await this.client
        .from('information_schema.tables' as string)
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE');

      if (fallbackError) throw mapSupabaseError(fallbackError);
      return (fallbackData ?? []).map((r: Record<string, unknown>) => r.table_name as string);
    }

    return (data ?? []).map((r: Record<string, unknown>) => r.table_name as string);
  }
}

/**
 * Escape special ILIKE characters: \, %, _
 */
function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

/**
 * Apply Filter (OR-of-AND groups) to a Supabase query.
 * Uses `any` for the query type since PostgREST builder types are complex generics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(query: any, filter?: Filter): any {
  if (!filter || filter.length === 0) return query;

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
function applyClause(query: any, clause: FilterClause): any {
  const { field, op, value } = clause;

  switch (op) {
    case 'eq': return query.eq(field, value);
    case 'neq': return query.neq(field, value);
    case 'gt': return query.gt(field, value);
    case 'gte': return query.gte(field, value);
    case 'lt': return query.lt(field, value);
    case 'lte': return query.lte(field, value);
    case 'like': return query.ilike(field, `%${escapeIlike(value as string)}%`);
    case 'in': return query.in(field, value as string[]);
    case 'contains': return query.contains(field, [value]);
    default: return query.eq(field, value);
  }
}

function clauseToSupabaseOr(clause: FilterClause): string {
  const { field, op, value } = clause;

  switch (op) {
    case 'eq': return `${field}.eq.${value}`;
    case 'neq': return `${field}.neq.${value}`;
    case 'gt': return `${field}.gt.${value}`;
    case 'gte': return `${field}.gte.${value}`;
    case 'lt': return `${field}.lt.${value}`;
    case 'lte': return `${field}.lte.${value}`;
    case 'like': return `${field}.ilike.%${escapeIlike(value as string)}%`;
    case 'in': return `${field}.in.(${(value as string[]).join(',')})`;
    case 'contains': return `${field}.cs.{${value}}`;
    default: return `${field}.eq.${value}`;
  }
}

/**
 * Map Supabase/PostgREST errors to AdapterError codes.
 */
function mapSupabaseError(
  error: { code?: string; message?: string; details?: string },
  collection?: string
): AdapterError {
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
