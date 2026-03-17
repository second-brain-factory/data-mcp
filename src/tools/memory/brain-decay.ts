/**
 * Tool: brain_decay
 *
 * List knowledge items where decay exceeds a threshold.
 * Decay formula: 1.0 - (days_since_validated / 180), clamped to [0, 1].
 * Computed on-read — not stored in DB.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

const DECAY_PERIOD_DAYS = 180;

function computeDecayScore(lastValidatedAt: string | null): number {
  if (!lastValidatedAt) return 0;
  const validated = new Date(lastValidatedAt);
  const now = new Date();
  const daysSinceValidated = (now.getTime() - validated.getTime()) / (1000 * 60 * 60 * 24);
  const score = 1.0 - (daysSinceValidated / DECAY_PERIOD_DAYS);
  return Math.max(0, Math.min(1, score));
}

export function registerBrainDecay(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'brain_decay',
    'List knowledge items that are decaying (freshness score below threshold). Decay is computed as 1.0 - (days_since_validated / 180). Use knowledge_validate to refresh items.',
    {
      threshold: z.number().min(0).max(1).optional().describe('Decay threshold (default 0.5). Items BELOW this score are returned.'),
      limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    withGracefulDegradation('knowledge', adapter, async (params) => {
      try {
        const threshold = params.threshold ?? 0.5;

        // Compute the date threshold: items validated before this date have decay < threshold
        // threshold = 1.0 - (days / 180)
        // days = (1.0 - threshold) * 180
        const daysThreshold = (1.0 - threshold) * DECAY_PERIOD_DAYS;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - Math.floor(daysThreshold));

        const result = await adapter.list<Record<string, unknown>>('knowledge', {
          filter: [[
            { field: 'last_validated_at', op: 'lt', value: cutoffDate.toISOString() },
          ]],
          sort: [{ field: 'last_validated_at', direction: 'asc' }],
          page: { limit: params.limit ?? 20, offset: 0 },
        });

        const items = result.items.map((item) => ({
          ...item,
          decay_score: computeDecayScore(item.last_validated_at as string | null),
        }));

        return makeToolResponse({
          items,
          total: result.totalItems,
          threshold,
          message: items.length > 0
            ? `Found ${result.totalItems} items with decay below ${threshold}. Use knowledge_validate to refresh them.`
            : 'No stale items found. Your knowledge base is fresh!',
        });
      } catch (error) {
        return handleAdapterError(error, 'brain_decay');
      }
    })
  );
}
