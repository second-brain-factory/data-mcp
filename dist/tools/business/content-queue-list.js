/**
 * Tool: content_queue_list
 *
 * List upcoming content from the content calendar.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerContentQueueList(server, adapter) {
    server.tool('content_queue_list', 'List content from the content calendar. Filter by platform or status.', {
        platform: z.enum(['linkedin', 'newsletter', 'blog', 'twitter', 'other']).optional().describe('Filter by platform'),
        status: z.enum(['idea', 'drafting', 'ready', 'published']).optional().describe('Filter by status'),
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    }, { readOnlyHint: true }, withGracefulDegradation('content_calendar', adapter, async (params) => {
        try {
            const clauses = [];
            if (params.platform) {
                clauses.push({ field: 'platform', op: 'eq', value: params.platform });
            }
            if (params.status) {
                clauses.push({ field: 'status', op: 'eq', value: params.status });
            }
            const filter = clauses.length > 0 ? [clauses] : undefined;
            const result = await adapter.list('content_calendar', {
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
            return handleAdapterError(error, 'content_queue_list');
        }
    }));
}
//# sourceMappingURL=content-queue-list.js.map