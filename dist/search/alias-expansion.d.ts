/**
 * Entity alias expansion for knowledge recall.
 *
 * Loads aliases from the entity_aliases collection and expands query tokens.
 * Example: "payment stuff" -> ["payment", "stuff", "stripe", "checkout", "pricing", "invoice"]
 *
 * Degrades silently if entity_aliases table is missing.
 */
import type { DataAdapter } from '../adapter/types.js';
/**
 * AliasExpander — encapsulates alias cache and expansion logic.
 *
 * Takes a DataAdapter in its constructor. The cache is per-instance,
 * making it easy to test without module-level singletons.
 */
export declare class AliasExpander {
    private readonly adapter;
    private cache;
    private cacheTimestamp;
    constructor(adapter: DataAdapter);
    /**
     * Expand a search query with entity aliases.
     *
     * Tokenizes the query, looks up each token in the alias map,
     * and adds expanded terms to the result.
     *
     * Returns deduplicated array of all query terms (original + expansions).
     */
    expandQuery(query: string): Promise<string[]>;
    /** Clear the internal alias cache (useful for testing) */
    clearCache(): void;
    /**
     * Load all aliases from the entity_aliases collection.
     * Builds a map: alias -> [canonical, ...other_aliases_for_same_canonical]
     * Also maps: canonical -> [all its aliases]
     */
    private loadAliases;
}
/** Create an AliasExpander for the given adapter */
export declare function createAliasExpander(adapter: DataAdapter): AliasExpander;
/**
 * Convenience function: expand a search query with entity aliases.
 *
 * Uses a shared expander per adapter for caching. For repeated calls,
 * prefer creating and reusing an AliasExpander instance directly.
 */
export declare function expandQueryWithAliases(adapter: DataAdapter, query: string): Promise<string[]>;
/**
 * Clear all shared alias caches.
 * @deprecated Use AliasExpander class instances with clearCache() instead.
 */
export declare function clearAliasCache(): void;
//# sourceMappingURL=alias-expansion.d.ts.map