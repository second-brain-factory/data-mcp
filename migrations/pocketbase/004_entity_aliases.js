/**
 * PocketBase Migration 004: Entity aliases + settings
 * PocketBase v0.23+ field format.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const aliases = new Collection({
    name: 'entity_aliases',
    type: 'base',
    fields: [
      { name: 'canonical', type: 'text', required: true, max: 100 },
      { name: 'alias', type: 'text', required: true, max: 200 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_entity_aliases_unique ON entity_aliases (canonical, alias)',
      'CREATE INDEX idx_entity_aliases_canonical ON entity_aliases (canonical)',
      'CREATE INDEX idx_entity_aliases_alias ON entity_aliases (alias)',
    ],
  });
  app.save(aliases);

  const settings = new Collection({
    name: 'settings',
    type: 'base',
    fields: [
      { name: 'key', type: 'text', required: true, max: 100 },
      { name: 'value', type: 'editor' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_settings_key ON settings (key)',
    ],
  });
  app.save(settings);
}, (app) => {
  const s = app.findCollectionByNameOrId('settings'); if (s) app.delete(s);
  const a = app.findCollectionByNameOrId('entity_aliases'); if (a) app.delete(a);
});
