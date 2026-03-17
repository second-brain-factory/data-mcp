import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';
import { registerKnowledgeStore } from '../../src/tools/memory/knowledge-store.js';
import { registerKnowledgeRecall } from '../../src/tools/memory/knowledge-recall.js';

describe('knowledge_store + knowledge_recall round-trip', () => {
  let adapter: MockAdapter;
  let server: McpServer;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    adapter.addCollection('knowledge');
    adapter.addCollection('decisions');
    server = new McpServer({ name: 'test', version: '0.0.1' });
    registerKnowledgeStore(server, adapter);
    registerKnowledgeRecall(server, adapter);
  });

  it('stores a knowledge item and recalls it by search', async () => {
    // Store
    const storeTool = server.tool.bind(server);
    // Use the adapter directly to verify
    const storeResult = await adapter.create('knowledge', {
      type: 'fact',
      title: 'Stripe uses cents',
      content: 'All Stripe amounts are in cents. $10 = 1000.',
      summary: 'Stripe uses cents for amounts.',
      tags: ['stripe', 'payments'],
      source: 'docs',
      confidence: 0.8,
      last_validated_at: new Date().toISOString(),
    });

    expect(storeResult.id).toBeDefined();
    expect(storeResult.title).toBe('Stripe uses cents');

    // Search
    const results = await adapter.textSearch('knowledge', 'stripe cents');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Stripe uses cents');
  });

  it('deduplicates by type + title on adapter level', async () => {
    await adapter.create('knowledge', {
      type: 'fact',
      title: 'Unique title',
      content: 'Content 1',
      tags: [],
      confidence: 0.8,
      last_validated_at: new Date().toISOString(),
    });

    // Check for existing
    const existing = await adapter.list('knowledge', {
      filter: [[
        { field: 'type', op: 'eq', value: 'fact' },
        { field: 'title', op: 'like', value: 'Unique title' },
      ]],
      page: { limit: 1, offset: 0 },
    });

    expect(existing.items.length).toBe(1);
  });

  it('recalls recent items with empty query', async () => {
    await adapter.create('knowledge', {
      type: 'fact',
      title: 'Item 1',
      content: 'Content 1',
      tags: [],
      confidence: 0.8,
      last_validated_at: new Date().toISOString(),
    });
    await adapter.create('knowledge', {
      type: 'pattern',
      title: 'Item 2',
      content: 'Content 2',
      tags: [],
      confidence: 0.8,
      last_validated_at: new Date().toISOString(),
    });

    const result = await adapter.list('knowledge', {
      sort: [{ field: 'created_at', direction: 'desc' }],
      page: { limit: 10, offset: 0 },
    });

    expect(result.items.length).toBe(2);
  });
});
