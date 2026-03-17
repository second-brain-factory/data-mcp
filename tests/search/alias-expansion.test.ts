import { describe, it, expect, beforeEach } from 'vitest';
import { MockAdapter, resetIdCounter } from '../helpers/mock-adapter.js';
import { expandQueryWithAliases, clearAliasCache } from '../../src/search/alias-expansion.js';
import { sampleEntityAliases } from '../helpers/test-fixtures.js';

describe('expandQueryWithAliases', () => {
  let adapter: MockAdapter;

  beforeEach(async () => {
    adapter = new MockAdapter();
    adapter.reset();
    resetIdCounter();
    clearAliasCache();
    adapter.addCollection('entity_aliases');

    // Seed aliases
    for (const alias of sampleEntityAliases) {
      await adapter.create('entity_aliases', alias);
    }
  });

  it('expands a known alias to related terms', async () => {
    const terms = await expandQueryWithAliases(adapter, 'payment');
    expect(terms).toContain('payment');
    expect(terms).toContain('stripe');
    expect(terms).toContain('checkout');
    expect(terms).toContain('billing');
  });

  it('expands a canonical to its aliases', async () => {
    const terms = await expandQueryWithAliases(adapter, 'stripe');
    expect(terms).toContain('stripe');
    expect(terms).toContain('payment');
    expect(terms).toContain('checkout');
    expect(terms).toContain('billing');
  });

  it('returns original tokens when no aliases found', async () => {
    const terms = await expandQueryWithAliases(adapter, 'unknown term');
    expect(terms).toEqual(['unknown', 'term']);
  });

  it('deduplicates expanded terms', async () => {
    const terms = await expandQueryWithAliases(adapter, 'payment billing');
    // Both payment and billing are aliases of stripe, so no extra duplicates
    const uniqueTerms = new Set(terms);
    expect(uniqueTerms.size).toBe(terms.length);
  });

  it('degrades silently when entity_aliases table is missing', async () => {
    const emptyAdapter = new MockAdapter();
    clearAliasCache();
    const terms = await expandQueryWithAliases(emptyAdapter, 'payment');
    expect(terms).toEqual(['payment']);
  });
});
