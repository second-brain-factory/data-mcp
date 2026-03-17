/**
 * Tool: task_update
 *
 * Update a task's status, priority, or other fields.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';

export function registerTaskUpdate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'task_update',
    'Update a task. Change status, priority, description, or due date.',
    {
      id: z.string().min(1).describe('ID of the task to update'),
      title: z.string().min(1).max(500).optional().describe('New title'),
      description: z.string().max(5000).optional().describe('New description'),
      status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional().describe('New status'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().describe('New priority'),
      due_date: z.string().max(50).optional().describe('New due date (ISO format)'),
      tags: z.array(z.string().max(100)).max(20).optional().describe('New tags'),
    },
    withGracefulDegradation('tasks', adapter, async (params) => {
      try {
        const updates: Record<string, unknown> = {};
        if (params.title !== undefined) updates.title = params.title.trim();
        if (params.description !== undefined) updates.description = params.description;
        if (params.status !== undefined) updates.status = params.status;
        if (params.priority !== undefined) updates.priority = params.priority;
        if (params.due_date !== undefined) updates.due_date = params.due_date;
        if (params.tags !== undefined) updates.tags = params.tags;

        if (Object.keys(updates).length === 0) {
          return makeToolResponse({
            updated: false,
            message: 'No fields to update. Provide at least one field to change.',
          });
        }

        const record = await adapter.update<Record<string, unknown>>('tasks', params.id, updates);

        return makeToolResponse({
          updated: true,
          item: { id: record.id, title: record.title, status: record.status, priority: record.priority, updated_at: record.updated_at },
          message: `Task updated: "${record.title}"`,
        });
      } catch (error) {
        return handleAdapterError(error, 'task_update');
      }
    })
  );
}
