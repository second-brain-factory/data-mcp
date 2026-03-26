/**
 * Tool: prospect_list
 *
 * List prospects with optional stage filter.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerProspectList(server, adapter) {
    server.tool('prospect_list', 'List prospects with optional stage filter. Most recent first.', {
        stage: z.enum(['new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing']).optional().describe('Filter by pipeline stage'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    }, { readOnlyHint: true }, withGracefulDegradation('prospects', adapter, async (params) => {
        try {
            const clauses = [];
            if (params.stage) {
                clauses.push({ field: 'stage', op: 'eq', value: params.stage });
            }
            const filter = clauses.length > 0 ? [clauses] : undefined;
            const result = await adapter.list('prospects', {
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
            return handleAdapterError(error, 'prospect_list');
        }
    }));
}
//# sourceMappingURL=prospect-list.js.map