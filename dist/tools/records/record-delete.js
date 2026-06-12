/**
 * Tool: record_delete
 *
 * Generic confirmed delete across registry collections (issue #13).
 * Replaces: knowledge_delete (knowledge + decisions), blog_delete,
 * link_delete.
 *
 * Always requires confirm: true (the strictest policy of the folded tools —
 * link_delete previously had no confirm gate, deletes only got safer).
 */
import { z } from 'zod';
import { makeToolResponse, makeErrorResponse, handleAdapterError } from '../shared.js';
import { RECORD_COLLECTIONS, DELETABLE } from './registry.js';
export function registerRecordDelete(server, adapter) {
    server.registerTool('record_delete', {
        description: `Delete a record by id. Collections: ${DELETABLE.join(', ')}. Requires confirm: true.`,
        inputSchema: {
            collection: z.enum(DELETABLE).describe('Target collection'),
            id: z.string().min(1).describe('Record ID to delete'),
            confirm: z.boolean().describe('Must be true to delete'),
        },
        annotations: { destructiveHint: true },
    }, async (params) => {
        if (params.confirm !== true) {
            return makeErrorResponse('Deletion not confirmed. Set confirm: true to delete.');
        }
        const spec = RECORD_COLLECTIONS[params.collection];
        if (!spec?.deletable) {
            return makeErrorResponse(`Collection '${params.collection}' does not support record_delete.`);
        }
        try {
            if (!(await adapter.collectionExists(spec.collection))) {
                return makeErrorResponse(`The '${spec.collection}' table does not exist yet. Run setup_migrate to create the database schema.`);
            }
            await adapter.delete(spec.collection, params.id);
            return makeToolResponse({
                deleted: true,
                collection: params.collection,
                id: params.id,
                message: `Deleted ${params.collection} record ${params.id}`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'record_delete');
        }
    });
}
//# sourceMappingURL=record-delete.js.map