/**
 * Tool: knowledge_update
 *
 * Update an existing knowledge item by ID.
 * Regenerates summary if content changes.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import type { KnowledgeRecord } from '../../types/records.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation, generateSummary } from '../shared.js';

export function registerKnowledgeUpdate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'knowledge_update',
    'Update an existing knowledge item. Regenerates summary if content changes.',
    {
      id: z.string().min(1).describe('ID of the knowledge item to update'),
      title: z.string().min(1).max(500).optional().describe('New title'),
      content: z.string().min(1).max(10000).optional().describe('New content'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('New tags'),
      source: z.string().max(500).optional().describe('New source'),
      confidence: z.number().min(0).max(1).optional().describe('New confidence score (0.0-1.0)'),
    },
    withGracefulDegradation('knowledge', adapter, async (params) => {
      try {
        const updates: Record<string, unknown> = {};

        if (params.title !== undefined) updates.title = params.title.trim();
        if (params.content !== undefined) {
          updates.content = params.content;
          updates.summary = generateSummary(params.content);
        }
        if (params.tags !== undefined) updates.tags = params.tags;
        if (params.source !== undefined) updates.source = params.source;
        if (params.confidence !== undefined) updates.confidence = params.confidence;

        if (Object.keys(updates).length === 0) {
          return makeToolResponse({
            updated: false,
            message: 'No fields to update. Provide at least one field to change.',
          });
        }

        const record = await adapter.update<KnowledgeRecord>('knowledge', params.id, updates);

        return makeToolResponse({
          updated: true,
          item: { id: record.id, type: record.type, title: record.title, updated_at: record.updated_at },
          message: `Updated knowledge item: "${record.title}"`,
        });
      } catch (error) {
        return handleAdapterError(error, 'knowledge_update');
      }
    })
  );
}
