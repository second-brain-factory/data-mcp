/**
 * Tool: record_query
 *
 * Generic list + text search across registry collections (issue #13).
 * Replaces: knowledge_list, session_list, goal_list, task_list,
 * contact_list, contact_search, prospect_list, prospect_search, blog_list,
 * content_queue_list.
 *
 * With `query` set, runs text search over the collection's search fields;
 * otherwise a filtered, paginated list sorted created_at desc. Equality
 * filters are validated against the registry's allow-list; knowledge keeps
 * its AND-contains tag semantics.
 *
 * Hot-path tool: marked anthropic/alwaysLoad (took task_list's slot when
 * the per-collection list tools were folded).
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter, FilterClause } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse, handleAdapterError } from '../shared.js';
import { RECORD_COLLECTIONS, QUERYABLE } from './registry.js';

const FILTER_DOC = QUERYABLE
    .filter((c) => RECORD_COLLECTIONS[c].filterFields.length > 0)
    .map((c) => `${c}: ${RECORD_COLLECTIONS[c].filterFields.join(', ')}`)
    .join('; ');

export function registerRecordQuery(server: McpServer, adapter: DataAdapter): void {
    server.registerTool('record_query', {
        description: `List or search records in a Second Brain collection: ${QUERYABLE.join(', ')}. Set query for text search (contacts, prospects, decisions); omit it for a filtered list (most recent first). Equality filters per collection — ${FILTER_DOC}. knowledge also accepts a tags filter (items must contain ALL tags). For knowledge text search prefer knowledge_recall.`,
        inputSchema: {
            collection: z.enum(QUERYABLE).describe('Target collection'),
            query: z.string().max(500).optional().describe('Text search query (collections with search fields only)'),
            filters: z.record(z.string()).optional().describe('Equality filters, e.g. {"status": "todo"}'),
            tags: z.array(z.string().max(100)).max(20).optional().describe('knowledge only: items must contain ALL these tags'),
            owner_scope: z.enum(['private', 'shared']).optional().describe('Team mode: filter to private or shared records'),
            limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20, search default 10)'),
            offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0, list only)'),
        },
        annotations: { readOnlyHint: true },
        // Hot-path tool: keep loaded under client-side tool search.
        _meta: { 'anthropic/alwaysLoad': true },
    }, async (params) => {
        const spec = RECORD_COLLECTIONS[params.collection];
        if (!spec) {
            return makeErrorResponse(`Unknown collection '${params.collection}'.`);
        }
        // Validate filters against the allow-list before touching the adapter.
        const clauses: FilterClause[] = [];
        if (params.filters) {
            for (const [field, value] of Object.entries(params.filters)) {
                if (!spec.filterFields.includes(field)) {
                    return makeToolResponse({
                        error: `Field '${field}' is not filterable on '${params.collection}'.`,
                        allowed_filters: spec.filterFields,
                    });
                }
                clauses.push({ field, op: 'eq', value });
            }
        }
        if (params.tags && params.tags.length > 0) {
            if (!spec.tagFilter) {
                return makeToolResponse({ error: `Collection '${params.collection}' does not support tag filtering.` });
            }
            for (const tag of params.tags) {
                clauses.push({ field: 'tags', op: 'contains', value: tag });
            }
        }
        if (params.owner_scope && spec.ownerScope && adapter.ownerScopeEnabled) {
            clauses.push({ field: 'owner_scope', op: 'eq', value: params.owner_scope });
        }
        const filter = clauses.length > 0 ? [clauses] : undefined;
        try {
            if (!(await adapter.collectionExists(spec.collection))) {
                return makeErrorResponse(`The '${spec.collection}' table does not exist yet. Run setup_migrate to create the database schema.`);
            }
            if (params.query && params.query.trim() !== '') {
                if (!spec.searchFields) {
                    return makeToolResponse({
                        error: `Collection '${params.collection}' does not support text search. Omit query to list records.`,
                    });
                }
                const results = await adapter.textSearch(spec.collection, params.query.trim(), {
                    fields: spec.searchFields,
                    filter,
                    limit: params.limit ?? 10,
                });
                return makeToolResponse({ results, total: results.length, query: params.query.trim() });
            }
            const result = await adapter.list(spec.collection, {
                filter,
                sort: [{ field: 'created_at', direction: 'desc' }],
                page: { limit: params.limit ?? 20, offset: params.offset ?? 0 },
            });
            return makeToolResponse({
                items: result.items,
                total: result.totalItems,
                page: result.page,
                per_page: result.perPage,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'record_query');
        }
    });
}
