/**
 * Unit tests for the issue-1297 search fallback:
 * - term-utils: tokenize / stemTerm / buildFallbackTerms
 * - fallback-search: textSearchWithFallback (primary untouched,
 *   any-term fallback only on zero results, merge ranking)
 */
import { describe, it, expect } from 'vitest';
import { tokenize, stemTerm, buildFallbackTerms, MAX_FALLBACK_TERMS } from '../src/search/term-utils.js';
import { textSearchWithFallback } from '../src/search/fallback-search.js';
import type { DataAdapter } from '../src/adapter/types.js';

describe('tokenize', () => {
    it('lowercases and splits on whitespace', () => {
        expect(tokenize('Deploy Tuesday')).toEqual(['deploy', 'tuesday']);
    });
    it('drops stopwords', () => {
        expect(tokenize('what is the pricing for teams')).toEqual(['pricing', 'teams']);
    });
    it('drops short tokens', () => {
        expect(tokenize('go to a db')).toEqual([]);
    });
    it('strips punctuation and splits hyphens', () => {
        expect(tokenize('e2e-testing, runs!')).toEqual(['e2e', 'testing', 'runs']);
    });
    it('returns empty for empty input', () => {
        expect(tokenize('')).toEqual([]);
    });
});

describe('stemTerm', () => {
    it('strips plural -s', () => {
        expect(stemTerm('experiments')).toBe('experiment');
        expect(stemTerm('teams')).toBe('team');
    });
    it('keeps -ss endings', () => {
        expect(stemTerm('process')).toBe('process');
    });
    it('strips -es', () => {
        expect(stemTerm('searches')).toBe('search');
    });
    it('strips -ies to stem prefix', () => {
        expect(stemTerm('studies')).toBe('stud');
        expect(stemTerm('policies')).toBe('polic');
    });
    it('strips -ing', () => {
        expect(stemTerm('deploying')).toBe('deploy');
        expect(stemTerm('pricing')).toBe('pric');
    });
    it('undoubles consonant after -ing', () => {
        expect(stemTerm('running')).toBe('run');
        expect(stemTerm('planning')).toBe('plan');
    });
    it('strips -ed', () => {
        expect(stemTerm('deployed')).toBe('deploy');
        expect(stemTerm('planned')).toBe('plan');
    });
    it('leaves short words untouched', () => {
        expect(stemTerm('runs')).toBe('run');
        expect(stemTerm('ing')).toBe('ing');
        expect(stemTerm('bed')).toBe('bed');
    });
});

describe('buildFallbackTerms', () => {
    it('stems query tokens', () => {
        expect(buildFallbackTerms('deploying experiments')).toEqual(['deploy', 'experiment']);
    });
    it('dedupes stems', () => {
        expect(buildFallbackTerms('price prices pricing priced')).toEqual(['price', 'pric']);
    });
    it('appends alias terms after query terms', () => {
        expect(buildFallbackTerms('payments', ['stripe', 'checkout'])).toEqual(['payment', 'stripe', 'checkout']);
    });
    it('caps at MAX_FALLBACK_TERMS', () => {
        const words = Array.from({ length: 20 }, (_, i) => `unique${i}word`).join(' ');
        expect(buildFallbackTerms(words).length).toBe(MAX_FALLBACK_TERMS);
    });
    it('drops stopwords and short stems', () => {
        expect(buildFallbackTerms('the and of it')).toEqual([]);
    });
});

interface SearchCall {
    collection: string;
    query: string;
    options: unknown;
}

function makeSearchAdapter(responses: Record<string, Record<string, unknown>[]>): { adapter: DataAdapter; calls: SearchCall[] } {
    const calls: SearchCall[] = [];
    const adapter = {
        backend: 'markdown',
        async textSearch(collection: string, query: string, options?: unknown) {
            calls.push({ collection, query, options });
            return (responses[query] ?? []) as never;
        },
    } as unknown as DataAdapter;
    return { adapter, calls };
}

describe('textSearchWithFallback', () => {
    it('returns primary results untouched when primary matches (no fallback calls)', async () => {
        const hit = { id: 'k1', title: 'exact match' };
        const { adapter, calls } = makeSearchAdapter({ 'exact match': [hit] });
        const res = await textSearchWithFallback(adapter, 'knowledge', 'exact match', ['exact', 'match']);
        expect(res.items).toEqual([hit]);
        expect(res.usedFallback).toBe(false);
        expect(res.termsUsed).toEqual([]);
        expect(calls.length).toBe(1);
        expect(calls[0].query).toBe('exact match');
    });

    it('falls back to per-term search when primary returns nothing', async () => {
        const hit = { id: 'k1', title: 'deploy notes' };
        const { adapter, calls } = makeSearchAdapter({ deploy: [hit] });
        const res = await textSearchWithFallback(adapter, 'knowledge', 'deploying tuesday', ['deploy', 'tuesday']);
        expect(res.items).toEqual([hit]);
        expect(res.usedFallback).toBe(true);
        expect(res.termsUsed).toEqual(['deploy', 'tuesday']);
        expect(calls.map((c) => c.query)).toEqual(['deploying tuesday', 'deploy', 'tuesday']);
    });

    it('ranks items matching more terms first', async () => {
        const both = { id: 'both', title: 'deploy tuesday convention' };
        const one = { id: 'one', title: 'deploy script' };
        const { adapter } = makeSearchAdapter({
            deploy: [one, both],
            tuesday: [both],
        });
        const res = await textSearchWithFallback(adapter, 'knowledge', 'deploying tuesdays', ['deploy', 'tuesday']);
        expect(res.items.map((i) => i.id)).toEqual(['both', 'one']);
    });

    it('dedupes the same record across terms', async () => {
        const hit = { id: 'k1', title: 'pricing experiments' };
        const { adapter } = makeSearchAdapter({ pric: [hit], experiment: [hit] });
        const res = await textSearchWithFallback(adapter, 'knowledge', 'priced experimenting', ['pric', 'experiment']);
        expect(res.items).toEqual([hit]);
    });

    it('respects the limit option in the merged result', async () => {
        const items = Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, title: `note ${i}` }));
        const { adapter } = makeSearchAdapter({ note: items });
        const res = await textSearchWithFallback(adapter, 'knowledge', 'noted things', ['note', 'thing'], { limit: 2 });
        expect(res.items.length).toBe(2);
    });

    it('skips fallback when the only term equals the query', async () => {
        const { adapter, calls } = makeSearchAdapter({});
        const res = await textSearchWithFallback(adapter, 'knowledge', 'deploy', ['deploy']);
        expect(res.items).toEqual([]);
        expect(res.usedFallback).toBe(false);
        expect(calls.length).toBe(1);
    });

    it('survives a throwing term search (returns other-term results)', async () => {
        const hit = { id: 'k1', title: 'tuesday plan' };
        const calls: SearchCall[] = [];
        const adapter = {
            backend: 'markdown',
            async textSearch(collection: string, query: string, options?: unknown) {
                calls.push({ collection, query, options });
                if (query === 'deploy') throw new Error('boom');
                if (query === 'tuesday') return [hit] as never;
                return [] as never;
            },
        } as unknown as DataAdapter;
        const res = await textSearchWithFallback(adapter, 'knowledge', 'deploying tuesdays', ['deploy', 'tuesday']);
        expect(res.items).toEqual([hit]);
        expect(res.usedFallback).toBe(true);
    });

    it('reports usedFallback=false when fallback also finds nothing', async () => {
        const { adapter } = makeSearchAdapter({});
        const res = await textSearchWithFallback(adapter, 'knowledge', 'missing things', ['miss', 'thing']);
        expect(res.items).toEqual([]);
        expect(res.usedFallback).toBe(false);
    });

    it('passes fields/filter/limit through to every call', async () => {
        const { adapter, calls } = makeSearchAdapter({});
        const options = { fields: ['title'], filter: [[{ field: 'type', op: 'eq', value: 'fact' }]], limit: 7 } as never;
        await textSearchWithFallback(adapter, 'knowledge', 'deploying tuesdays', ['deploy', 'tuesday'], options);
        expect(calls.length).toBe(3);
        for (const c of calls) expect(c.options).toEqual(options);
    });
});
