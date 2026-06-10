/**
 * PocketBase Migration 007: Newsletter subscribers and affiliates
 * PocketBase v0.23+ field format.
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const subscribers = new Collection({
    name: 'newsletter_subscribers',
    type: 'base',
    fields: [
      { name: 'email', type: 'email', required: true },
      { name: 'name', type: 'text', max: 200 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['active', 'unsubscribed', 'bounced'] },
      { name: 'source', type: 'text', max: 200 },
      { name: 'tags', type: 'json' },
      { name: 'subscribed_at', type: 'date' },
      { name: 'unsubscribed_at', type: 'date' },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_newsletter_subscribers_email ON newsletter_subscribers (email)',
    ],
  });
  app.save(subscribers);

  const affiliates = new Collection({
    name: 'affiliates',
    type: 'base',
    fields: [
      { name: 'name', type: 'text', required: true, max: 200 },
      { name: 'email', type: 'email', required: true },
      { name: 'code', type: 'text', required: true, max: 100 },
      { name: 'commission_rate', type: 'number', min: 0, max: 1 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['pending', 'active', 'paused', 'terminated'] },
      { name: 'total_earned_cents', type: 'number' },
      { name: 'total_paid_cents', type: 'number' },
      { name: 'stripe_account_id', type: 'text', max: 200 },
      { name: 'created', type: 'autodate', onCreate: true },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_affiliates_email ON affiliates (email)',
      'CREATE UNIQUE INDEX idx_affiliates_code ON affiliates (code)',
    ],
  });
  app.save(affiliates);
}, (app) => {
  const a = app.findCollectionByNameOrId('affiliates'); if (a) app.delete(a);
  const s = app.findCollectionByNameOrId('newsletter_subscribers'); if (s) app.delete(s);
});
