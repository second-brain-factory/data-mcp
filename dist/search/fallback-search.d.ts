/**
 * Any-term fallback search (issue #1297).
 *
 * Primary search runs the adapter's native textSearch with the full
 * query — ranking for exact-match queries is untouched. Only when the
 * primary search returns ZERO results do we fall back to per-term
 * searches using prefix-stemmed tokens (see term-utils.ts), merging
 * results ranked by how many distinct terms matched.
 *
 * Backend behavior notes:
 * - markdown: primary is case-insensitive substring of the whole query;
 *   fallback terms are substrings too, so stems match inflections.
 * - supabase: primary is tsvector plainto_tsquery (english config — has
 *   its own stemming, ANDs all words); fallback terms go through the
 *   same path and a 1-word stem still benefits from prefix-style ILIKE
 *   only when search_vector is absent. Stems are still useful because
 *   single-term queries avoid the AND-of-all-words trap.
 * - pocketbase: primary is LIKE (~) of the whole query per field;
 *   fallback terms are per-term LIKEs.
 */
import type { DataAdapter, Filter } from '../adapter/types.js';
export interface FallbackSearchOptions {
    fields?: string[];
    filter?: Filter;
    limit?: number;
}
export interface FallbackSearchResult<T> {
    items: T[];
    /** true when the per-term fallback produced the results */
    usedFallback: boolean;
    /** terms used by the fallback (empty when fallback not used) */
    termsUsed: string[];
}
/**
 * Run textSearch with any-term fallback.
 *
 * @param adapter   data adapter (possibly owner-scope proxied)
 * @param collection collection name
 * @param query     the original full query (primary search)
 * @param fallbackTerms stemmed terms to try when primary yields nothing
 * @param options   passed through to every textSearch call
 */
export declare function textSearchWithFallback<T extends Record<string, unknown>>(adapter: DataAdapter, collection: string, query: string, fallbackTerms: string[], options?: FallbackSearchOptions): Promise<FallbackSearchResult<T>>;
//# sourceMappingURL=fallback-search.d.ts.map