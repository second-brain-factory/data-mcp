/**
 * Tool: knowledge_delete
 *
 * Delete a knowledge item or decision by ID.
 * Supports both knowledge and decisions tables via a `table` parameter.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerKnowledgeDelete(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'knowledge_delete',
    'Delete a knowledge item or decision by ID. Requires confirm: true to prevent accidental deletion.',
    {
      id: z.string().min(1).describe('ID of the item to delete'),
      table: z.enum(['knowledge', 'decisions']).optional().describe('Which table to delete from (default: knowledge)'),
      confirm: z.boolean().describe('Must be true to confirm deletion'),
    },
    withGracefulDegradation('knowledge', adapter, async (params) => {
      try {
        if (!params.confirm) {
          return makeErrorResponse('Deletion not confirmed. Set confirm: true to delete.');
        }

        const table = params.table ?? 'knowledge';
        await adapter.delete(table, params.id);

        return makeToolResponse({
          deleted: true,
          id: params.id,
          table,
          message: `Deleted item ${params.id} from ${table}.`,
        });
      } catch (error) {
        return handleAdapterError(error, 'knowledge_delete');
      }
    })
  );
}
