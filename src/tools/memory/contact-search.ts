/**
 * Tool: contact_search
 *
 * Search contacts by name, company, notes, or other text fields.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerContactSearch(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'contact_search',
    'Search contacts by name, company, or notes.',
    {
      query: z.string().min(1).max(200).describe('Search query'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
    },
    withGracefulDegradation('contacts', adapter, async (params) => {
      try {
        const results = await adapter.textSearch<Record<string, unknown>>(
          'contacts',
          params.query,
          {
            fields: ['name', 'company', 'notes', 'role'],
            limit: params.limit ?? 10,
          }
        );

        return makeToolResponse({
          results,
          total: results.length,
          query: params.query,
        });
      } catch (error) {
        return handleAdapterError(error, 'contact_search');
      }
    })
  );
}
