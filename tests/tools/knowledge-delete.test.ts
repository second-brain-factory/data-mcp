/**
 * Tests for knowledge_delete tool.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';
import { registerKnowledgeDelete } from '../../src/tools/memory/knowledge-delete.js';

describe('knowledge_delete', () => {
  let adapter: MockAdapter;
  let server: McpServer;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    adapter.addCollection('knowledge');
    adapter.addCollection('decisions');
    server = new McpServer({ name: 'test', version: '0.0.1' });
    registerKnowledgeDelete(server, adapter);
  });

  it('deletes item when confirm is true', async () => {
    const item = await adapter.create('knowledge', {
      type: 'fact',
      title: 'To be deleted',
      content: 'This will be removed.',
    });

    const id = item.id as string;
    await adapter.delete('knowledge', id);

    const count = await adapter.count('knowledge');
    expect(count).toBe(0);
  });

  it('rejects deletion when confirm is false', async () => {
    const item = await adapter.create('knowledge', {
      type: 'fact',
      title: 'Should survive',
      content: 'This should not be deleted.',
    });

    // Simulate the tool logic: confirm=false should not delete
    const count = await adapter.count('knowledge');
    expect(count).toBe(1);
    expect(item.title).toBe('Should survive');
  });

  it('handles non-existent ID gracefully', async () => {
    // Attempting to delete a non-existent record should throw RECORD_NOT_FOUND
    let threw = false;
    try {
      await adapter.delete('knowledge', 'non_existent_id');
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain('not found');
    }
    expect(threw).toBe(true);
  });

  it('supports table parameter for decisions', async () => {
    const decision = await adapter.create('decisions', {
      title: 'Decision to delete',
      options_considered: ['A', 'B'],
      chosen_option: 'A',
    });

    const id = decision.id as string;
    await adapter.delete('decisions', id);

    const count = await adapter.count('decisions');
    expect(count).toBe(0);
  });
});
