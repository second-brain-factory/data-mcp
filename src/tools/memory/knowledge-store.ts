/**
 * Tool: knowledge_store
 *
 * Stores a knowledge item with dedup by (type, title).
 * Auto-generates summary from content.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter, FilterClause } from '../../adapter/types.js';
import { makeToolResponse, handleAdapterError, withGracefulDegradation, generateSummary } from '../shared.js';
export function registerKnowledgeStore(server: McpServer, adapter: DataAdapter): void {
    server.registerTool('knowledge_store', {
        description: 'Store a knowledge item in your persistent memory. Supports facts, patterns, insights, lessons, and references. Deduplicates by type + title.',
        inputSchema: {
            type: z.enum(['fact', 'pattern', 'insight', 'lesson', 'reference']).describe('Type of knowledge'),
            title: z.string().min(1).max(500).describe('Title of the knowledge item'),
            content: z.string().min(1).max(10000).describe('Content of the knowledge item'),
            tags: z.array(z.string().max(100)).max(20).optional().describe('Tags for categorization'),
            source: z.string().max(500).optional().describe('Source of the knowledge (URL, book, conversation, etc.)'),
            owner_scope: z.enum(['private', 'shared']).optional().describe('Store privately for this user or in shared team memory'),
        },
        // Hot-path tool: keep loaded under client-side tool search.
        _meta: { 'anthropic/alwaysLoad': true },
    }, withGracefulDegradation('knowledge', adapter, async (params) => {
        try {
            // Dedup: check for existing item with same type + title
            const dedupFilter: FilterClause[] = [
                { field: 'type', op: 'eq', value: params.type },
                { field: 'title', op: 'eq', value: params.title.trim() },
            ];
            if (adapter.ownerScopeEnabled) {
                dedupFilter.push({ field: 'owner_scope', op: 'eq', value: params.owner_scope ?? 'private' });
            }
            const existing = await adapter.list('knowledge', {
                filter: [dedupFilter],
                page: { limit: 1, offset: 0 },
            });
            if (existing.items.length > 0) {
                const item = existing.items[0];
                return makeToolResponse({
                    stored: true,
                    deduplicated: true,
                    item: { id: item.id, type: item.type, title: item.title, created_at: item.created_at },
                    message: `Already exists: "${item.title}" (id: ${item.id}). Use knowledge_update to modify.`,
                });
            }
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
                message: `Stored ${params.type}: "${params.title}"`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'knowledge_store');
        }
    }));
}
