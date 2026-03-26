/**
 * Tool: task_list
 *
 * List tasks with optional status and priority filters.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerTaskList(server, adapter) {
    server.tool('task_list', 'List tasks with optional status and priority filters.', {
        status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional().describe('Filter by status'),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('Filter by priority'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    }, { readOnlyHint: true }, withGracefulDegradation('tasks', adapter, async (params) => {
        try {
            const clauses = [];
            if (params.status) {
                clauses.push({ field: 'status', op: 'eq', value: params.status });
            }
            if (params.priority) {
                clauses.push({ field: 'priority', op: 'eq', value: params.priority });
            }
            const filter = clauses.length > 0 ? [clauses] : undefined;
            const result = await adapter.list('tasks', {
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
        }
        catch (error) {
            return handleAdapterError(error, 'task_list');
        }
    }));
}
//# sourceMappingURL=task-list.js.map