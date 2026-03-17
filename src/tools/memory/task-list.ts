/**
 * Tool: task_list
 *
 * List tasks with optional status and priority filters.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter, FilterClause } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerTaskList(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'task_list',
    'List tasks with optional status and priority filters.',
    {
      status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional().describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('Filter by priority'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
      offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    },
    withGracefulDegradation('tasks', adapter, async (params) => {
      try {
        const clauses: FilterClause[] = [];
        if (params.status) {
          clauses.push({ field: 'status', op: 'eq', value: params.status });
        }
        if (params.priority) {
          clauses.push({ field: 'priority', op: 'eq', value: params.priority });
        }

        const filter = clauses.length > 0 ? [clauses] : undefined;

        const result = await adapter.list<Record<string, unknown>>('tasks', {
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
        return handleAdapterError(error, 'task_list');
      }
    })
  );
}
