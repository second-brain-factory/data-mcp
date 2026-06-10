/**
 * PocketBase Migration 005: Prospects (CRM)
 * PocketBase v0.23+ field format.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const prospects = new Collection({
    name: 'prospects',
    type: 'base',
    fields: [
      { name: 'name', type: 'text', required: true, max: 200 },
      { name: 'email', type: 'email' },
      { name: 'company', type: 'text', max: 200 },
      { name: 'role', type: 'text', max: 200 },
      { name: 'stage', type: 'select', required: true, maxSelect: 1, values: ['new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing'] },
      { name: 'source', type: 'text', max: 200 },
      { name: 'estimated_value', type: 'number' },
      { name: 'next_action_type', type: 'text', max: 100 },
      { name: 'next_followup_date', type: 'date' },
      { name: 'last_contact_date', type: 'date' },
      { name: 'notes', type: 'editor', maxSize: 10000 },
      { name: 'tags', type: 'json' },
      { name: 'linkedin_url', type: 'url' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE INDEX idx_prospects_stage ON prospects (stage)',
    ],
  });
  app.save(prospects);
}, (app) => {
  const p = app.findCollectionByNameOrId('prospects'); if (p) app.delete(p);
});
