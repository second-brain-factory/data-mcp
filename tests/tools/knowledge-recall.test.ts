/**
 * Tests for knowledge_recall tool logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';
import { registerKnowledgeRecall } from '../../src/tools/memory/knowledge-recall.js';
import { sampleKnowledgeItems, sampleDecisions, sampleEntityAliases } from '../helpers/test-fixtures.js';
import { clearAliasCache } from '../../src/search/alias-expansion.js';

describe('knowledge_recall logic', () => {
  let adapter: MockAdapter;
  let server: McpServer;

  beforeEach(async () => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    clearAliasCache();
    adapter.addCollection('knowledge');
    adapter.addCollection('decisions');
    adapter.addCollection('entity_aliases');

    // Seed knowledge items
    for (const item of sampleKnowledgeItems) {
      await adapter.create('knowledge', item);
    }

    // Seed decisions
    for (const item of sampleDecisions) {
      await adapter.create('decisions', item);
    }

    // Seed aliases
    for (const alias of sampleEntityAliases) {
      await adapter.create('entity_aliases', alias);
    }

    server = new McpServer({ name: 'test', version: '0.0.1' });
    registerKnowledgeRecall(server, adapter);
  });

  it('returns recent items for empty query', async () => {
    const result = await adapter.list('knowledge', {
      sort: [{ field: 'created_at', direction: 'desc' }],
      page: { limit: 10, offset: 0 },
    });

    expect(result.items.length).toBe(3);
  });

  it('filters by type', async () => {
    const result = await adapter.list('knowledge', {
      filter: [[{ field: 'type', op: 'eq', value: 'fact' }]],
      sort: [{ field: 'created_at', direction: 'desc' }],
      page: { limit: 10, offset: 0 },
    });

    expect(result.items.length).toBe(1);
    expect(result.items[0].type).toBe('fact');
  });

  it('expands aliases in search', async () => {
    // Search for 'payment' should find Stripe-related items via alias expansion
    const { expandQueryWithAliases } = await import('../../src/search/alias-expansion.js');
    const terms = await expandQueryWithAliases(adapter, 'payment');

    expect(terms).toContain('payment');
    expect(terms).toContain('stripe');
    expect(terms).toContain('checkout');
    expect(terms).toContain('billing');
  });

  it('searches knowledge by text', async () => {
    const results = await adapter.textSearch('knowledge', 'stripe cents', {
      fields: ['title', 'content', 'summary'],
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('Stripe');
  });

  it('cross-table search finds knowledge and decisions', async () => {
    // Search knowledge
    const knowledgeResults = await adapter.textSearch('knowledge', 'PocketBase', {
      fields: ['title', 'content'],
      limit: 10,
    });

    // Search decisions
    const decisionResults = await adapter.textSearch('decisions', 'PocketBase', {
      fields: ['title', 'context', 'chosen_option'],
      limit: 5,
    });

    // PocketBase appears in decisions (chosen_option)
    expect(decisionResults.length).toBeGreaterThan(0);
    expect(decisionResults[0].chosen_option).toBe('PocketBase');

    // Combined results
    const combined = [...knowledgeResults, ...decisionResults];
    expect(combined.length).toBeGreaterThan(0);
  });
});
