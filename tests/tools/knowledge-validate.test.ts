/**
 * Tests for knowledge_validate tool logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';

describe('knowledge_validate logic', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    adapter.addCollection('knowledge');
  });

  it('batch updates last_validated_at for all valid IDs', async () => {
    const item1 = await adapter.create('knowledge', {
      type: 'fact',
      title: 'Item 1',
      content: 'Content 1',
      last_validated_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const item2 = await adapter.create('knowledge', {
      type: 'pattern',
      title: 'Item 2',
      content: 'Content 2',
      last_validated_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const now = new Date().toISOString();
    const ids = [item1.id as string, item2.id as string];

    // Simulate the tool logic: parallelize updates
    const results = await Promise.allSettled(
      ids.map((id) => adapter.update('knowledge', id, { last_validated_at: now }))
    );

    const validated = results.filter((r) => r.status === 'fulfilled').length;
    expect(validated).toBe(2);

    // Verify items were updated
    const updated1 = await adapter.getOne('knowledge', item1.id as string);
    expect(updated1.last_validated_at).toBe(now);
    const updated2 = await adapter.getOne('knowledge', item2.id as string);
    expect(updated2.last_validated_at).toBe(now);
  });

  it('reports partial failure for mixed valid/invalid IDs', async () => {
    const item1 = await adapter.create('knowledge', {
      type: 'fact',
      title: 'Valid item',
      content: 'Content',
      last_validated_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const now = new Date().toISOString();
    const ids = [item1.id as string, 'nonexistent_id'];

    const results = await Promise.allSettled(
      ids.map((id) => adapter.update('knowledge', id, { last_validated_at: now }))
    );

    const validated = results.filter((r) => r.status === 'fulfilled').length;
    const notFound = results.filter((r) => r.status === 'rejected').length;

    expect(validated).toBe(1);
    expect(notFound).toBe(1);
  });

  it('reports all not found when all IDs are invalid', async () => {
    const now = new Date().toISOString();
    const ids = ['fake_id_1', 'fake_id_2', 'fake_id_3'];

    const results = await Promise.allSettled(
      ids.map((id) => adapter.update('knowledge', id, { last_validated_at: now }))
    );

    const notFound = results.filter((r) => r.status === 'rejected').length;
    expect(notFound).toBe(3);
  });
});
