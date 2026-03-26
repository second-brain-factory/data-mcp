/**
 * Tool: session_list
 *
 * List logged sessions with pagination.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerSessionList(server, adapter) {
    server.tool('session_list', 'List logged work sessions. Most recent sessions first.', {
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    }, { readOnlyHint: true }, withGracefulDegradation('sessions', adapter, async (params) => {
        try {
            const result = await adapter.list('sessions', {
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
            return handleAdapterError(error, 'session_list');
        }
    }));
}
//# sourceMappingURL=session-list.js.map