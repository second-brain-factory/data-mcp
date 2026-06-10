/**
 * PocketBase Migration 003: Contacts
 * PocketBase v0.23+ field format.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const contacts = new Collection({
    name: 'contacts',
    type: 'base',
    fields: [
      { name: 'name', type: 'text', required: true, max: 200 },
      { name: 'company', type: 'text', max: 200 },
      { name: 'role', type: 'text', max: 200 },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'text', max: 50 },
      { name: 'relationship', type: 'select', maxSelect: 1, values: ['colleague', 'client', 'prospect', 'partner', 'other'] },
      { name: 'notes', type: 'editor', maxSize: 5000 },
      { name: 'tags', type: 'json' },
      { name: 'last_contact_date', type: 'date' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_contacts_name ON contacts (name)',
    ],
  });
  app.save(contacts);
}, (app) => {
  const c = app.findCollectionByNameOrId('contacts'); if (c) app.delete(c);
});
