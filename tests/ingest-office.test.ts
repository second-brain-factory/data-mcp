/**
 * Unit tests for office-document ingestion (issue #17): the converter
 * sidecar seam (detection caching, timeout, error surfacing), markdown
 * sanitization, the pure office parser on captured markitdown output
 * shapes (v0.1.6), and runner integration with an injected fake converter.
 *
 * No real markitdown required — the real-converter path is covered by
 * scripts/ingest-office-e2e.mjs in CI.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataAdapter, Filter, ListResult } from '../src/adapter/types.js';
import { createConverter, sanitizeConverted, INSTALL_HINT, CONVERT_TIMEOUT_MS, type ExecImpl, type Converter } from '../src/ingest/convert.js';
import { parseOffice } from '../src/ingest/parsers/office.js';
import { detectConvertedFormat } from '../src/ingest/detect.js';
import { runIngest } from '../src/ingest/runner.js';

/** In-memory knowledge store honoring the (type,title) dedupe filter. */
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

/** Fake Converter for runner tests — no child processes. */
function fakeConverter(output: string | ((path: string) => string), opts: { unavailable?: boolean; failWith?: string } = {}): Converter {
    return {
        async available() {
            return opts.unavailable ? null : { id: 'markitdown@9.9.9', command: 'fake', prefixArgs: [] };
        },
        async convert(filePath: string) {
            if (opts.failWith) throw new Error(opts.failWith);
            return typeof output === 'function' ? output(filePath) : output;
        },
    };
}

// Captured markitdown v0.1.6 output shapes
const XLSX_MD = '## Revenue\n| Q | Amount |\n| --- | --- |\n| Q1 | 100 |\n\n## Costs\n| Q | Amount |\n| --- | --- |\n| Q1 | 40 |\n';
const PPTX_MD = '<!-- Slide number: 1 -->\n# Welcome\nIntro line\n\n<!-- Slide number: 2 -->\n# Roadmap\nShip office ingest\n';
const DOCX_MD = '# Report\n\nSummary paragraph.\n\n## Findings\n\nDetail text here.\n';

describe('createConverter', () => {
    it('caches detection: --version probed once across many calls (AC3)', async () => {
        const exec = vi.fn<Parameters<ExecImpl>, ReturnType<ExecImpl>>(async (_cmd, args) => {
            if (args[args.length - 1] === '--version') return { stdout: 'markitdown 0.1.6\n', stderr: '' };
            return { stdout: '# Doc\n\nbody', stderr: '' };
        });
        const converter = createConverter(exec as unknown as ExecImpl);
        const info = await converter.available();
        expect(info?.id).toBe('markitdown@0.1.6');
        await converter.convert('/tmp/a.pdf');
        await converter.convert('/tmp/b.pdf');
        await converter.available();
        const versionCalls = exec.mock.calls.filter((c) => c[1][c[1].length - 1] === '--version');
        expect(versionCalls).toHaveLength(1);
    });

    it('falls back to uvx when markitdown is not on PATH', async () => {
        const exec: ExecImpl = async (cmd, args) => {
            if (cmd === 'markitdown') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
            if (args[args.length - 1] === '--version') return { stdout: 'markitdown 0.1.6', stderr: '' };
            return { stdout: 'converted', stderr: '' };
        };
        const info = await createConverter(exec).available();
        expect(info?.command).toBe('uvx');
        expect(info?.prefixArgs).toEqual(['--from', 'markitdown[all]', 'markitdown']);
    });

    it('returns null when no candidate works; convert throws install hint (AC2)', async () => {
        const exec: ExecImpl = async () => { throw new Error('ENOENT'); };
        const converter = createConverter(exec);
        expect(await converter.available()).toBeNull();
        await expect(converter.convert('/tmp/a.pdf')).rejects.toThrow(INSTALL_HINT);
    });

    it('maps SIGKILL/timeout to a clear timeout error (AC4)', async () => {
        const exec: ExecImpl = async (_cmd, args) => {
            if (args[args.length - 1] === '--version') return { stdout: 'markitdown 0.1.6', stderr: '' };
            throw Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' });
        };
        await expect(createConverter(exec).convert('/tmp/slow.pdf'))
            .rejects.toThrow(`conversion timed out after ${CONVERT_TIMEOUT_MS / 1000}s`);
    });

    it('surfaces the stderr tail (last 3 lines) on conversion failure', async () => {
        const exec: ExecImpl = async (_cmd, args) => {
            if (args[args.length - 1] === '--version') return { stdout: 'markitdown 0.1.6', stderr: '' };
            throw Object.assign(new Error('exit 1'), { stderr: 'Traceback\nline one\nline two\nValueError: bad pdf\n' });
        };
        await expect(createConverter(exec).convert('/tmp/bad.pdf'))
            .rejects.toThrow(/conversion failed: .*ValueError: bad pdf/);
    });
});

describe('sanitizeConverted', () => {
    it('strips script/iframe/object/embed/style blocks (AC5)', () => {
        const dirty = 'Before\n<script>alert(1)</script>\n<iframe src="https://evil"></iframe>\n<style>p{}</style>\nAfter';
        const clean = sanitizeConverted(dirty);
        expect(clean).not.toContain('<script');
        expect(clean).not.toContain('<iframe');
        expect(clean).not.toContain('<style');
        expect(clean).toContain('Before');
        expect(clean).toContain('After');
    });

    it('strips on* handlers and javascript: links', () => {
        const dirty = '<img src="x" onerror="alert(1)">\n[click](javascript:alert(1))';
        const clean = sanitizeConverted(dirty);
        expect(clean).not.toContain('onerror');
        expect(clean).not.toContain('javascript:alert');
    });
});

describe('parseOffice', () => {
    const ctx = (format: string) => ({ filePath: `/tmp/doc.${format}`, baseName: 'doc', format });

    it('xlsx: one record per sheet with source_meta.sheet (AC6)', () => {
        const items = parseOffice(XLSX_MD, ctx('xlsx'));
        expect(items).toHaveLength(2);
        expect(items[0].title).toBe('doc — Revenue');
        expect(items[0].source_meta).toEqual({ sheet: 'Revenue' });
        expect(items[1].title).toBe('doc — Costs');
        expect(items[1].source_meta).toEqual({ sheet: 'Costs' });
    });

    it('pptx: one record per slide with heading-derived titles', () => {
        const items = parseOffice(PPTX_MD, ctx('pptx'));
        expect(items).toHaveLength(2);
        expect(items[0].title).toBe('doc — Slide 1 (Welcome)');
        expect(items[0].source_meta).toEqual({ slide: 1 });
        expect(items[0].content).toContain('Intro line');
        expect(items[1].title).toBe('doc — Slide 2 (Roadmap)');
    });

    it('pptx with no slide markers falls back to section split', () => {
        const items = parseOffice(DOCX_MD, ctx('pptx'));
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].title).toBe('doc');
    });

    it('docx/pdf: small docs stay whole under the base title', () => {
        const items = parseOffice(DOCX_MD, ctx('docx'));
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('doc');
        expect(items[0].content).toContain('Summary paragraph.');
        expect(items[0].content).toContain('Detail text here.');
    });

    it('docx/pdf: large docs split per section', () => {
        const big = `# Doc\n\n## Alpha\n\n${'a'.repeat(3000)}\n\n## Beta\n\n${'b'.repeat(3000)}\n`;
        const items = parseOffice(big, ctx('pdf'));
        expect(items.length).toBeGreaterThanOrEqual(2);
        expect(items.some((i) => i.title === 'doc — Alpha')).toBe(true);
        expect(items.some((i) => i.title === 'doc — Beta')).toBe(true);
    });

    it('empty markdown yields no items', () => {
        expect(parseOffice('', ctx('pdf'))).toHaveLength(0);
        expect(parseOffice('   \n', ctx('xlsx'))).toHaveLength(0);
    });
});

describe('detectConvertedFormat', () => {
    it('maps advertised and legacy extensions, rejects others', () => {
        expect(detectConvertedFormat('/x/a.PDF')).toBe('pdf');
        expect(detectConvertedFormat('/x/a.docx')).toBe('docx');
        expect(detectConvertedFormat('/x/a.xlsx')).toBe('xlsx');
        expect(detectConvertedFormat('/x/a.pptx')).toBe('pptx');
        expect(detectConvertedFormat('/x/a.epub')).toBe('epub');
        expect(detectConvertedFormat('/x/a.doc')).toBe('doc');
        expect(detectConvertedFormat('/x/a.md')).toBeNull();
        expect(detectConvertedFormat('/x/a.png')).toBeNull();
    });
});

describe('runIngest with office files', () => {
    async function withDir(fn: (dir: string) => Promise<void>) {
        const dir = await mkdtemp(join(tmpdir(), 'ingest-office-'));
        try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
    }

    it('converter unavailable: per-file error with install hint, batch continues (AC2)', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'report.pdf'), Buffer.from('%PDF-1.4 fake'));
            await writeFile(join(dir, 'good.txt'), 'plain text still works');
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: false, converter: fakeConverter('', { unavailable: true }) });
            expect(summary.files_errored).toBe(1);
            expect(summary.files_ingested).toBe(1);
            const pdfReport = summary.reports.find((r) => r.path.endsWith('report.pdf'));
            expect(pdfReport?.status).toBe('error');
            expect(pdfReport?.error).toContain('pdf support requires markitdown');
            expect(pdfReport?.error).toContain("pip install 'markitdown[all]'");
            expect(records).toHaveLength(1);
            expect(records[0].title).toBe('good');
        });
    });

    it('converts and stores office records with provenance metadata', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'finance.xlsx'), Buffer.from('PK fake xlsx'));
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: false, converter: fakeConverter(XLSX_MD) });
            expect(summary.files_ingested).toBe(1);
            expect(summary.records_created).toBe(2);
            expect(records[0].source).toBe('ingest:xlsx');
            const meta = records[0].metadata as Record<string, unknown>;
            expect(meta.format).toBe('xlsx');
            expect(meta.converter).toBe('markitdown@9.9.9');
            expect(meta.sheet).toBe('Revenue');
        });
    });

    it('re-ingest of a converted file is idempotent (AC9)', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'deck.pptx'), Buffer.from('PK fake pptx'));
            const { adapter, records } = makeMemoryAdapter();
            const converter = fakeConverter(PPTX_MD);
            const first = await runIngest(adapter, { path: dir, dryRun: false, converter });
            const after = records.length;
            const second = await runIngest(adapter, { path: dir, dryRun: false, converter });
            expect(records.length).toBe(after);
            expect(second.records_created).toBe(0);
            expect(second.records_deduplicated).toBe(first.records_created);
        });
    });

    it('sanitizes converted markdown before parsing (AC5)', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'evil.docx'), Buffer.from('PK fake docx'));
            const { adapter, records } = makeMemoryAdapter();
            await runIngest(adapter, {
                path: dir, dryRun: false,
                converter: fakeConverter('# Doc\n\nSafe text\n<script>alert(1)</script>\nmore'),
            });
            expect(records).toHaveLength(1);
            expect(records[0].content).not.toContain('<script');
            expect(records[0].content).toContain('Safe text');
        });
    });

    it('empty conversion output is skipped_empty', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'blank.pdf'), Buffer.from('%PDF fake'));
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: false, converter: fakeConverter('   \n') });
            expect(summary.reports[0].status).toBe('skipped_empty');
            expect(records).toHaveLength(0);
        });
    });

    it('conversion failure is a per-file error that does not abort the batch', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'bad.pdf'), Buffer.from('%PDF fake'));
            await writeFile(join(dir, 'note.md'), '# Note\n\nfine');
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, {
                path: dir, dryRun: false,
                converter: fakeConverter('', { failWith: 'conversion failed: ValueError: corrupt' }),
            });
            const bad = summary.reports.find((r) => r.path.endsWith('bad.pdf'));
            expect(bad?.status).toBe('error');
            expect(bad?.error).toContain('ValueError: corrupt');
            expect(records.some((r) => r.title === 'note')).toBe(true);
        });
    });

    it('dry_run previews office records without writing', async () => {
        await withDir(async (dir) => {
            await writeFile(join(dir, 'deck.pptx'), Buffer.from('PK fake'));
            const { adapter, records } = makeMemoryAdapter();
            const summary = await runIngest(adapter, { path: dir, dryRun: true, converter: fakeConverter(PPTX_MD) });
            expect(summary.records_created).toBe(2);
            expect(summary.reports[0].status).toBe('dry_run');
            expect(records).toHaveLength(0);
        });
    });
});
