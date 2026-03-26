/**
 * PocketBase Migration 005: Prospects (CRM)
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const prospects = new Collection({
    name: 'prospects',
    type: 'base',
    schema: [
      { name: 'name', type: 'text', required: true, options: { maxSize: 200 } },
      { name: 'email', type: 'email', options: { maxSize: 200 } },
      { name: 'company', type: 'text', options: { maxSize: 200 } },
      { name: 'role', type: 'text', options: { maxSize: 200 } },
      { name: 'stage', type: 'select', required: true, options: { values: ['new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing'] } },
      { name: 'source', type: 'text', options: { maxSize: 200 } },
      { name: 'estimated_value', type: 'number' },
      { name: 'next_action_type', type: 'text', options: { maxSize: 100 } },
      { name: 'next_followup_date', type: 'date' },
      { name: 'last_contact_date', type: 'date' },
      { name: 'notes', type: 'editor', options: { maxSize: 10000 } },
      { name: 'tags', type: 'json' },
      { name: 'linkedin_url', type: 'url', options: { maxSize: 500 } },
    ],
    indexes: [
      'CREATE INDEX idx_prospects_stage ON prospects (stage)',
    ],
  });
  app.save(prospects);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('prospects'));
});
