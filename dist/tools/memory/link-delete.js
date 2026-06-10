/**
 * Tool: link_delete
 *
 * Deletes a knowledge link by ID.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerLinkDelete(server, adapter) {
    server.tool('link_delete', 'Delete a knowledge link by its ID.', {
        link_id: z.string().min(1).max(50).describe('ID of the link to delete'),
    }, withGracefulDegradation('knowledge_links', adapter, async (params) => {
        try {
            try {
                await adapter.getOne('knowledge_links', params.link_id);
            }
            catch {
                return makeToolResponse({ deleted: false, message: `Link not found: ${params.link_id}` });
            }
            await adapter.delete('knowledge_links', params.link_id);
            return makeToolResponse({ deleted: true, link_id: params.link_id, message: `Link deleted: ${params.link_id}` });
        }
        catch (error) {
            return handleAdapterError(error, 'link_delete');
        }
    }));
}
//# sourceMappingURL=link-delete.js.map
