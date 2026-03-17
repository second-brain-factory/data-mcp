/**
 * Tool: knowledge_list
 *
 * List knowledge items with optional filters and pagination.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter, FilterClause } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerKnowledgeList(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'knowledge_list',
    'List knowledge items with optional type and tag filters. Supports pagination.',
    {
      type: z.enum(['fact', 'pattern', 'insight', 'lesson', 'reference']).optional().describe('Filter by knowledge type'),
      tags: z.array(z.string()).optional().describe('Filter by tags (items must contain ALL specified tags)'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
      offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    },
    withGracefulDegradation('knowledge', adapter, async (params) => {
      try {
        const clauses: FilterClause[] = [];
        if (params.type) {
          clauses.push({ field: 'type', op: 'eq', value: params.type });
        }
        if (params.tags) {
          for (const tag of params.tags) {
            clauses.push({ field: 'tags', op: 'contains', value: tag });
          }
        }

        const filter = clauses.length > 0 ? [clauses] : undefined;

        const result = await adapter.list<Record<string, unknown>>('knowledge', {
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
      } catch (error) {
        return handleAdapterError(error, 'knowledge_list');
      }
    })
  );
}
