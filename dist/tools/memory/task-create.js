/**
 * Tool: task_create
 *
 * Create a task. Status defaults to 'todo'.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerTaskCreate(server, adapter) {
    server.tool('task_create', 'Create a task with title, description, priority, and optional due date. Status defaults to todo.', {
        title: z.string().min(1).max(500).describe('Task title'),
        description: z.string().max(5000).optional().describe('Task description'),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('Priority level (default: medium)'),
        due_date: z.string().max(50).optional().describe('Due date (ISO format)'),
        tags: z.array(z.string().max(100)).max(20).optional().describe('Tags for categorization'),
        goal_id: z.string().min(1).optional().describe('Related goal ID'),
        owner_scope: z.enum(['private', 'shared']).optional().describe('Store privately for this user or in shared team memory'),
    }, withGracefulDegradation('tasks', adapter, async (params) => {
        try {
            const record = await adapter.create('tasks', {
                title: params.title.trim(),
                description: params.description ?? null,
                status: 'todo',
                priority: params.priority ?? 'medium',
                due_date: params.due_date ?? null,
                tags: params.tags ?? [],
                goal_id: params.goal_id ?? null,
                ...(adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope } : {}),
            });
            return makeToolResponse({
                created: true,
                item: { id: record.id, title: record.title, status: record.status, priority: record.priority, created_at: record.created_at },
                message: `Task created: "${params.title}"`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'task_create');
        }
    }));
}
//# sourceMappingURL=task-create.js.map