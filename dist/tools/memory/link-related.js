/**
 * Tool: link_related
 *
 * Get all links for an entity — traverse the knowledge graph.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
const ENTITY_TYPES = ['knowledge', 'decision', 'session', 'blog_post', 'prospect', 'agent_learning'];
export function registerLinkRelated(server, adapter) {
    server.tool('link_related', 'Get all links for an entity. Shows outgoing and incoming relationships with resolved titles.', {
        entity_type: z.enum(ENTITY_TYPES).describe('Type of the entity'),
        entity_id: z.string().uuid().describe('UUID of the entity'),
        direction: z.enum(['both', 'outgoing', 'incoming']).optional().default('both').describe('Filter direction'),
        relation_type: z.enum(['supports', 'contradicts', 'derived_from', 'example_of', 'supersedes', 'part_of', 'prerequisite'])
            .optional().describe('Filter by relation type'),
    }, withGracefulDegradation('knowledge_links', adapter, async (params) => {
        try {
            const outgoing = [];
            const incoming = [];
            if (params.direction === 'both' || params.direction === 'outgoing') {
                const filter = [
                    { field: 'source_type', op: 'eq', value: params.entity_type },
                    { field: 'source_id', op: 'eq', value: params.entity_id },
                ];
                if (params.relation_type) {
                    filter.push({ field: 'relation_type', op: 'eq', value: params.relation_type });
                }
                const result = await adapter.list('knowledge_links', {
                    filter: [filter],
                    sort: [{ field: 'created_at', direction: 'desc' }],
                    page: { limit: 50, offset: 0 },
                });
                for (const link of result.items) {
                    let targetTitle = null;
                    try {
                        const col = link.target_type === 'decision' ? 'decisions' : link.target_type;
                        targetTitle = (await adapter.getOne(col, link.target_id)).title ?? null;
                    }
                    catch { /* skip */ }
                    outgoing.push({
                        link_id: link.id, direction: 'outgoing',
                        linked_type: link.target_type, linked_id: link.target_id,
                        linked_title: targetTitle, relation_type: link.relation_type,
                        confidence: link.confidence, notes: link.notes,
                    });
                }
            }
            if (params.direction === 'both' || params.direction === 'incoming') {
                const filter = [
                    { field: 'target_type', op: 'eq', value: params.entity_type },
                    { field: 'target_id', op: 'eq', value: params.entity_id },
                ];
                if (params.relation_type) {
                    filter.push({ field: 'relation_type', op: 'eq', value: params.relation_type });
                }
                const result = await adapter.list('knowledge_links', {
                    filter: [filter],
                    sort: [{ field: 'created_at', direction: 'desc' }],
                    page: { limit: 50, offset: 0 },
                });
                for (const link of result.items) {
                    let sourceTitle = null;
                    try {
                        const col = link.source_type === 'decision' ? 'decisions' : link.source_type;
                        sourceTitle = (await adapter.getOne(col, link.source_id)).title ?? null;
                    }
                    catch { /* skip */ }
                    incoming.push({
                        link_id: link.id, direction: 'incoming',
                        linked_type: link.source_type, linked_id: link.source_id,
                        linked_title: sourceTitle, relation_type: link.relation_type,
                        confidence: link.confidence, notes: link.notes,
                    });
                }
            }
            const allLinks = [...outgoing, ...incoming];
            return makeToolResponse({
                entity_type: params.entity_type, entity_id: params.entity_id,
                total_links: allLinks.length, outgoing_count: outgoing.length, incoming_count: incoming.length,
                links: allLinks,
                message: allLinks.length === 0
                    ? `No links found. Use link_suggest to find potential connections.`
                    : `Found ${allLinks.length} links (${outgoing.length} outgoing, ${incoming.length} incoming).`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'link_related');
        }
    }));
}
//# sourceMappingURL=link-related.js.map
