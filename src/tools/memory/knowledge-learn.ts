/**
 * Tool: knowledge_learn
 *
 * Store a learning — restricted to pattern, insight, or lesson types.
 * Auto-generates summary.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import type { KnowledgeRecord } from '../../types/records.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation, generateSummary } from '../shared.js';

export function registerKnowledgeLearn(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'knowledge_learn',
    'Store a learning from experience. Restricted to pattern, insight, or lesson types. Use this after completing work to capture what you learned.',
    {
      type: z.enum(['pattern', 'insight', 'lesson']).describe('Type of learning'),
      title: z.string().min(1).max(500).describe('Title of the learning'),
      content: z.string().min(1).max(10000).describe('Detailed description of the learning'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('Tags for categorization'),
      source: z.string().max(500).optional().describe('Context where this was learned'),
    },
    withGracefulDegradation('knowledge', adapter, async (params) => {
      try {
        const record = await adapter.create<KnowledgeRecord>('knowledge', {
          type: params.type,
          title: params.title.trim(),
          content: params.content,
          summary: generateSummary(params.content),
          tags: params.tags ?? [],
          source: params.source ?? null,
          confidence: 0.8,
          last_validated_at: new Date().toISOString(),
        });

        return makeToolResponse({
          stored: true,
          item: { id: record.id, type: record.type, title: record.title, created_at: record.created_at },
          message: `Learned ${params.type}: "${params.title}"`,
        });
      } catch (error) {
        return handleAdapterError(error, 'knowledge_learn');
      }
    })
  );
}
