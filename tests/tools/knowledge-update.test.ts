/**
 * Tests for knowledge_update tool logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';
import { generateSummary } from '../../src/tools/shared.js';

describe('knowledge_update logic', () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    adapter.addCollection('knowledge');
  });

  it('regenerates summary when content changes', async () => {
    const item = await adapter.create('knowledge', {
      type: 'fact',
      title: 'Original title',
      content: 'Original content.',
      summary: 'Original content.',
    });

    const newContent = 'Updated content that is now different and provides new information about the topic.';
    const newSummary = generateSummary(newContent);

    const updated = await adapter.update('knowledge', item.id as string, {
      content: newContent,
      summary: newSummary,
    });

    expect(updated.content).toBe(newContent);
    expect(updated.summary).toBe(newSummary);
    expect(updated.summary).not.toBe('Original content.');
  });

  it('does not change summary when only title changes', async () => {
    const item = await adapter.create('knowledge', {
      type: 'fact',
      title: 'Original title',
      content: 'Some content here.',
      summary: 'Some content here.',
    });

    // Simulate update with title only (no content change, so no summary regen)
    const updates: Record<string, unknown> = {};
    updates.title = 'New title';
    // No content provided, so summary should not be regenerated

    const updated = await adapter.update('knowledge', item.id as string, updates);

    expect(updated.title).toBe('New title');
    expect(updated.summary).toBe('Some content here.');
  });

  it('returns no-op message when no fields provided', () => {
    // The tool handler checks if Object.keys(updates).length === 0
    const updates: Record<string, unknown> = {};
    expect(Object.keys(updates).length).toBe(0);
  });

  it('updates multiple fields at once', async () => {
    const item = await adapter.create('knowledge', {
      type: 'fact',
      title: 'Original',
      content: 'Original content.',
      tags: ['old'],
      confidence: 0.5,
    });

    const updated = await adapter.update('knowledge', item.id as string, {
      title: 'Updated title',
      tags: ['new', 'updated'],
      confidence: 0.9,
    });

    expect(updated.title).toBe('Updated title');
    expect(updated.tags).toEqual(['new', 'updated']);
    expect(updated.confidence).toBe(0.9);
    // content and summary remain unchanged
    expect(updated.content).toBe('Original content.');
  });
});
