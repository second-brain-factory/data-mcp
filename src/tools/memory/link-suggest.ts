/**
 * Tool: link_suggest
 *
 * Find similar items and suggest links using keyword matching.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
interface KnowledgeItem {
    [key: string]: unknown;
    id: string;
    type: string;
    title: string;
    content?: string | null;
    summary?: string | null;
}
export function registerLinkSuggest(server: McpServer, adapter: DataAdapter): void {
    server.tool('link_suggest', 'Find knowledge items similar to a given item and suggest links. ' +
        'Uses text search to find related items. Returns matches with suggested relation types.', {
        item_id: z.string().uuid().describe('UUID of the knowledge item to find suggestions for'),
        limit: z.number().min(1).max(20).optional().default(5).describe('Max suggestions'),
    }, withGracefulDegradation('knowledge', adapter, async (params) => {
        try {
            let sourceItem: KnowledgeItem;
            try {
                sourceItem = await adapter.getOne<KnowledgeItem>('knowledge', params.item_id);
            }
            catch {
                return makeToolResponse({ suggestions: [], message: `Item not found: ${params.item_id}` });
            }
            // Get already-linked IDs to exclude
            const linkedIds = new Set<unknown>();
            try {
                const out = await adapter.list('knowledge_links', {
                    filter: [[{ field: 'source_type', op: 'eq', value: 'knowledge' }, { field: 'source_id', op: 'eq', value: params.item_id }]],
                    page: { limit: 100, offset: 0 },
                });
                const inc = await adapter.list('knowledge_links', {
                    filter: [[{ field: 'target_type', op: 'eq', value: 'knowledge' }, { field: 'target_id', op: 'eq', value: params.item_id }]],
                    page: { limit: 100, offset: 0 },
                });
                for (const l of out.items) linkedIds.add(l.target_id);
                for (const l of inc.items) linkedIds.add(l.source_id);
            }
            catch { /* knowledge_links may not exist */ }
            const searchTerms = extractKeyTerms(sourceItem.title, sourceItem.content);
            let suggestions: Record<string, unknown>[] = [];
            if (searchTerms) {
                const results = await adapter.textSearch<KnowledgeItem>('knowledge', searchTerms, {
                    limit: (params.limit ?? 5) + linkedIds.size + 1,
                });
                suggestions = results
                    .filter(item => item.id !== params.item_id && !linkedIds.has(item.id))
                    .slice(0, params.limit ?? 5)
                    .map(item => ({
                    id: item.id, type: item.type, title: item.title,
                    summary: item.summary ?? (item.content?.slice(0, 100) + '...'),
                    suggested_relation: suggestRelationType(sourceItem, item),
                }));
            }
            return makeToolResponse({
                source: { id: sourceItem.id, type: sourceItem.type, title: sourceItem.title },
                suggestions, already_linked: linkedIds.size,
                message: suggestions.length === 0
                    ? `No unlinked similar items found for "${sourceItem.title}".`
                    : `Found ${suggestions.length} suggestions. Use link_create to connect them.`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'link_suggest');
        }
    }));
}
function extractKeyTerms(title: string, content: string | null | undefined): string {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
        'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
        'and', 'but', 'or', 'not', 'so', 'if', 'when', 'how', 'what', 'which', 'who',
        'this', 'that', 'these', 'those', 'it', 'its']);
    const text = `${title} ${(content ?? '').slice(0, 200)}`;
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
    return [...new Set(words)].slice(0, 5).join(' ');
}
function suggestRelationType(source: KnowledgeItem, target: KnowledgeItem): string {
    if (source.type === target.type) return 'supports';
    if ((source.type === 'lesson' && target.type === 'decision') || (source.type === 'decision' && target.type === 'lesson')) return 'derived_from';
    if (source.type === 'insight' && target.type === 'pattern') return 'derived_from';
    if (source.type === 'pattern' && target.type === 'insight') return 'example_of';
    return 'supports';
}
