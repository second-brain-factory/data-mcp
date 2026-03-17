/**
 * PocketBase Migration 002: Goals and tasks
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // goals collection
  const goals = new Collection({
    name: 'goals',
    type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'description', type: 'editor', options: { maxSize: 5000 } },
      { name: 'timeframe', type: 'select', required: true, options: { values: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] } },
      { name: 'status', type: 'select', required: true, options: { values: ['active', 'completed', 'paused', 'abandoned'] } },
      { name: 'key_results', type: 'json' },
      { name: 'tags', type: 'json' },
    ],
  });
  app.save(goals);

  // tasks collection
  const tasks = new Collection({
    name: 'tasks',
    type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: { maxSize: 500 } },
      { name: 'description', type: 'editor', options: { maxSize: 5000 } },
      { name: 'status', type: 'select', required: true, options: { values: ['todo', 'in_progress', 'done', 'cancelled'] } },
      { name: 'priority', type: 'select', required: true, options: { values: ['low', 'medium', 'high', 'urgent'] } },
      { name: 'due_date', type: 'date' },
      { name: 'tags', type: 'json' },
      { name: 'goal_id', type: 'text', options: { maxSize: 100 } },
    ],
  });
  app.save(tasks);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('tasks'));
  app.delete(app.findCollectionByNameOrId('goals'));
});
