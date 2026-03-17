/**
 * Tool: blog_list
 *
 * List blog posts with optional status filter.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter, FilterClause } from '../../adapter/types.js';
import type { BlogPostRecord } from '../../types/records.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerBlogList(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'blog_list',
    'List blog posts with optional status filter.',
    {
      status: z.enum(['draft', 'published', 'archived']).optional().describe('Filter by status'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
      offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    },
    { readOnlyHint: true },
    withGracefulDegradation('blog_posts', adapter, async (params) => {
      try {
        const clauses: FilterClause[] = [];
        if (params.status) {
          clauses.push({ field: 'status', op: 'eq', value: params.status });
        }

        const filter = clauses.length > 0 ? [clauses] : undefined;

        const result = await adapter.list<BlogPostRecord>('blog_posts', {
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
        return handleAdapterError(error, 'blog_list');
      }
    })
  );
}
