/**
 * Tool: knowledge_learn
 *
 * Store a learning — restricted to pattern, insight, or lesson types.
 * Auto-generates summary.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation, generateSummary } from '../shared.js';
export function registerKnowledgeLearn(server, adapter) {
    server.registerTool('knowledge_learn', {
        description: 'Store a learning from experience. Restricted to pattern, insight, or lesson types. Use this after completing work to capture what you learned.',
        inputSchema: {
            type: z.enum(['pattern', 'insight', 'lesson']).describe('Type of learning'),
            title: z.string().min(1).max(500).describe('Title of the learning'),
            content: z.string().min(1).max(10000).describe('Detailed description of the learning'),
            tags: z.array(z.string().max(100)).max(20).optional().describe('Tags for categorization'),
            source: z.string().max(500).optional().describe('Context where this was learned'),
            owner_scope: z.enum(['private', 'shared']).optional().describe('Store privately for this user or in shared team memory'),
        },
        // Hot-path tool: keep loaded under client-side tool search.
        _meta: { 'anthropic/alwaysLoad': true },
    }, withGracefulDegradation('knowledge', adapter, async (params) => {
        try {
            const record = await adapter.create('knowledge', {
                type: params.type,
                title: params.title.trim(),
                content: params.content,
                summary: generateSummary(params.content),
                tags: params.tags ?? [],
                source: params.source ?? null,
                ...(adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope } : {}),
                confidence: 0.8,
                last_validated_at: new Date().toISOString(),
            });
            return makeToolResponse({
                stored: true,
                item: { id: record.id, type: record.type, title: record.title, created_at: record.created_at },
                message: `Learned ${params.type}: "${params.title}"`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'knowledge_learn');
        }
    }));
}
//# sourceMappingURL=knowledge-learn.js.map