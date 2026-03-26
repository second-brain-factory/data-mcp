/**
 * Tool: link_create
 *
 * Creates a typed relationship between two MemoryOS entities.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
const ENTITY_TYPES = ['knowledge', 'decision', 'session', 'blog_post', 'prospect', 'agent_learning'];
const RELATION_TYPES = ['supports', 'contradicts', 'derived_from', 'example_of', 'supersedes', 'part_of', 'prerequisite'];
export function registerLinkCreate(server, adapter) {
    server.tool('link_create', 'Create a typed relationship between two MemoryOS entities. ' +
        'Links express how knowledge items relate: supports, contradicts, derived_from, etc. ' +
        'Deduplicates by (source, target, relation_type).', {
        source_type: z.enum(ENTITY_TYPES).describe('Type of the source entity'),
        source_id: z.string().uuid().describe('UUID of the source entity'),
        target_type: z.enum(ENTITY_TYPES).describe('Type of the target entity'),
        target_id: z.string().uuid().describe('UUID of the target entity'),
        relation_type: z.enum(RELATION_TYPES).describe('Type of relationship'),
        confidence: z.number().min(0).max(1).optional().default(0.8).describe('Confidence in this relationship (0-1)'),
        notes: z.string().max(500).optional().describe('Optional context for why this link exists'),
    }, withGracefulDegradation('knowledge_links', adapter, async (params) => {
        try {
            if (params.source_type === params.target_type && params.source_id === params.target_id) {
                return makeToolResponse({
                    created: false,
                    message: 'Cannot create a self-link.',
                });
            }
            const existing = await adapter.list('knowledge_links', {
                filter: [[
                        { field: 'source_type', op: 'eq', value: params.source_type },
                        { field: 'source_id', op: 'eq', value: params.source_id },
                        { field: 'target_type', op: 'eq', value: params.target_type },
                        { field: 'target_id', op: 'eq', value: params.target_id },
                        { field: 'relation_type', op: 'eq', value: params.relation_type },
                    ]],
                page: { limit: 1, offset: 0 },
            });
            if (existing.items.length > 0) {
                return makeToolResponse({
                    created: false,
                    existing_link_id: existing.items[0].id,
                    message: `Link already exists (id: ${existing.items[0].id}).`,
                });
            }
            const record = await adapter.create('knowledge_links', {
                source_type: params.source_type,
                source_id: params.source_id,
                target_type: params.target_type,
                target_id: params.target_id,
                relation_type: params.relation_type,
                confidence: params.confidence ?? 0.8,
                notes: params.notes ?? null,
                auto_suggested: false,
            });
            return makeToolResponse({
                created: true,
                link: { id: record.id, source_type: params.source_type, target_type: params.target_type, relation_type: params.relation_type },
                message: `Link created: ${params.source_type}:${params.source_id.slice(0, 8)} --[${params.relation_type}]--> ${params.target_type}:${params.target_id.slice(0, 8)}`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'link_create');
        }
    }));
}
//# sourceMappingURL=link-create.js.map
