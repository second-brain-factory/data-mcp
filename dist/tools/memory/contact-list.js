/**
 * Tool: contact_list
 *
 * List contacts with pagination.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerContactList(server, adapter) {
    server.tool('contact_list', 'List contacts with pagination. Most recently created first.', {
        limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
        offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
    }, { readOnlyHint: true }, withGracefulDegradation('contacts', adapter, async (params) => {
        try {
            const result = await adapter.list('contacts', {
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
            return handleAdapterError(error, 'contact_list');
        }
    }));
}
//# sourceMappingURL=contact-list.js.map