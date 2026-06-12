/**
 * Tool: knowledge_recall
 *
 * Full-text search across knowledge and decisions.
 * Uses alias expansion to broaden queries.
 * Empty query returns most recent items.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
import { expandQueryWithAliases } from '../../search/alias-expansion.js';
import { buildFallbackTerms } from '../../search/term-utils.js';
import { textSearchWithFallback } from '../../search/fallback-search.js';
export function registerKnowledgeRecall(server, adapter) {
    server.registerTool('knowledge_recall', {
        description: 'Search your persistent memory. Full-text search across knowledge items and decisions. Empty query returns most recent items. Supports alias expansion (e.g., "payment" also finds "stripe").',
        inputSchema: {
            query: z.string().max(500).optional().describe('Search query (full-text search). Empty returns recent items.'),
            type: z.enum(['fact', 'pattern', 'insight', 'lesson', 'reference']).optional().describe('Filter by knowledge type'),
            owner_scope: z.enum(['private', 'shared']).optional().describe('Filter to private or shared team memory'),
            limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
        },
        annotations: { readOnlyHint: true },
        // Hot-path tool: ask tool-search-capable clients (Claude Code, API
        // defer_loading) to keep this definition loaded instead of deferring it.
        _meta: { 'anthropic/alwaysLoad': true },
    }, withGracefulDegradation('knowledge', adapter, async (params) => {
        try {
            const resultLimit = params.limit ?? 10;
            // Empty query: return most recent items
            if (!params.query || params.query.trim() === '') {
                const clauses = [];
                if (params.type) {
                    clauses.push({ field: 'type', op: 'eq', value: params.type });
                }
                if (params.owner_scope && adapter.ownerScopeEnabled) {
                    clauses.push({ field: 'owner_scope', op: 'eq', value: params.owner_scope });
                }
                const filter = clauses.length > 0 ? [clauses] : undefined;
                const result = await adapter.list('knowledge', {
                    filter,
                    sort: [{ field: 'created_at', direction: 'desc' }],
                    page: { limit: resultLimit, offset: 0 },
                });
                return makeToolResponse({
                    results: result.items,
                    total: result.items.length,
                    query: null,
                    message: 'Showing most recent items.',
                });
            }
            const searchQuery = params.query.trim();
            // Expand query with aliases
            const expandedTerms = await expandQueryWithAliases(adapter, searchQuery);
            const expandedQuery = expandedTerms.join(' ');
            // Fallback terms: stemmed tokens of the query + alias expansions
            // (issue #1297 — only used when the primary search returns nothing)
            const fallbackTerms = buildFallbackTerms(searchQuery, expandedTerms);
            // Search knowledge
            const clauses = [];
            if (params.type) {
                clauses.push({ field: 'type', op: 'eq', value: params.type });
            }
            if (params.owner_scope && adapter.ownerScopeEnabled) {
                clauses.push({ field: 'owner_scope', op: 'eq', value: params.owner_scope });
            }
            const typeFilter = clauses.length > 0 ? [clauses] : undefined;
            const knowledgeSearch = await textSearchWithFallback(adapter, 'knowledge', expandedQuery, fallbackTerms, {
                fields: ['title', 'content', 'summary'],
                filter: typeFilter,
                limit: resultLimit,
            });
            const knowledgeResults = knowledgeSearch.items;
            // Search decisions (if table exists)
            let decisionResults = [];
            let decisionsUsedFallback = false;
            try {
                const decisionsExist = await adapter.collectionExists('decisions');
                if (decisionsExist) {
                    const decisionFilter = params.owner_scope && adapter.ownerScopeEnabled
                        ? [[{ field: 'owner_scope', op: 'eq', value: params.owner_scope }]]
                        : undefined;
                    const decisionSearch = await textSearchWithFallback(adapter, 'decisions', expandedQuery, fallbackTerms, {
                        fields: ['title', 'context', 'chosen_option'],
                        filter: decisionFilter,
                        limit: 5,
                    });
                    decisionResults = decisionSearch.items;
                    decisionsUsedFallback = decisionSearch.usedFallback;
                }
            }
            catch {
                // Decisions table might not exist — degrade silently
            }
            const usedFallback = knowledgeSearch.usedFallback || decisionsUsedFallback;
            const results = [
                ...knowledgeResults.map((k) => ({ ...k, _source: 'knowledge' })),
                ...decisionResults.map((d) => ({ ...d, _source: 'decision' })),
            ];
            return makeToolResponse({
                results,
                total: results.length,
                query: searchQuery,
                expanded_terms: expandedTerms.length > searchQuery.split(/\s+/).length ? expandedTerms : undefined,
                matched_via: usedFallback ? 'any_term_fallback' : undefined,
                fallback_terms: usedFallback ? fallbackTerms : undefined,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'knowledge_recall');
        }
    }));
}
//# sourceMappingURL=knowledge-recall.js.map