import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';
import { sampleKnowledgeItems, sampleDecisions } from '../helpers/test-fixtures.js';

describe('brain_stats logic', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    adapter.addCollection('knowledge');
    adapter.addCollection('decisions');
    adapter.addCollection('sessions');
    adapter.addCollection('goals');
    adapter.addCollection('tasks');
    adapter.addCollection('contacts');
  });

  it('counts items across all collections', async () => {
    for (const item of sampleKnowledgeItems) {
      await adapter.create('knowledge', item);
    }
    for (const item of sampleDecisions) {
      await adapter.create('decisions', item);
    }

    const knowledgeCount = await adapter.count('knowledge');
    const decisionsCount = await adapter.count('decisions');
    const sessionsCount = await adapter.count('sessions');

    expect(knowledgeCount).toBe(3);
    expect(decisionsCount).toBe(1);
    expect(sessionsCount).toBe(0);
  });

  it('counts knowledge by type', async () => {
    for (const item of sampleKnowledgeItems) {
      await adapter.create('knowledge', item);
    }

    const factCount = await adapter.count('knowledge', [
      [{ field: 'type', op: 'eq', value: 'fact' }],
    ]);
    const patternCount = await adapter.count('knowledge', [
      [{ field: 'type', op: 'eq', value: 'pattern' }],
    ]);
    const insightCount = await adapter.count('knowledge', [
      [{ field: 'type', op: 'eq', value: 'insight' }],
    ]);

    expect(factCount).toBe(1);
    expect(patternCount).toBe(1);
    expect(insightCount).toBe(1);
  });
});
