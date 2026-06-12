/**
 * PocketBase migration: handoffs collection
 *
 * Evidence-backed handoff packets (data-mcp issue #9).
 * Note: PocketBase has no team mode (owner scoping is skipped in
 * factory.ts), so handoffs on PocketBase behave as plain records —
 * useful for solo multi-context handoff notes only.
 */
module.exports = {
    async up(db) {
        const collection = new Collection({
            name: 'handoffs',
            type: 'base',
            schema: [
                { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
                { name: 'to_member', type: 'text', required: true, options: { maxSize: 100 } },
                { name: 'status', type: 'select', required: true, options: { values: ['open', 'accepted', 'completed', 'cancelled'] } },
                { name: 'what_changed', type: 'editor', options: { maxSize: 5000 } },
                { name: 'tried', type: 'json' },
                { name: 'assumptions', type: 'json' },
                { name: 'blocked_on', type: 'text', options: { maxSize: 2000 } },
                { name: 'next_steps', type: 'json' },
                { name: 'needs_verification', type: 'json' },
                { name: 'recheck_by', type: 'date' },
                { name: 'supersedes', type: 'text', options: { maxSize: 100 } },
                { name: 'task_id', type: 'text', options: { maxSize: 100 } },
                { name: 'session_ids', type: 'json' },
                { name: 'accepted_at', type: 'date' },
                { name: 'completed_at', type: 'date' },
                { name: 'metadata', type: 'json' },
                { name: 'owner_id', type: 'text', options: { maxSize: 100 } },
            ],
            indexes: [
                'CREATE INDEX idx_handoffs_status ON handoffs (status)',
                'CREATE INDEX idx_handoffs_to_member ON handoffs (to_member)',
            ],
        });
        return db.save(collection);
    },
    async down(db) {
        const collection = await db.findCollectionByNameOrId('handoffs');
        return db.delete(collection);
    },
};
