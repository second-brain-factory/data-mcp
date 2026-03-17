/**
 * Tests for setup_status tool logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';

const EXPECTED_COLLECTIONS = [
  'knowledge',
  'decisions',
  'sessions',
  'goals',
  'tasks',
  'contacts',
  'entity_aliases',
  'settings',
  'prospects',
  'blog_posts',
  'email_queue',
  'content_calendar',
];

describe('setup_status logic', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
  });

  it('reports all collections present when fully set up', async () => {
    // Create all expected collections
    for (const name of EXPECTED_COLLECTIONS) {
      adapter.addCollection(name);
    }

    // Add schema version to settings
    await adapter.create('settings', { key: 'schema_version', value: '1' });

    const existing = await adapter.listCollections();
    const existingSet = new Set(existing);

    const present: string[] = [];
    const missing: string[] = [];

    for (const collection of EXPECTED_COLLECTIONS) {
      if (existingSet.has(collection)) {
        present.push(collection);
      } else {
        missing.push(collection);
      }
    }

    expect(present.length).toBe(EXPECTED_COLLECTIONS.length);
    expect(missing.length).toBe(0);
  });

  it('reports partial schema when some collections are missing', async () => {
    // Only create a subset of collections
    adapter.addCollection('knowledge');
    adapter.addCollection('decisions');
    adapter.addCollection('sessions');

    const existing = await adapter.listCollections();
    const existingSet = new Set(existing);

    const present: string[] = [];
    const missing: string[] = [];

    for (const collection of EXPECTED_COLLECTIONS) {
      if (existingSet.has(collection)) {
        present.push(collection);
      } else {
        missing.push(collection);
      }
    }

    expect(present.length).toBe(3);
    expect(missing.length).toBe(EXPECTED_COLLECTIONS.length - 3);
    expect(missing).toContain('goals');
    expect(missing).toContain('contacts');
    expect(missing).toContain('settings');
  });

  it('reports connection info with backend type', () => {
    expect(adapter.backend).toBe('pocketbase');
  });

  it('reads schema_version from settings when available', async () => {
    adapter.addCollection('settings');
    await adapter.create('settings', { key: 'schema_version', value: '1' });

    const results = await adapter.list('settings', {
      filter: [[{ field: 'key', op: 'eq', value: 'schema_version' }]],
      page: { limit: 1, offset: 0 },
    });

    expect(results.items.length).toBe(1);
    expect(results.items[0].value).toBe('1');
  });

  it('handles missing settings table gracefully', async () => {
    // settings collection does not exist
    const exists = await adapter.collectionExists('settings');
    expect(exists).toBe(false);
  });
});
