/**
 * Tests for workspace-export ingestion (issue #19), Slice 1: Evernote ENEX
 * and Google Keep parsers, plus the refineJsonFormat keep extension and
 * runner integration (detection, dedupe, archived/trashed skipping).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataAdapter, Filter, ListResult } from '../src/adapter/types.js';
import { parseEnex } from '../src/ingest/parsers/enex.js';
import { parseKeep } from '../src/ingest/parsers/keep.js';
import { detectFormat, refineJsonFormat } from '../src/ingest/detect.js';
import { runIngest } from '../src/ingest/runner.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ingest-workspace');
const ctx = (baseName = 'doc') => ({ filePath: `/tmp/${baseName}`, baseName });

function makeMemoryAdapter() {
    const records: Array<Record<string, unknown>> = [];
    const adapter = {
        backend: 'markdown',
        async create(_collection: string, data: Record<string, unknown>) {
            const rec = { id: `r${records.length + 1}`, ...data };
            records.push(rec);
            return rec;
        },
        async getOne(_c: string, id: string) { return { id }; },
        async list(_collection: string, options?: { filter?: Filter }): Promise<ListResult<Record<string, unknown>>> {
            const groups = options?.filter ?? [];
            const items = records.filter((r) =>
                groups.length === 0 || groups.some((clauses) => clauses.every((c) => r[c.field] === c.value)));
            return { items, totalItems: items.length, page: 1, perPage: 20 };
        },
        async textSearch() { return []; },
        async update(_c: string, id: string, data: Record<string, unknown>) { return { id, ...data }; },
        async delete() { },
        async upsert() { throw new Error('not used'); },
        async count() { return records.length; },
        async collectionExists() { return true; },
        async listCollections() { return ['knowledge']; },
        ownerScopeEnabled: false,
    } as unknown as DataAdapter;
    return { adapter, records };
}

describe('detectFormat .enex', () => {
    it('maps .enex to the enex format', () => {
        expect(detectFormat('notes.enex')).toBe('enex');
        expect(detectFormat('Notes.ENEX')).toBe('enex');
    });
});

describe('parseEnex (AC5)', () => {
    it('multi-note file -> one record per note with tags and dates', async () => {
        const content = await readFile(join(FIXTURES, 'notes.enex'), 'utf8');
        const items = parseEnex(content, ctx('notes'));
        expect(items).toHaveLength(3);
        const sourdough = items.find((i) => i.title === 'Sourdough hydration experiments')!;
        expect(sourdough.tags).toEqual(['evernote', 'baking', 'experiments']);
        expect(sourdough.type).toBe('reference');
        expect(sourdough.source_meta?.note_date).toBe('2024-01-15T09:30:00.000Z');
    });

    it('decodes HTML entities in ENML content', async () => {
        const content = await readFile(join(FIXTURES, 'notes.enex'), 'utf8');
        const items = parseEnex(content, ctx('notes'));
        const sourdough = items.find((i) => i.title === 'Sourdough hydration experiments')!;
        expect(sourdough.content).toContain('70% & 75% to 80%');
        expect(sourdough.content).toContain('at >78% hydration');
        const pasta = items.find((i) => i.title === 'Pasta machine settings')!;
        expect(pasta.content).toContain('setting 6 for tagliatelle \u2014 setting 7');
        expect(pasta.content).toContain('00 flour only');
    });

    it('untitled notes get a deterministic fallback title', async () => {
        const content = await readFile(join(FIXTURES, 'notes.enex'), 'utf8');
        const items = parseEnex(content, ctx('notes'));
        const untitled = items.find((i) => i.title === 'notes — untitled note')!;
        expect(untitled.content).toContain('Note without a title');
    });

    it('no <note> blocks or empty content -> no items', () => {
        expect(parseEnex('<en-export></en-export>', ctx())).toHaveLength(0);
        expect(parseEnex('<note><title>Empty</title><content><![CDATA[]]></content></note>', ctx())).toHaveLength(0);
    });
});

describe('refineJsonFormat keep extension', () => {
    it('sniffs keep notes without disturbing chat-export/array shapes', async () => {
        const keep = await readFile(join(FIXTURES, 'keep', 'olive-oil-supplier.json'), 'utf8');
        expect(refineJsonFormat(keep)).toBe('keep');
        // object without the vendor key stays generic
        expect(refineJsonFormat('{"title": "x", "textContent": "y"}')).toBe('json');
        // arrays keep their existing classification path
        expect(refineJsonFormat('[{"name": "plain"}]')).toBe('json');
        expect(refineJsonFormat('[{"chat_messages": []}]')).toBe('claude');
    });
});

describe('parseKeep (AC4)', () => {
    it('labels -> tags; date from userEditedTimestampUsec', async () => {
        const content = await readFile(join(FIXTURES, 'keep', 'olive-oil-supplier.json'), 'utf8');
        const items = parseKeep(content, ctx('olive-oil-supplier'));
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('Olive oil supplier');
        expect(items[0].tags).toEqual(['keep', 'food', 'suppliers']);
        expect(items[0].content).toContain('co-op in Puglia');
        expect(items[0].source_meta?.note_date).toBe('2024-06-12T08:20:00.000Z');
    });

    it('list notes render checkbox lines', async () => {
        const content = await readFile(join(FIXTURES, 'keep', 'weekend-market-list.json'), 'utf8');
        const items = parseKeep(content, ctx('weekend-market-list'));
        expect(items).toHaveLength(1);
        expect(items[0].content).toContain('- [x] Burrata');
        expect(items[0].content).toContain('- [ ] San Marzano tomatoes');
    });

    it('archived and trashed notes are skipped', async () => {
        const archived = await readFile(join(FIXTURES, 'keep', 'old-archived-idea.json'), 'utf8');
        const trashed = await readFile(join(FIXTURES, 'keep', 'deleted-scratch-note.json'), 'utf8');
        expect(parseKeep(archived, ctx())).toHaveLength(0);
        expect(parseKeep(trashed, ctx())).toHaveLength(0);
    });

    it('empty note -> no items; missing title falls back to baseName', () => {
        expect(parseKeep('{"userEditedTimestampUsec": 1, "textContent": ""}', ctx())).toHaveLength(0);
        const items = parseKeep('{"userEditedTimestampUsec": 1718180400000000, "textContent": "body"}', ctx('my-note'));
        expect(items[0].title).toBe('my-note');
    });
});

describe('runIngest workspace Slice 1 (AC1, AC7)', () => {
    it('ingests the keep directory: 2 records, archived/trashed skipped as empty', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'keep'), dryRun: false });
        expect(summary.files_scanned).toBe(4);
        expect(summary.records_created).toBe(2);
        expect(summary.files_errored).toBe(0);
        const empties = summary.reports.filter((r) => r.status === 'skipped_empty');
        expect(empties).toHaveLength(2);
        expect(records.every((r) => (r.source as string) === 'ingest:keep')).toBe(true);
        expect(records.some((r) => (r.content as string).includes('ARCHIVED-NOTE-MARKER'))).toBe(false);
        expect(records.some((r) => (r.content as string).includes('TRASHED-NOTE-MARKER'))).toBe(false);
    });

    it('ingests the enex file with source ingest:enex and dedupes on re-ingest', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const first = await runIngest(adapter, { path: join(FIXTURES, 'notes.enex'), dryRun: false });
        expect(first.records_created).toBe(3);
        expect(records[0].source).toBe('ingest:enex');
        const again = await runIngest(adapter, { path: join(FIXTURES, 'notes.enex'), dryRun: false });
        expect(again.records_created).toBe(0);
        expect(again.records_deduplicated).toBe(3);
    });
});
