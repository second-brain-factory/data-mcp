/**
 * Entity alias expansion for knowledge recall.
 *
 * Loads aliases from the entity_aliases collection and expands query tokens.
 * Example: "payment stuff" -> ["payment", "stuff", "stripe", "checkout", "pricing", "invoice"]
 *
 * Degrades silently if entity_aliases table is missing.
 */

import type { DataAdapter } from '../adapter/types.js';
import type { EntityAliasRecord } from '../types/records.js';
const CACHE_TTL_MS = 5 * 60 * 1000;
/**
 * AliasExpander — encapsulates alias cache and expansion logic.
 *
 * Takes a DataAdapter in its constructor. The cache is per-instance,
 * making it easy to test without module-level singletons.
 */
export class AliasExpander {
    private readonly adapter: DataAdapter;
    private cache: Map<string, string[]> | null = null;
    private cacheTimestamp = 0;
    constructor(adapter: DataAdapter) {
        this.adapter = adapter;
    }
    /**
     * Expand a search query with entity aliases.
     *
     * Tokenizes the query, looks up each token in the alias map,
     * and adds expanded terms to the result.
     *
     * Returns deduplicated array of all query terms (original + expansions).
     */
    async expandQuery(query: string): Promise<string[]> {
        const aliasMap = await this.loadAliases();
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const expanded = new Set(tokens);
        for (const token of tokens) {
            const aliases = aliasMap.get(token);
            if (aliases) {
                for (const alias of aliases) {
                    expanded.add(alias);
                }
            }
        }
        return Array.from(expanded);
    }
    /** Clear the internal alias cache (useful for testing) */
    clearCache(): void {
        this.cache = null;
        this.cacheTimestamp = 0;
    }
    /**
     * Load all aliases from the entity_aliases collection.
     * Builds a map: alias -> [canonical, ...other_aliases_for_same_canonical]
     * Also maps: canonical -> [all its aliases]
     */
    private async loadAliases(): Promise<Map<string, string[]>> {
        if (this.cache && Date.now() - this.cacheTimestamp < CACHE_TTL_MS) {
            return this.cache;
        }
        try {
            const exists = await this.adapter.collectionExists('entity_aliases');
            if (!exists) {
                this.cache = new Map();
                this.cacheTimestamp = Date.now();
                return this.cache;
            }
            const result = await this.adapter.list<EntityAliasRecord>('entity_aliases', {
                page: { limit: 500, offset: 0 },
            });
            // Group by canonical
            const byCanonical = new Map<string, string[]>();
            for (const row of result.items) {
                const canonical = row.canonical.toLowerCase();
                const alias = row.alias.toLowerCase();
                if (!byCanonical.has(canonical)) {
                    byCanonical.set(canonical, []);
                }
                byCanonical.get(canonical)!.push(alias);
            }
            // Build expansion map: any term -> all related terms
            const expansionMap = new Map<string, string[]>();
            for (const [canonical, aliases] of byCanonical) {
                const allTerms = [canonical, ...aliases];
                // Map canonical -> aliases
                expansionMap.set(canonical, aliases);
                // Map each alias -> [canonical, ...other aliases]
                for (const alias of aliases) {
                    const others = allTerms.filter((t) => t !== alias);
                    expansionMap.set(alias, others);
                }
            }
            this.cache = expansionMap;
            this.cacheTimestamp = Date.now();
            return this.cache;
        }
        catch (err) {
            console.error('[alias-expansion] Failed to load aliases:', err);
            this.cache = new Map();
            this.cacheTimestamp = Date.now();
            return this.cache;
        }
    }
}
/** Create an AliasExpander for the given adapter */
export function createAliasExpander(adapter: DataAdapter): AliasExpander {
    return new AliasExpander(adapter);
}
/**
 * Convenience function: expand a search query with entity aliases.
 *
 * Uses a shared expander per adapter for caching. For repeated calls,
 * prefer creating and reusing an AliasExpander instance directly.
 */
export async function expandQueryWithAliases(adapter: DataAdapter, query: string): Promise<string[]> {
    if (!sharedExpanders.has(adapter)) {
        sharedExpanders.set(adapter, new AliasExpander(adapter));
    }
    return sharedExpanders.get(adapter)!.expandQuery(query);
}
/** Shared expanders for the convenience function */
const sharedExpanders = new Map<DataAdapter, AliasExpander>();
/**
 * Clear all shared alias caches.
 * @deprecated Use AliasExpander class instances with clearCache() instead.
 */
export function clearAliasCache(): void {
    for (const expander of sharedExpanders.values()) {
        expander.clearCache();
    }
    sharedExpanders.clear();
}
