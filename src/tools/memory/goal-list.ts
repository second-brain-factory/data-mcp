/**
 * Tool: goal_list
 *
 * List goals with optional status and timeframe filters.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter, FilterClause } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerGoalList(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'goal_list',
    'List goals with optional status and timeframe filters.',
    {
      status: z.enum(['active', 'completed', 'paused', 'abandoned']).optional().describe('Filter by status'),
      timeframe: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional().describe('Filter by timeframe'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
      offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    },
    withGracefulDegradation('goals', adapter, async (params) => {
      try {
        const clauses: FilterClause[] = [];
        if (params.status) {
          clauses.push({ field: 'status', op: 'eq', value: params.status });
        }
        if (params.timeframe) {
          clauses.push({ field: 'timeframe', op: 'eq', value: params.timeframe });
        }

        const filter = clauses.length > 0 ? [clauses] : undefined;

        const result = await adapter.list<Record<string, unknown>>('goals', {
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
        return handleAdapterError(error, 'goal_list');
      }
    })
  );
}
