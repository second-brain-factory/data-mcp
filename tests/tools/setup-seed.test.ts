/**
 * Tests for setup_seed tool logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';

describe('setup_seed logic', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
  });

  it('seeds entity aliases idempotently via upsert', async () => {
    adapter.addCollection('entity_aliases');

    const aliases = [
      { canonical: 'stripe', alias: 'payment' },
      { canonical: 'stripe', alias: 'checkout' },
    ];

    // First seed
    for (const alias of aliases) {
      await adapter.upsert('entity_aliases', alias, ['canonical', 'alias']);
    }
    let count = await adapter.count('entity_aliases');
    expect(count).toBe(2);

    // Second seed (idempotent — should not create duplicates)
    for (const alias of aliases) {
      await adapter.upsert('entity_aliases', alias, ['canonical', 'alias']);
    }
    count = await adapter.count('entity_aliases');
    expect(count).toBe(2);
  });

  it('does not overwrite existing settings', async () => {
    adapter.addCollection('settings');

    // Pre-existing user setting
    await adapter.create('settings', { key: 'timezone', value: 'America/New_York' });

    // Simulate seed logic: only create if not exists
    const settings = [
      { key: 'schema_version', value: '1' },
      { key: 'timezone', value: 'UTC' },
    ];

    let seeded = 0;
    let skipped = 0;

    for (const setting of settings) {
      const existing = await adapter.list('settings', {
        filter: [[{ field: 'key', op: 'eq', value: setting.key }]],
        page: { limit: 1, offset: 0 },
      });
      if (existing.items.length === 0) {
        await adapter.create('settings', setting);
        seeded++;
      } else {
        skipped++;
      }
    }

    expect(seeded).toBe(1); // schema_version was new
    expect(skipped).toBe(1); // timezone already existed

    // Verify timezone was NOT overwritten
    const tz = await adapter.list('settings', {
      filter: [[{ field: 'key', op: 'eq', value: 'timezone' }]],
      page: { limit: 1, offset: 0 },
    });
    expect(tz.items[0].value).toBe('America/New_York');
  });

  it('skips seeding when collections do not exist', async () => {
    // No collections added — both should be skipped
    const aliasesExist = await adapter.collectionExists('entity_aliases');
    const settingsExist = await adapter.collectionExists('settings');

    expect(aliasesExist).toBe(false);
    expect(settingsExist).toBe(false);
  });

  it('seeds all default settings when table is empty', async () => {
    adapter.addCollection('settings');

    const settings = [
      { key: 'schema_version', value: '1' },
      { key: 'business_name', value: '' },
      { key: 'support_email', value: '' },
      { key: 'timezone', value: 'UTC' },
      { key: 'currency', value: 'USD' },
    ];

    for (const setting of settings) {
      await adapter.create('settings', setting);
    }

    const count = await adapter.count('settings');
    expect(count).toBe(5);

    // Verify specific settings
    const results = await adapter.list('settings', {
      filter: [[{ field: 'key', op: 'eq', value: 'currency' }]],
      page: { limit: 1, offset: 0 },
    });
    expect(results.items[0].value).toBe('USD');
  });
});
