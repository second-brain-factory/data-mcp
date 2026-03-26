/**
 * PocketBase Migration 003: Contacts
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const contacts = new Collection({
    name: 'contacts',
    type: 'base',
    schema: [
      { name: 'name', type: 'text', required: true, options: { maxSize: 200 } },
      { name: 'company', type: 'text', options: { maxSize: 200 } },
      { name: 'role', type: 'text', options: { maxSize: 200 } },
      { name: 'email', type: 'email', options: { maxSize: 200 } },
      { name: 'phone', type: 'text', options: { maxSize: 50 } },
      { name: 'relationship', type: 'select', options: { values: ['colleague', 'client', 'prospect', 'partner', 'other'] } },
      { name: 'notes', type: 'editor', options: { maxSize: 5000 } },
      { name: 'tags', type: 'json' },
      { name: 'last_contact_date', type: 'date' },
    ],
    indexes: [
      'CREATE INDEX idx_contacts_name ON contacts (name)',
    ],
  });
  app.save(contacts);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('contacts'));
});
