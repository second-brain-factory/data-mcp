/**
 * PocketBase Migration 002: Goals and tasks
 * PocketBase v0.23+ field format.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const goals = new Collection({
    name: 'goals',
    type: 'base',
    fields: [
      { name: 'title', type: 'text', required: true, max: 500 },
      { name: 'description', type: 'editor', maxSize: 5000 },
      { name: 'timeframe', type: 'select', required: true, maxSelect: 1, values: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'completed', 'paused', 'abandoned'] },
      { name: 'key_results', type: 'json' },
      { name: 'tags', type: 'json' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_goals_status ON goals (status)',
      'CREATE INDEX idx_goals_timeframe ON goals (timeframe)',
    ],
  });
  app.save(goals);

  const tasks = new Collection({
    name: 'tasks',
    type: 'base',
    fields: [
      { name: 'title', type: 'text', required: true, max: 500 },
      { name: 'description', type: 'editor', maxSize: 5000 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['todo', 'in_progress', 'done', 'cancelled'] },
      { name: 'priority', type: 'select', required: true, maxSelect: 1, values: ['low', 'medium', 'high', 'urgent'] },
      { name: 'due_date', type: 'date' },
      { name: 'tags', type: 'json' },
      { name: 'goal_id', type: 'text', max: 100 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_tasks_status ON tasks (status)',
      'CREATE INDEX idx_tasks_priority ON tasks (priority)',
    ],
  });
  app.save(tasks);
}, (app) => {
  const t = app.findCollectionByNameOrId('tasks'); if (t) app.delete(t);
  const g = app.findCollectionByNameOrId('goals'); if (g) app.delete(g);
});
