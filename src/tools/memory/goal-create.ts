/**
 * Tool: goal_create
 *
 * Create a goal with key results. Status defaults to 'active'.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerGoalCreate(server: McpServer, adapter: DataAdapter): void {
    server.tool('goal_create', 'Create a goal with optional key results. Status defaults to active.', {
        title: z.string().min(1).max(500).describe('Goal title'),
        description: z.string().max(5000).optional().describe('Goal description'),
        timeframe: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).describe('Timeframe for the goal'),
        key_results: z.array(z.object({
            description: z.string().max(500),
            target: z.union([z.number(), z.string()]).optional(),
            current: z.union([z.number(), z.string()]).optional(),
        })).optional().describe('Key results to track progress'),
        tags: z.array(z.string().max(100)).max(20).optional().describe('Tags for categorization'),
        owner_scope: z.enum(['private', 'shared']).optional().describe('Store privately for this user or in shared team memory'),
    }, withGracefulDegradation('goals', adapter, async (params) => {
        try {
            const record = await adapter.create('goals', {
                title: params.title.trim(),
                description: params.description ?? null,
                timeframe: params.timeframe,
                status: 'active',
                key_results: params.key_results ?? [],
                tags: params.tags ?? [],
                ...(adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope } : {}),
            });
            return makeToolResponse({
                created: true,
                item: { id: record.id, title: record.title, timeframe: record.timeframe, status: record.status, created_at: record.created_at },
                message: `Goal created: "${params.title}" (${params.timeframe})`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'goal_create');
        }
    }));
}
