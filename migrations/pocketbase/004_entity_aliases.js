/**
 * PocketBase Migration 004: Entity aliases + settings
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // entity_aliases collection
  const aliases = new Collection({
    name: 'entity_aliases',
    type: 'base',
    schema: [
      { name: 'canonical', type: 'text', required: true, options: { maxSize: 100 } },
      { name: 'alias', type: 'text', required: true, options: { maxSize: 200 } },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_entity_aliases_unique ON entity_aliases (canonical, alias)',
    ],
  });
  app.save(aliases);

  // settings collection
  const settings = new Collection({
    name: 'settings',
    type: 'base',
    schema: [
      { name: 'key', type: 'text', required: true, options: { maxSize: 100 } },
      { name: 'value', type: 'editor' },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_settings_key ON settings (key)',
    ],
  });
  app.save(settings);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('settings'));
  app.delete(app.findCollectionByNameOrId('entity_aliases'));
});
