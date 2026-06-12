/**
 * Tool: record_update
 *
 * Generic partial update across registry collections (issue #13).
 * Replaces: knowledge_update, goal_update, task_update, contact_update,
 * prospect_update, blog_update (and content_calendar updates).
 *
 * Computed-field behavior preserved via registry buildUpdate hooks:
 * knowledge content change regenerates summary; blog status change
 * stamps/clears published_at.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse, handleAdapterError } from '../shared.js';
import { RECORD_COLLECTIONS, UPDATABLE, describeSchema } from './registry.js';

const COLLECTION_LIST = UPDATABLE.map((c) => `${c} (${RECORD_COLLECTIONS[c].summary})`).join('; ');

export function registerRecordUpdate(server: McpServer, adapter: DataAdapter): void {
    server.registerTool('record_update', {
        description: `Update a record by id in a Second Brain collection: ${COLLECTION_LIST}. Partial update — only pass fields to change; invalid fields return the expected schema. For handoff lifecycle use handoff_update.`,
        inputSchema: {
            collection: z.enum(UPDATABLE).describe('Target collection'),
            id: z.string().min(1).describe('Record ID'),
            data: z.record(z.unknown()).describe('Fields to update (validated against the collection schema)'),
        },
    }, async (params) => {
        const spec = RECORD_COLLECTIONS[params.collection];
        if (!spec?.updateSchema) {
            return makeErrorResponse(`Collection '${params.collection}' does not support record_update.`);
        }
        const parsed = spec.updateSchema.safeParse(params.data);
        if (!parsed.success) {
            return makeToolResponse({
                updated: false,
                error: 'Invalid data for collection.',
                issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
                expected_fields: describeSchema(spec.updateSchema),
            });
        }
        const validated = parsed.data as Record<string, unknown>;
        const updates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(validated)) {
            if (value !== undefined)
                updates[key] = value;
        }
        if (Object.keys(updates).length === 0) {
            return makeToolResponse({ updated: false, message: 'No fields to update. Provide at least one field in data.' });
        }
        try {
            if (!(await adapter.collectionExists(spec.collection))) {
                return makeErrorResponse(`The '${spec.collection}' table does not exist yet. Run setup_migrate to create the database schema.`);
            }
            const record = await adapter.update(spec.collection, params.id, spec.buildUpdate ? spec.buildUpdate(updates) : updates);
            return makeToolResponse({
                updated: true,
                collection: params.collection,
                item: { id: record.id, updated_at: record.updated_at },
                message: `Updated ${params.collection} record ${params.id}`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'record_update');
        }
    });
}
