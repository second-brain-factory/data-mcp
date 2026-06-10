/**
 * Tool: knowledge_decide
 *
 * Record a decision with context, options considered, and rationale.
 * No dedup — every decision is unique.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerKnowledgeDecide(server, adapter) {
    server.tool('knowledge_decide', 'Record a decision with context, options considered, chosen option, and rationale. Every decision is stored (no dedup).', {
        title: z.string().min(1).max(500).describe('Decision title'),
        context: z.string().max(5000).optional().describe('Context and background for the decision'),
        options_considered: z.array(z.string().max(500)).min(1).describe('Options that were considered'),
        chosen_option: z.string().min(1).max(500).describe('The option that was chosen'),
        rationale: z.string().max(5000).optional().describe('Why this option was chosen'),
        tags: z.array(z.string().max(100)).max(20).optional().describe('Tags for categorization'),
        owner_scope: z.enum(['private', 'shared']).optional().describe('Store privately for this user or in shared team memory'),
    }, withGracefulDegradation('decisions', adapter, async (params) => {
        try {
            const record = await adapter.create('decisions', {
                title: params.title.trim(),
                context: params.context ?? null,
                options_considered: params.options_considered,
                chosen_option: params.chosen_option,
                rationale: params.rationale ?? null,
                outcome: null,
                tags: params.tags ?? [],
                ...(adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope } : {}),
            });
            return makeToolResponse({
                stored: true,
                item: { id: record.id, title: record.title, chosen_option: record.chosen_option, created_at: record.created_at },
                message: `Decision recorded: "${params.title}" → ${params.chosen_option}`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'knowledge_decide');
        }
    }));
}
//# sourceMappingURL=knowledge-decide.js.map
