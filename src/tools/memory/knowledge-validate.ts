/**
 * Tool: knowledge_validate
 *
 * Batch update last_validated_at for knowledge items by IDs.
 * Resets the decay clock — marks items as still relevant.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerKnowledgeValidate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'knowledge_validate',
    'Mark knowledge items as still relevant. Resets the decay clock. Pass an array of IDs to validate in batch.',
    {
      ids: z.array(z.string().min(1)).min(1).max(50).describe('IDs of knowledge items to validate'),
    },
    withGracefulDegradation('knowledge', adapter, async (params) => {
      try {
        const now = new Date().toISOString();
        const validated: string[] = [];
        const notFound: string[] = [];

        for (const id of params.ids) {
          try {
            await adapter.update('knowledge', id, { last_validated_at: now });
            validated.push(id);
          } catch {
            notFound.push(id);
          }
        }

        return makeToolResponse({
          validated: validated.length,
          not_found: notFound.length,
          validated_ids: validated,
          not_found_ids: notFound.length > 0 ? notFound : undefined,
          message: `Validated ${validated.length} of ${params.ids.length} items.`,
        });
      } catch (error) {
        return handleAdapterError(error, 'knowledge_validate');
      }
    })
  );
}
