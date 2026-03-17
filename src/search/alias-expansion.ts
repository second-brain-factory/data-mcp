/**
 * Entity alias expansion for knowledge recall.
 *
 * Loads aliases from the entity_aliases collection and expands query tokens.
 * Example: "payment stuff" → ["payment", "stuff", "stripe", "checkout", "pricing", "invoice"]
 *
 * Degrades silently if entity_aliases table is missing.
 */

import type { DataAdapter } from '../adapter/types.js';

interface EntityAlias extends Record<string, unknown> {
  canonical: string;
  alias: string;
}

/** Cache aliases for 5 minutes to avoid repeated lookups */
let aliasCache: Map<string, string[]> | null = null;
let aliasCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Load all aliases from the entity_aliases collection.
 * Builds a map: alias → [canonical, ...other_aliases_for_same_canonical]
 * Also maps: canonical → [all its aliases]
 */
async function loadAliases(adapter: DataAdapter): Promise<Map<string, string[]>> {
  if (aliasCache && Date.now() - aliasCacheTimestamp < CACHE_TTL_MS) {
    return aliasCache;
  }

  try {
    const exists = await adapter.collectionExists('entity_aliases');
    if (!exists) {
      aliasCache = new Map();
      aliasCacheTimestamp = Date.now();
      return aliasCache;
    }

    const result = await adapter.list<EntityAlias>('entity_aliases', {
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

    // Build expansion map: any term → all related terms
    const expansionMap = new Map<string, string[]>();
    for (const [canonical, aliases] of byCanonical) {
      const allTerms = [canonical, ...aliases];

      // Map canonical → aliases
      expansionMap.set(canonical, aliases);

      // Map each alias → [canonical, ...other aliases]
      for (const alias of aliases) {
        const others = allTerms.filter((t) => t !== alias);
        expansionMap.set(alias, others);
      }
    }

    aliasCache = expansionMap;
    aliasCacheTimestamp = Date.now();
    return aliasCache;
  } catch (err) {
    console.error('[alias-expansion] Failed to load aliases:', err);
    aliasCache = new Map();
    aliasCacheTimestamp = Date.now();
    return aliasCache;
  }
}

/**
 * Expand a search query with entity aliases.
 *
 * Tokenizes the query, looks up each token in the alias map,
 * and adds expanded terms to the result.
 *
 * Returns deduplicated array of all query terms (original + expansions).
 */
export async function expandQueryWithAliases(
  adapter: DataAdapter,
  query: string
): Promise<string[]> {
  const aliasMap = await loadAliases(adapter);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const expanded = new Set<string>(tokens);

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

/** Clear the alias cache (useful for testing) */
export function clearAliasCache(): void {
  aliasCache = null;
  aliasCacheTimestamp = 0;
}
