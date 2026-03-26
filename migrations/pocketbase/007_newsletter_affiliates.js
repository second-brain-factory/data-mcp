/**
 * PocketBase Migration 007: Newsletter subscribers and affiliates
 */

/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  // newsletter_subscribers collection
  const subscribers = new Collection({
    name: 'newsletter_subscribers',
    type: 'base',
    schema: [
      { name: 'email', type: 'email', required: true, options: { maxSize: 200 } },
      { name: 'name', type: 'text', options: { maxSize: 200 } },
      { name: 'status', type: 'select', required: true, options: { values: ['active', 'unsubscribed', 'bounced'] } },
      { name: 'source', type: 'text', options: { maxSize: 200 } },
      { name: 'tags', type: 'json' },
      { name: 'subscribed_at', type: 'date' },
      { name: 'unsubscribed_at', type: 'date' },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_newsletter_subscribers_email ON newsletter_subscribers (email)',
    ],
  });
  app.save(subscribers);

  // affiliates collection
  const affiliates = new Collection({
    name: 'affiliates',
    type: 'base',
    schema: [
      { name: 'name', type: 'text', required: true, options: { maxSize: 200 } },
      { name: 'email', type: 'email', required: true, options: { maxSize: 200 } },
      { name: 'code', type: 'text', required: true, options: { maxSize: 100 } },
      { name: 'commission_rate', type: 'number', options: { min: 0, max: 1 } },
      { name: 'status', type: 'select', required: true, options: { values: ['pending', 'active', 'paused', 'terminated'] } },
      { name: 'total_earned_cents', type: 'number' },
      { name: 'total_paid_cents', type: 'number' },
      { name: 'stripe_account_id', type: 'text', options: { maxSize: 200 } },
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_affiliates_email ON affiliates (email)',
      'CREATE UNIQUE INDEX idx_affiliates_code ON affiliates (code)',
    ],
  });
  app.save(affiliates);
}, (app) => {
  app.delete(app.findCollectionByNameOrId('affiliates'));
  app.delete(app.findCollectionByNameOrId('newsletter_subscribers'));
});
