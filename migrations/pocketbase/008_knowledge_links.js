/**
 * PocketBase Migration 008: knowledge_links collection
 *
 * Typed relationships between MemoryOS entities.
 * PocketBase does not support pgvector — link suggestions use keyword-based
 * text search fallback.
 *
 * PocketBase v0.23+ field format + native migrate() form
 * (was previously module.exports — goja runtime panics on that).
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const links = new Collection({
    name: 'knowledge_links',
    type: 'base',
    fields: [
      { name: 'owner_id', type: 'text', max: 100 },
      { name: 'source_type', type: 'text', required: true, max: 50 },
      { name: 'source_id', type: 'text', required: true, max: 36 },
      { name: 'target_type', type: 'text', required: true, max: 50 },
      { name: 'target_id', type: 'text', required: true, max: 36 },
      { name: 'relation_type', type: 'text', required: true, max: 50 },
      { name: 'confidence', type: 'number', min: 0, max: 1 },
      { name: 'notes', type: 'text', max: 500 },
      { name: 'auto_suggested', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_kl_source ON knowledge_links (owner_id, source_type, source_id)',
      'CREATE INDEX idx_kl_target ON knowledge_links (owner_id, target_type, target_id)',
      'CREATE UNIQUE INDEX idx_kl_unique ON knowledge_links (owner_id, source_type, source_id, target_type, target_id, relation_type)',
    ],
  });
  app.save(links);
}, (app) => {
  const links = app.findCollectionByNameOrId('knowledge_links');
  if (links) app.delete(links);
});
