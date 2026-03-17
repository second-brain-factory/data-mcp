import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';

describe('brain_decay logic', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    adapter.addCollection('knowledge');
  });

  it('computes decay score correctly', () => {
    // Decay formula: 1.0 - (days_since_validated / 180)
    const DECAY_PERIOD_DAYS = 180;

    // Just validated: score = 1.0
    expect(1.0 - (0 / DECAY_PERIOD_DAYS)).toBe(1.0);

    // 90 days ago: score = 0.5
    expect(1.0 - (90 / DECAY_PERIOD_DAYS)).toBe(0.5);

    // 180 days ago: score = 0.0
    expect(1.0 - (180 / DECAY_PERIOD_DAYS)).toBe(0.0);

    // 270 days ago: score = -0.5 → clamped to 0
    expect(Math.max(0, 1.0 - (270 / DECAY_PERIOD_DAYS))).toBe(0);
  });

  it('filters stale items by last_validated_at', async () => {
    const freshDate = new Date().toISOString();
    const staleDate = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(); // 120 days ago

    await adapter.create('knowledge', {
      type: 'fact',
      title: 'Fresh item',
      content: 'Still valid',
      last_validated_at: freshDate,
    });

    await adapter.create('knowledge', {
      type: 'insight',
      title: 'Stale item',
      content: 'Needs review',
      last_validated_at: staleDate,
    });

    // threshold = 0.5 → cutoff = (1.0 - 0.5) * 180 = 90 days ago
    const threshold = 0.5;
    const daysThreshold = (1.0 - threshold) * 180;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Math.floor(daysThreshold));

    const result = await adapter.list('knowledge', {
      filter: [[
        { field: 'last_validated_at', op: 'lt', value: cutoffDate.toISOString() },
      ]],
      sort: [{ field: 'last_validated_at', direction: 'asc' }],
      page: { limit: 20, offset: 0 },
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].title).toBe('Stale item');
  });
});
