/**
 * PocketBase Migration 001: Core schema
 *
 * Creates knowledge, decisions, sessions collections.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // knowledge collection
  const knowledge = new Collection({
    name: 'knowledge',
    type: 'base',
    schema: [
      { name: 'type', type: 'select', required: true, options: { values: ['fact', 'knowledge', 'pattern', 'insight', 'lesson', 'reference'] } },
      { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'content', type: 'editor', required: true, options: { maxSize: 50000 } },
      { name: 'summary', type: 'text', options: { maxSize: 2000 } },
      { name: 'tags', type: 'json' },
      { name: 'source', type: 'text', options: { maxSize: 500 } },
      { name: 'confidence', type: 'number', options: { min: 0, max: 1 } },
      { name: 'last_validated_at', type: 'date' },
    ],
    indexes: [
      'CREATE INDEX idx_knowledge_type ON knowledge (type)',
      'CREATE INDEX idx_knowledge_last_validated ON knowledge (last_validated_at)',
    ],
  });
  app.save(knowledge);

  // decisions collection
  const decisions = new Collection({
    name: 'decisions',
    type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'context', type: 'editor', options: { maxSize: 5000 } },
      { name: 'options_considered', type: 'json', required: true },
      { name: 'chosen_option', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'rationale', type: 'editor', options: { maxSize: 5000 } },
      { name: 'outcome', type: 'editor', options: { maxSize: 5000 } },
      { name: 'tags', type: 'json' },
    ],
  });
  app.save(decisions);

  // sessions collection
  const sessions = new Collection({
    name: 'sessions',
    type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'summary', type: 'editor', required: true, options: { maxSize: 10000 } },
      { name: 'session_date', type: 'date' },
      { name: 'skills_used', type: 'json' },
      { name: 'files_changed', type: 'json' },
      { name: 'decisions_made', type: 'json' },
      { name: 'duration_minutes', type: 'number' },
      { name: 'task_id', type: 'text', options: { maxSize: 100 } },
      { name: 'branch', type: 'text', options: { maxSize: 200 } },
      { name: 'patterns_learned', type: 'json' },
      { name: 'knowledge_created', type: 'number' },
      { name: 'knowledge_updated', type: 'number' },
      { name: 'metadata', type: 'json' },
    ],
  });
  app.save(sessions);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('sessions'));
  app.delete(app.findCollectionByNameOrId('decisions'));
  app.delete(app.findCollectionByNameOrId('knowledge'));
});
