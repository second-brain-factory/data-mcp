/**
 * PocketBase migration: knowledge_links collection
 *
 * Creates the knowledge_links collection for typed relationships
 * between MemoryOS entities.
 *
 * Note: PocketBase does not support pgvector.
 * Link suggestions use keyword-based text search fallback.
 */
module.exports = {
    async up(db) {
        const collection = new Collection({
            name: 'knowledge_links',
            type: 'base',
            schema: [
                { name: 'owner_id', type: 'text', required: true, options: { maxSize: 100 } },
                { name: 'source_type', type: 'text', required: true, options: { maxSize: 50 } },
                { name: 'source_id', type: 'text', required: true, options: { maxSize: 36 } },
                { name: 'target_type', type: 'text', required: true, options: { maxSize: 50 } },
                { name: 'target_id', type: 'text', required: true, options: { maxSize: 36 } },
                { name: 'relation_type', type: 'text', required: true, options: { maxSize: 50 } },
                { name: 'confidence', type: 'number', options: { min: 0, max: 1 } },
                { name: 'notes', type: 'text', options: { maxSize: 500 } },
                { name: 'auto_suggested', type: 'bool' },
            ],
            indexes: [
                'CREATE INDEX idx_kl_source ON knowledge_links (owner_id, source_type, source_id)',
                'CREATE INDEX idx_kl_target ON knowledge_links (owner_id, target_type, target_id)',
                'CREATE UNIQUE INDEX idx_kl_unique ON knowledge_links (owner_id, source_type, source_id, target_type, target_id, relation_type)',
            ],
        });
        return db.save(collection);
    },
    async down(db) {
        const collection = await db.findCollectionByNameOrId('knowledge_links');
        return db.delete(collection);
    },
};
