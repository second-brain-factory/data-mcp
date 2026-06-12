/**
 * Tool: handoff_list
 *
 * List handoff packets. The "what's waiting for me?" query:
 * handoff_list({ to_member: 'me', status: 'open' }).
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter, FilterClause } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerHandoffList(server: McpServer, adapter: DataAdapter): void {
    server.tool('handoff_list', 'List handoff packets with optional filters. Use to_member "me" with status "open" to see work waiting for you. Packets flag what needs re-verification and a recheck_by staleness date — treat overdue packets as suspect context.', {
        to_member: z.string().max(100).optional().describe('Filter by recipient member id. "me" resolves to your own id in team mode.'),
        status: z.enum(['open', 'accepted', 'completed', 'cancelled']).optional().describe('Filter by status'),
        task_id: z.string().max(100).optional().describe('Filter by related task ID'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    }, { readOnlyHint: true }, withGracefulDegradation('handoffs', adapter, async (params) => {
        try {
            const clauses: FilterClause[] = [];
            if (params.to_member) {
                let member = params.to_member;
                if (member === 'me') {
                    if (!adapter.currentOwnerId) {
                        return makeErrorResponse('to_member "me" requires team mode (MEMORYOS_OWNER_ID). Pass an explicit member id, or omit to_member to list all handoffs.');
                    }
                    member = adapter.currentOwnerId;
                }
                clauses.push({ field: 'to_member', op: 'eq', value: member });
            }
            if (params.status) {
                clauses.push({ field: 'status', op: 'eq', value: params.status });
            }
            if (params.task_id) {
                clauses.push({ field: 'task_id', op: 'eq', value: params.task_id });
            }
            const filter = clauses.length > 0 ? [clauses] : undefined;
            const result = await adapter.list('handoffs', {
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
            return handleAdapterError(error, 'handoff_list');
        }
    }));
}
