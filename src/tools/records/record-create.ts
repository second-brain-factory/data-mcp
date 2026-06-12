/**
 * Tool: record_create
 *
 * Generic create across registry collections (issue #13 consolidation).
 * Replaces: goal_create, task_create, contact_create, prospect_create,
 * blog_create, content_queue_add, email_queue_add, knowledge_decide.
 *
 * The data payload is validated against the per-collection schema from the
 * registry; validation failures return the full field spec so the model can
 * self-correct without a typed top-level schema.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse, handleAdapterError } from '../shared.js';
import { RECORD_COLLECTIONS, CREATABLE, describeSchema } from './registry.js';

const COLLECTION_LIST = CREATABLE.map((c) => `${c} (${RECORD_COLLECTIONS[c].summary})`).join('; ');

export function registerRecordCreate(server: McpServer, adapter: DataAdapter): void {
    server.registerTool('record_create', {
        description: `Create a record in a Second Brain collection: ${COLLECTION_LIST}. Pass collection-specific fields in data; invalid fields return the expected schema. For knowledge items use knowledge_store; for sessions use session_log; for handoffs use handoff_create.`,
        inputSchema: {
            collection: z.enum(CREATABLE).describe('Target collection'),
            data: z.record(z.unknown()).describe('Record fields (validated against the collection schema)'),
            owner_scope: z.enum(['private', 'shared']).optional().describe('Team mode: store privately or in shared team memory (collections that support it)'),
        },
    }, async (params) => {
        const spec = RECORD_COLLECTIONS[params.collection];
        if (!spec?.createSchema || !spec.buildCreate) {
            return makeErrorResponse(`Collection '${params.collection}' does not support record_create.`);
        }
        const parsed = spec.createSchema.safeParse(params.data);
        if (!parsed.success) {
            return makeToolResponse({
                created: false,
                error: 'Invalid data for collection.',
                issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
                expected_fields: describeSchema(spec.createSchema),
            });
        }
        try {
            if (!(await adapter.collectionExists(spec.collection))) {
                return makeErrorResponse(`The '${spec.collection}' table does not exist yet. Run setup_migrate to create the database schema.`);
            }
            const record = await adapter.create(spec.collection, {
                ...spec.buildCreate(parsed.data as Record<string, unknown>),
                ...(spec.ownerScope && adapter.ownerScopeEnabled ? { owner_scope: params.owner_scope } : {}),
            });
            return makeToolResponse({
                created: true,
                collection: params.collection,
                item: { id: record.id, created_at: record.created_at },
                message: `Created ${params.collection} record: ${record.title ?? record.name ?? record.subject ?? record.id}`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'record_create');
        }
    });
}
