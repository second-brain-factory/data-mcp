/**
 * Tool: knowledge_validate
 *
 * Batch update last_validated_at for knowledge items by IDs.
 * Resets the decay clock — marks items as still relevant.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerKnowledgeValidate(server, adapter) {
    server.tool('knowledge_validate', 'Mark knowledge items as still relevant. Resets the decay clock. Pass an array of IDs to validate in batch.', {
        ids: z.array(z.string().min(1)).min(1).max(50).describe('IDs of knowledge items to validate'),
    }, withGracefulDegradation('knowledge', adapter, async (params) => {
        try {
            const now = new Date().toISOString();
            const validated = [];
            const notFound = [];
            // Parallelize updates for performance (up to 50 concurrent)
            const results = await Promise.allSettled(params.ids.map((id) => adapter.update('knowledge', id, { last_validated_at: now })));
            for (let i = 0; i < results.length; i++) {
                if (results[i].status === 'fulfilled') {
                    validated.push(params.ids[i]);
                }
                else {
                    notFound.push(params.ids[i]);
                }
            }
            return makeToolResponse({
                validated: validated.length,
                not_found: notFound.length,
                validated_ids: validated,
                not_found_ids: notFound.length > 0 ? notFound : undefined,
                message: `Validated ${validated.length} of ${params.ids.length} items.`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'knowledge_validate');
        }
    }));
}
//# sourceMappingURL=knowledge-validate.js.map