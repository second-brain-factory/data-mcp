/**
 * Tool: goal_update
 *
 * Update a goal's status, key results, or other fields.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerGoalUpdate(server, adapter) {
    server.tool('goal_update', 'Update a goal. Change status, key results, description, or tags.', {
        id: z.string().min(1).describe('ID of the goal to update'),
        title: z.string().min(1).max(500).optional().describe('New title'),
        description: z.string().max(5000).optional().describe('New description'),
        status: z.enum(['active', 'completed', 'paused', 'abandoned']).optional().describe('New status'),
        key_results: z.array(z.object({
            description: z.string().max(500),
            target: z.number().optional(),
            current: z.number().optional(),
        })).optional().describe('Updated key results'),
        tags: z.array(z.string().max(100)).max(20).optional().describe('New tags'),
    }, withGracefulDegradation('goals', adapter, async (params) => {
        try {
            const updates = {};
            if (params.title !== undefined)
                updates.title = params.title.trim();
            if (params.description !== undefined)
                updates.description = params.description;
            if (params.status !== undefined)
                updates.status = params.status;
            if (params.key_results !== undefined)
                updates.key_results = params.key_results;
            if (params.tags !== undefined)
                updates.tags = params.tags;
            if (Object.keys(updates).length === 0) {
                return makeToolResponse({
                    updated: false,
                    message: 'No fields to update. Provide at least one field to change.',
                });
            }
            const record = await adapter.update('goals', params.id, updates);
            return makeToolResponse({
                updated: true,
                item: { id: record.id, title: record.title, status: record.status, updated_at: record.updated_at },
                message: `Goal updated: "${record.title}"`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'goal_update');
        }
    }));
}
//# sourceMappingURL=goal-update.js.map