/**
 * PocketBase Migration 001: Core schema
 *
 * Creates knowledge, decisions, sessions collections.
 * PocketBase v0.23+ field format.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const knowledge = new Collection({
    name: 'knowledge',
    type: 'base',
    fields: [
      { name: 'type', type: 'select', required: true, maxSelect: 1, values: ['fact', 'knowledge', 'pattern', 'insight', 'lesson', 'reference'] },
      { name: 'title', type: 'text', required: true, max: 500 },
      { name: 'content', type: 'editor', required: true, maxSize: 50000 },
      { name: 'summary', type: 'text', max: 2000 },
      { name: 'tags', type: 'json' },
      { name: 'source', type: 'text', max: 500 },
      { name: 'confidence', type: 'number', min: 0, max: 1 },
      { name: 'last_validated_at', type: 'date' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_knowledge_type ON knowledge (type)',
      'CREATE INDEX idx_knowledge_last_validated ON knowledge (last_validated_at)',
    ],
  });
  app.save(knowledge);

  const decisions = new Collection({
    name: 'decisions',
    type: 'base',
    fields: [
      { name: 'title', type: 'text', required: true, max: 500 },
      { name: 'context', type: 'editor', maxSize: 5000 },
      { name: 'options_considered', type: 'json', required: true },
      { name: 'chosen_option', type: 'text', required: true, max: 500 },
      { name: 'rationale', type: 'editor', maxSize: 5000 },
      { name: 'outcome', type: 'editor', maxSize: 5000 },
      { name: 'tags', type: 'json' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
  });
  app.save(decisions);

  const sessions = new Collection({
    name: 'sessions',
    type: 'base',
    fields: [
      { name: 'title', type: 'text', required: true, max: 500 },
      { name: 'summary', type: 'editor', required: true, maxSize: 10000 },
      { name: 'session_date', type: 'date' },
      { name: 'skills_used', type: 'json' },
      { name: 'files_changed', type: 'json' },
      { name: 'decisions_made', type: 'json' },
      { name: 'duration_minutes', type: 'number' },
      { name: 'task_id', type: 'text', max: 100 },
      { name: 'branch', type: 'text', max: 200 },
      { name: 'patterns_learned', type: 'json' },
      { name: 'knowledge_created', type: 'number' },
      { name: 'knowledge_updated', type: 'number' },
      { name: 'metadata', type: 'json' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
  });
  app.save(sessions);
}, (app) => {
  const c1 = app.findCollectionByNameOrId('sessions'); if (c1) app.delete(c1);
  const c2 = app.findCollectionByNameOrId('decisions'); if (c2) app.delete(c2);
  const c3 = app.findCollectionByNameOrId('knowledge'); if (c3) app.delete(c3);
});
