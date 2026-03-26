/**
 * Tool: contact_search
 *
 * Search contacts by name, company, notes, or other text fields.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerContactSearch(server, adapter) {
    server.tool('contact_search', 'Search contacts by name, company, or notes.', {
        query: z.string().min(1).max(200).describe('Search query'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
    }, { readOnlyHint: true }, withGracefulDegradation('contacts', adapter, async (params) => {
        try {
            const results = await adapter.textSearch('contacts', params.query, {
                fields: ['name', 'company', 'notes', 'role'],
                limit: params.limit ?? 10,
            });
            return makeToolResponse({
                results,
                total: results.length,
                query: params.query,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'contact_search');
        }
    }));
}
//# sourceMappingURL=contact-search.js.map