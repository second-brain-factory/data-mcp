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
import { parseNotionMd, parseNotionDb, stripNotionId, stripNotionLinks } from '../src/ingest/parsers/notion.js';
import { parseSlackDay, renderSlackText } from '../src/ingest/parsers/slack.js';
import { detectExportKind, buildSlackUserMap } from '../src/ingest/export-context.js';
import { detectFormat, refineJsonFormat, refinePathFormat } from '../src/ingest/detect.js';
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

describe('refinePathFormat (Notion detection)', () => {
    it.each([
        ['Roadmap b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6.md', 'notion'],
        ['Tasks c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6.csv', 'notion-db'],
        ['Tasks c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6_all.csv', 'notion-db-all'],
        ['plain-notes.md', null],
        ['data.csv', null],
        ['Roadmap b1c2.md', null], // too-short hex is not a Notion ID
    ])('%s -> %s', (name, expected) => {
        expect(refinePathFormat(name)).toBe(expected);
    });
});

describe('parseNotionMd (AC2)', () => {
    const notionCtx = {
        filePath: '/tmp/x/Roadmap b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6.md',
        baseName: 'Roadmap b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
        relPath: 'Projects a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/Roadmap b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6.md',
    };

    it('strips the ID suffix from the title and folder tags', () => {
        const items = parseNotionMd('# Roadmap\n\nShip it.', notionCtx);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('Roadmap');
        expect(items[0].tags).toEqual(['notion', 'projects']);
    });

    it('strips ID suffixes from link text AND targets', () => {
        const body = 'See [Launch checklist 9f8e7d6c5b4a39281706f5e4d3c2b1a0](Launch%20checklist%209f8e7d6c5b4a39281706f5e4d3c2b1a0.md).';
        const items = parseNotionMd(body, notionCtx);
        expect(items[0].content).toContain('[Launch checklist](Launch%20checklist.md)');
        expect(items[0].content).not.toMatch(/[0-9a-f]{32}/);
    });

    it('works without relPath (single file outside an export dir)', () => {
        const items = parseNotionMd('content', { filePath: notionCtx.filePath, baseName: notionCtx.baseName });
        expect(items[0].title).toBe('Roadmap');
        expect(items[0].tags).toEqual(['notion']);
    });

    it('stripNotionId keeps names that are only an ID', () => {
        expect(stripNotionId('Roadmap b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6')).toBe('Roadmap');
        expect(stripNotionId('plain name')).toBe('plain name');
    });

    it('stripNotionLinks leaves non-Notion links alone', () => {
        const s = 'A [normal link](https://example.com/page) here.';
        expect(stripNotionLinks(s)).toBe(s);
    });
});

describe('parseNotionDb (AC2)', () => {
    const dbCtx = {
        filePath: '/tmp/x/Tasks c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6.csv',
        baseName: 'Tasks c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
    };

    it('one labeled record per row, titled by first column', () => {
        const csv = 'Name,Status,Notes\nWrite landing page,Done,Copy reviewed\nSet up analytics,In progress,\n';
        const items = parseNotionDb(csv, dbCtx);
        expect(items).toHaveLength(2);
        expect(items[0].title).toBe('Tasks — Write landing page');
        expect(items[0].content).toBe('Name: Write landing page\nStatus: Done\nNotes: Copy reviewed');
        expect(items[0].tags).toEqual(['notion', 'database', 'tasks']);
        expect(items[1].content).not.toContain('Notes:'); // empty cells omitted
    });

    it('empty first column falls back to Row N title', () => {
        const csv = 'Name,Status\n,Done\n';
        const items = parseNotionDb(csv, dbCtx);
        expect(items[0].title).toBe('Tasks — Row 1');
    });
});

describe('runIngest Notion export (AC1, AC2)', () => {
    it('ingests pages + DB rows; _all.csv duplicate skipped', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'notion'), dryRun: false });
        expect(summary.files_scanned).toBe(3);
        expect(summary.files_errored).toBe(0);
        expect(summary.records_created).toBe(4); // 1 page + 3 db rows

        const page = records.find((r) => r.title === 'Roadmap')!;
        expect(page.source).toBe('ingest:notion');
        expect(page.tags).toEqual(['notion', 'projects']);
        expect(page.content as string).toContain('[Launch checklist](Launch%20checklist.md)');
        expect(page.content as string).not.toMatch(/[0-9a-f]{32}/);

        const row = records.find((r) => r.title === 'Tasks — Write landing page')!;
        expect(row.source).toBe('ingest:notion-db');

        expect(records.some((r) => (r.content as string).includes('ALL-CSV-DUPLICATE-MARKER'))).toBe(false);
        const allCsvReport = summary.reports.find((r) => r.path.endsWith('_all.csv'))!;
        expect(allCsvReport.status).toBe('skipped_duplicate');
    });

    it('re-ingest dedupes (AC7)', async () => {
        const { adapter } = makeMemoryAdapter();
        await runIngest(adapter, { path: join(FIXTURES, 'notion'), dryRun: false });
        const again = await runIngest(adapter, { path: join(FIXTURES, 'notion'), dryRun: false });
        expect(again.records_created).toBe(0);
        expect(again.records_deduplicated).toBe(4);
    });
});

describe('detectExportKind (AC6 detection matrix)', () => {
    it('classifies slack, notion, and plain directories', () => {
        expect(detectExportKind(['users.json', 'channels.json', 'general/2024-06-12.json'])).toBe('slack');
        expect(detectExportKind(['Projects abc/Roadmap b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6.md'])).toBe('notion');
        expect(detectExportKind(['notes.md', 'data.csv', 'export.json'])).toBe(null);
        // day-file-shaped path without slack metadata stays plain (AC: matrix)
        expect(detectExportKind(['general/2024-06-12.json'])).toBe(null);
        // users.json alone is not a slack export
        expect(detectExportKind(['users.json', 'general/2024-06-12.json'])).toBe(null);
    });
});

describe('buildSlackUserMap', () => {
    it('prefers display_name, falls back to real_name then name; tolerates garbage', () => {
        const map = buildSlackUserMap([
            { id: 'U1', name: 'ana', profile: { display_name: 'ana-d', real_name: 'Ana K' } },
            { id: 'U2', name: 'marco', profile: { display_name: '', real_name: 'Marco Rossi' } },
            { id: 'U3', name: 'plain' },
            { noid: true },
        ]);
        expect(map.get('U1')).toBe('ana-d');
        expect(map.get('U2')).toBe('Marco Rossi');
        expect(map.get('U3')).toBe('plain');
        expect(buildSlackUserMap('not an array').size).toBe(0);
    });
});

describe('renderSlackText', () => {
    it('resolves mentions, channels, links, and entities', () => {
        const users = new Map([['U1', 'ana']]);
        expect(renderSlackText('hi <@U1> see <#C9|general> at <https://x.io/a|the doc> or <https://y.io> &lt;3 &amp; more', users))
            .toBe('hi @ana see #general at the doc (https://x.io/a) or https://y.io <3 & more');
        expect(renderSlackText('<@U9> unknown', users)).toBe('@U9 unknown');
    });
});

describe('parseSlackDay (AC3)', () => {
    const slackCtx = (relPath: string, users?: Map<string, string>) => ({
        filePath: `/tmp/export/${relPath}`,
        baseName: relPath.split('/').pop()!.replace(/\.json$/, ''),
        relPath,
        export: { kind: 'slack' as const, users },
    });

    it('groups thread replies under their parent with resolved names', async () => {
        const content = await readFile(join(FIXTURES, 'slack', 'general', '2024-06-12.json'), 'utf8');
        const users = new Map([['U01AAA111', 'ana'], ['U02BBB222', 'Marco Rossi']]);
        const items = parseSlackDay(content, slackCtx('general/2024-06-12.json', users));
        expect(items).toHaveLength(1);
        const c = items[0].content;
        expect(items[0].title).toBe('#general 2024-06-12');
        expect(items[0].tags).toEqual(['slack', '#general']);
        expect(items[0].source_meta?.date).toBe('2024-06-12');
        expect(c).toContain('ana: Heads up @Marco Rossi');
        expect(c).toContain('the staging deploy for <v2>'); // entities unescaped
        expect(c).toContain('↳ Marco Rossi: On it, running it now'); // reply grouped
        expect(c).toContain('release notes (https://example.com/release)');
        expect(c).not.toContain('has joined the channel'); // join noise skipped
        // thread replies appear before the later top-level message
        expect(c.indexOf('On it, running it now')).toBeLessThan(c.indexOf('lunch at the pasta place'));
    });

    it('join/leave-only day file yields no items', async () => {
        const content = await readFile(join(FIXTURES, 'slack', 'random', '2024-06-13.json'), 'utf8');
        const items = parseSlackDay(content, slackCtx('random/2024-06-13.json'));
        expect(items).toHaveLength(0);
    });

    it('unknown user IDs fall back to the raw ID', async () => {
        const content = await readFile(join(FIXTURES, 'slack', 'general', '2024-06-12.json'), 'utf8');
        const items = parseSlackDay(content, slackCtx('general/2024-06-12.json'));
        expect(items[0].content).toContain('U01AAA111: Heads up @U02BBB222');
    });

    it('non-array JSON yields no items', () => {
        expect(parseSlackDay('{"messages": []}', slackCtx('general/2024-06-12.json'))).toHaveLength(0);
    });
});

describe('runIngest slack export (AC1, AC3, AC6, AC7)', () => {
    it('ingests day files with resolved users; metadata files skipped', async () => {
        const { adapter, records } = makeMemoryAdapter();
        const summary = await runIngest(adapter, { path: join(FIXTURES, 'slack'), dryRun: false });
        expect(summary.files_scanned).toBe(4);
        expect(summary.files_errored).toBe(0);
        expect(summary.records_created).toBe(1); // general day; random day is join/leave-only

        const day = records.find((r) => r.title === '#general 2024-06-12')!;
        expect(day.source).toBe('ingest:slack');
        expect(day.tags).toEqual(['slack', '#general']);
        expect(day.content as string).toContain('ana: Heads up @Marco Rossi'); // users.json loaded by runner

        const metaReports = summary.reports.filter((r) => r.error === 'slack export metadata');
        expect(metaReports).toHaveLength(2); // users.json + channels.json
        expect(records.some((r) => (r.content as string).includes('"id"'))).toBe(false);
    });

    it('re-ingest dedupes; same-named day file OUTSIDE a slack export stays generic json (AC6)', async () => {
        const { adapter } = makeMemoryAdapter();
        await runIngest(adapter, { path: join(FIXTURES, 'slack'), dryRun: false });
        const again = await runIngest(adapter, { path: join(FIXTURES, 'slack'), dryRun: false });
        expect(again.records_created).toBe(0);
        expect(again.records_deduplicated).toBe(1);

        // single day file ingested directly (no export root) -> generic json
        const { adapter: a2 } = makeMemoryAdapter();
        const single = await runIngest(a2, { path: join(FIXTURES, 'slack', 'general', '2024-06-12.json'), dryRun: false });
        expect(single.reports[0].format).toBe('json');
    });
});

describe('export-context file cap (AC8)', () => {
    it('a recognized export raises the cap beyond MAX_FILES; capped surfaced honestly', async () => {
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const dir = await mkdtemp(join(tmpdir(), 'ingest-export-cap-'));
        try {
            // Synthetic Notion export with 250 pages (> MAX_FILES=200)
            const hex = (n: number) => n.toString(16).padStart(32, '0');
            for (let i = 0; i < 250; i++) {
                await writeFile(join(dir, `Page ${i} ${hex(i)}.md`), `Content of page ${i}.`);
            }
            const { adapter } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: true });
            expect(summary.files_scanned).toBe(250); // beyond the plain-dir cap
            expect(summary.capped).toBe(false);
            expect(summary.records_created).toBe(250);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 30000);

    it('plain directories keep the MAX_FILES cap', async () => {
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const dir = await mkdtemp(join(tmpdir(), 'ingest-plain-cap-'));
        try {
            for (let i = 0; i < 220; i++) {
                await writeFile(join(dir, `note-${String(i).padStart(3, '0')}.md`), `Note ${i}.`);
            }
            const { adapter } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: true });
            expect(summary.files_scanned).toBe(200);
            expect(summary.capped).toBe(true);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    }, 30000);
});

describe('Takeout Docs route through existing parsers (PRD scope note)', () => {
    it('an exported-Doc html file ingests via the Phase-1 html parser', async () => {
        const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
        const { tmpdir } = await import('node:os');
        const dir = await mkdtemp(join(tmpdir(), 'ingest-takeout-'));
        try {
            await writeFile(join(dir, 'Meeting notes.html'),
                '<html><head><title>Meeting notes</title></head><body><p>Decided to ship v2 in July.</p></body></html>');
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: false });
            expect(summary.records_created).toBe(1);
            expect(records[0].title).toBe('Meeting notes');
            expect(records[0].source).toBe('ingest:html');
            expect(records[0].content as string).toContain('ship v2 in July');
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
