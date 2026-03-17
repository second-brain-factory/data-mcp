/**
 * Tool: knowledge_recall
 *
 * Full-text search across knowledge and decisions.
 * Uses alias expansion to broaden queries.
 * Empty query returns most recent items.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import type { KnowledgeRecord, DecisionRecord } from '../../types/records.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
import { expandQueryWithAliases } from '../../search/alias-expansion.js';

export function registerKnowledgeRecall(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'knowledge_recall',
    'Search your persistent memory. Full-text search across knowledge items and decisions. Empty query returns most recent items. Supports alias expansion (e.g., "payment" also finds "stripe").',
    {
      query: z.string().max(500).optional().describe('Search query (full-text search). Empty returns recent items.'),
      type: z.enum(['fact', 'pattern', 'insight', 'lesson', 'reference']).optional().describe('Filter by knowledge type'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
    },
    { readOnlyHint: true },
    withGracefulDegradation('knowledge', adapter, async (params) => {
      try {
        const resultLimit = params.limit ?? 10;

        // Empty query: return most recent items
        if (!params.query || params.query.trim() === '') {
          const filter = params.type
            ? [[{ field: 'type' as const, op: 'eq' as const, value: params.type }]]
            : undefined;

          const result = await adapter.list<KnowledgeRecord>('knowledge', {
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

        // Search knowledge
        const typeFilter = params.type
          ? [[{ field: 'type' as const, op: 'eq' as const, value: params.type }]]
          : undefined;

        const knowledgeResults = await adapter.textSearch<KnowledgeRecord>(
          'knowledge',
          expandedQuery,
          {
            fields: ['title', 'content', 'summary'],
            filter: typeFilter,
            limit: resultLimit,
          }
        );

        // Search decisions (if table exists)
        let decisionResults: Record<string, unknown>[] = [];
        try {
          const decisionsExist = await adapter.collectionExists('decisions');
          if (decisionsExist) {
            decisionResults = await adapter.textSearch<DecisionRecord>(
              'decisions',
              expandedQuery,
              {
                fields: ['title', 'context', 'chosen_option'],
                limit: 5,
              }
            );
          }
        } catch {
          // Decisions table might not exist — degrade silently
        }

        const results = [
          ...knowledgeResults.map((k) => ({ ...k, _source: 'knowledge' })),
          ...decisionResults.map((d) => ({ ...d, _source: 'decision' })),
        ];

        return makeToolResponse({
          results,
          total: results.length,
          query: searchQuery,
          expanded_terms: expandedTerms.length > searchQuery.split(/\s+/).length ? expandedTerms : undefined,
        });
      } catch (error) {
        return handleAdapterError(error, 'knowledge_recall');
      }
    })
  );
}
