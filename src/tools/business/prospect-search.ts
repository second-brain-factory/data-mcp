/**
 * Tool: prospect_search
 *
 * Search prospects by name, company, or notes.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerProspectSearch(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'prospect_search',
    'Search prospects by name, company, or notes.',
    {
      query: z.string().min(1).max(200).describe('Search query'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
    },
    withGracefulDegradation('prospects', adapter, async (params) => {
      try {
        const results = await adapter.textSearch<Record<string, unknown>>(
          'prospects',
          params.query,
          {
            fields: ['name', 'company', 'notes', 'email'],
            limit: params.limit ?? 10,
          }
        );

        return makeToolResponse({
          results,
          total: results.length,
          query: params.query,
        });
      } catch (error) {
        return handleAdapterError(error, 'prospect_search');
      }
    })
  );
}
