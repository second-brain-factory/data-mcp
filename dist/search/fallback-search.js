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
/**
 * Run textSearch with any-term fallback.
 *
 * @param adapter   data adapter (possibly owner-scope proxied)
 * @param collection collection name
 * @param query     the original full query (primary search)
 * @param fallbackTerms stemmed terms to try when primary yields nothing
 * @param options   passed through to every textSearch call
 */
export async function textSearchWithFallback(adapter, collection, query, fallbackTerms, options = {}) {
    const primary = await adapter.textSearch(collection, query, options);
    if (primary.length > 0) {
        return { items: primary, usedFallback: false, termsUsed: [] };
    }
    // Single useful term identical to the query? Nothing more to try.
    const terms = fallbackTerms.filter((t) => t && t.toLowerCase() !== query.toLowerCase());
    if (terms.length === 0) {
        return { items: primary, usedFallback: false, termsUsed: [] };
    }
    const limit = options.limit ?? 10;
    const perTerm = await Promise.all(terms.map(async (term) => {
        try {
            return await adapter.textSearch(collection, term, options);
        }
        catch {
            return [];
        }
    }));
    // Merge: rank by number of distinct terms matched, then by best
    // position in any term's result list (adapters return ranked lists).
    const byId = new Map();
    perTerm.forEach((items) => {
        items.forEach((item, rank) => {
            const id = String(item.id ?? JSON.stringify(item));
            const entry = byId.get(id);
            if (entry) {
                entry.matches += 1;
                entry.bestRank = Math.min(entry.bestRank, rank);
            }
            else {
                byId.set(id, { item, matches: 1, bestRank: rank });
            }
        });
    });
    const merged = Array.from(byId.values())
        .sort((a, b) => b.matches - a.matches || a.bestRank - b.bestRank)
        .slice(0, limit)
        .map((e) => e.item);
    return { items: merged, usedFallback: merged.length > 0, termsUsed: terms };
}
//# sourceMappingURL=fallback-search.js.map