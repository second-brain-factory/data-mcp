/**
 * Ingest runner — walks a path, detects formats, parses files via the
 * registry, dedupes against existing knowledge, and writes records through
 * the adapter. Parsers stay pure; ALL I/O lives here.
 *
 * Dedupe contract (matches knowledge_store): lookup by (type, title) exact,
 * plus owner_scope when the adapter supports it. A sha256 content_hash is
 * stored in metadata so re-ingests of changed files are detected and
 * reported (skipped with changed:true — updating is out of scope v1).
 */

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, sep, basename, extname } from 'node:path';
import type { DataAdapter, FilterClause } from '../adapter/types.js';
import type { IngestItem, FileReport, FileStatus, IngestSummary } from './types.js';
import { detectFormat, detectConvertedFormat, refineJsonFormat, looksBinary, stripBom } from './detect.js';
import { PARSER_REGISTRY } from './registry.js';
import { parseOffice } from './parsers/office.js';
import { createConverter, sanitizeConverted, INSTALL_HINT, type Converter } from './convert.js';
import { generateSummary } from '../tools/shared.js';

export const MAX_FILES = 200;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Chat exports (issue #18): a heavy user's conversations.json easily
 * exceeds 10MB, so files with that exact name get a dedicated cap.
 */
export const CHAT_EXPORT_MAX_BYTES = 200 * 1024 * 1024; // 200MB

const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'dist', '.git']);

export interface IngestOptions {
    /** File or directory to ingest (absolute or cwd-relative) */
    path: string;
    /** Preview without writing (default true at the tool layer) */
    dryRun: boolean;
    /** Passed through to created records when the adapter supports scoping */
    ownerScope?: 'private' | 'shared';
    /** Paths the runner must refuse to ingest (e.g. markdown adapter root) */
    forbiddenRoots?: string[];
    /** Office-document converter (injectable for tests; default markitdown sidecar) */
    converter?: Converter;
}

/** sha256 of normalized (trimmed) content */
export function contentHash(content: string): string {
    return createHash('sha256').update(content.trim()).digest('hex');
}

function isInside(child: string, parent: string): boolean {
    const c = resolve(child);
    const p = resolve(parent);
    return c === p || c.startsWith(p + sep);
}

/** Recursively collect candidate files. Returns [files, capped]. */
async function walk(root: string): Promise<{ files: string[]; capped: boolean }> {
    const stat = await fs.stat(root);
    if (stat.isFile()) return { files: [root], capped: false };

    const files: string[] = [];
    let capped = false;
    const queue: string[] = [root];
    while (queue.length > 0) {
        const dir = queue.shift()!;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            continue; // unreadable dir — skip silently
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!SKIP_DIRS.has(entry.name)) queue.push(full);
                continue;
            }
            if (!entry.isFile()) continue;
            if (files.length >= MAX_FILES) {
                capped = true;
                return { files, capped };
            }
            files.push(full);
        }
    }
    return { files, capped };
}

interface ItemOutcome {
    created: number;
    duplicates: number;
    changed: number;
}

/** Dedupe-aware write of one parsed item. */
async function writeItem(
    adapter: DataAdapter,
    item: IngestItem,
    hash: string,
    format: string,
    sourcePath: string,
    opts: IngestOptions,
    seenTitles: Set<string>,
    outcome: ItemOutcome,
): Promise<void> {
    const title = item.title.trim().slice(0, 500);
    const batchKey = `${item.type}\u0000${title}`;
    if (seenTitles.has(batchKey)) {
        outcome.duplicates++;
        return;
    }
    seenTitles.add(batchKey);

    const dedupFilter: FilterClause[] = [
        { field: 'type', op: 'eq', value: item.type },
        { field: 'title', op: 'eq', value: title },
    ];
    if (adapter.ownerScopeEnabled) {
        dedupFilter.push({ field: 'owner_scope', op: 'eq', value: opts.ownerScope ?? 'private' });
    }
    const existing = await adapter.list('knowledge', {
        filter: [dedupFilter],
        page: { limit: 1, offset: 0 },
    });
    if (existing.items.length > 0) {
        const meta = existing.items[0].metadata as Record<string, unknown> | null | undefined;
        if (meta && typeof meta === 'object' && meta.content_hash !== hash) outcome.changed++;
        outcome.duplicates++;
        return;
    }

    if (!opts.dryRun) {
        await adapter.create('knowledge', {
            type: item.type,
            title,
            content: item.content.slice(0, 10000),
            summary: generateSummary(item.content),
            tags: item.tags.slice(0, 20).map((t) => t.slice(0, 100)),
            source: `ingest:${format}`,
            metadata: {
                source_path: sourcePath,
                content_hash: hash,
                ingested_at: new Date().toISOString(),
                format,
                ...(item.source_meta ?? {}),
            },
            ...(adapter.ownerScopeEnabled ? { owner_scope: opts.ownerScope ?? 'private' } : {}),
            confidence: 0.8,
            last_validated_at: new Date().toISOString(),
        });
    }
    outcome.created++;
}

/**
 * Office documents (issue #17): convert via the markitdown sidecar, sanitize,
 * then run the pure office parser on the resulting markdown. Size/existence
 * checks already happened in processFile; binary sniff is skipped (these
 * files are binary by nature). All converter failures are per-file errors.
 */
async function processConvertedFile(
    adapter: DataAdapter,
    filePath: string,
    format: string,
    opts: IngestOptions,
    seenTitles: Set<string>,
    converter: Converter,
    report: FileReport,
): Promise<FileReport> {
    report.format = format;
    const info = await converter.available();
    if (!info) {
        report.status = 'error';
        report.error = `${format} support requires markitdown — ${INSTALL_HINT}`;
        return report;
    }
    const markdown = sanitizeConverted(await converter.convert(filePath));
    if (markdown.trim().length === 0) {
        report.status = 'skipped_empty';
        return report;
    }
    const ctx = { filePath, baseName: basename(filePath, extname(filePath)), format };
    const items = parseOffice(markdown, ctx);
    if (items.length === 0) {
        report.status = 'skipped_empty';
        return report;
    }
    const outcome: ItemOutcome = { created: 0, duplicates: 0, changed: 0 };
    for (const item of items) {
        const withProvenance = { ...item, source_meta: { ...(item.source_meta ?? {}), converter: info.id } };
        const hash = contentHash(item.content);
        await writeItem(adapter, withProvenance, hash, format, filePath, opts, seenTitles, outcome);
    }
    report.records = outcome.created;
    report.duplicates = outcome.duplicates;
    if (outcome.changed > 0) report.error = `${outcome.changed} record(s) changed since last ingest — not updated (use knowledge_update)`;
    report.status = outcome.created > 0 ? (opts.dryRun ? 'dry_run' : 'created') : 'skipped_duplicate';
    return report;
}

async function processFile(
    adapter: DataAdapter,
    filePath: string,
    opts: IngestOptions,
    seenTitles: Set<string>,
    converter: Converter,
): Promise<FileReport> {
    const report: FileReport = { path: filePath, format: null, status: 'error', records: 0, duplicates: 0 };
    try {
        const stat = await fs.stat(filePath);
        const sizeCap = basename(filePath) === 'conversations.json' ? CHAT_EXPORT_MAX_BYTES : MAX_FILE_BYTES;
        if (stat.size > sizeCap) {
            report.status = 'skipped_too_large';
            return report;
        }
        const convertedFormat = detectConvertedFormat(filePath);
        if (convertedFormat) {
            return await processConvertedFile(adapter, filePath, convertedFormat, opts, seenTitles, converter, report);
        }
        const format = detectFormat(filePath);
        report.format = format;
        if (!format) {
            report.status = 'skipped_unsupported';
            return report;
        }
        const buffer = await fs.readFile(filePath);
        if (looksBinary(buffer.subarray(0, 8192))) {
            report.status = 'skipped_unsupported';
            report.error = 'binary content';
            report.format = null;
            return report;
        }
        const content = stripBom(buffer.toString('utf8'));
        if (content.trim().length === 0) {
            report.status = 'skipped_empty';
            return report;
        }
        // Chat-export refinement (issue #18): both ChatGPT and Claude ship a
        // conversations.json — shape, not extension, picks the parser.
        const effectiveFormat = format === 'json' ? refineJsonFormat(content) : format;
        report.format = effectiveFormat;
        const parser = PARSER_REGISTRY[effectiveFormat];
        const ctx = { filePath, baseName: basename(filePath, extname(filePath)) };
        const items = parser(content, ctx);
        if (items.length === 0) {
            report.status = 'skipped_empty';
            return report;
        }
        const outcome: ItemOutcome = { created: 0, duplicates: 0, changed: 0 };
        for (const item of items) {
            const hash = contentHash(item.content);
            await writeItem(adapter, item, hash, effectiveFormat, filePath, opts, seenTitles, outcome);
        }
        report.records = outcome.created;
        report.duplicates = outcome.duplicates;
        if (outcome.changed > 0) report.error = `${outcome.changed} record(s) changed since last ingest — not updated (use knowledge_update)`;
        report.status = outcome.created > 0 ? (opts.dryRun ? 'dry_run' : 'created') : 'skipped_duplicate';
        return report;
    } catch (error) {
        report.status = 'error';
        report.error = error instanceof Error ? error.message : String(error);
        return report;
    }
}

/** Execute an ingest run. Per-file errors never abort the batch. */
export async function runIngest(adapter: DataAdapter, opts: IngestOptions): Promise<IngestSummary> {
    const target = resolve(opts.path);

    for (const forbidden of opts.forbiddenRoots ?? []) {
        if (forbidden && (isInside(target, forbidden) || isInside(forbidden, target))) {
            throw new Error(`Refusing to ingest '${target}': it overlaps the brain's own storage at '${resolve(forbidden)}'.`);
        }
    }

    // Existence check up front so the tool can return a clean error
    await fs.stat(target);

    const { files, capped } = await walk(target);
    const converter = opts.converter ?? createConverter();
    const seenTitles = new Set<string>();
    const reports: FileReport[] = [];
    for (const file of files) {
        reports.push(await processFile(adapter, file, opts, seenTitles, converter));
    }

    const count = (statuses: FileStatus[]) => reports.filter((r) => statuses.includes(r.status)).length;
    return {
        dry_run: opts.dryRun,
        files_scanned: reports.length,
        files_ingested: count(['created', 'dry_run']),
        files_skipped: count(['skipped_duplicate', 'skipped_unsupported', 'skipped_too_large', 'skipped_empty']),
        files_errored: count(['error']),
        records_created: reports.reduce((n, r) => n + r.records, 0),
        records_deduplicated: reports.reduce((n, r) => n + r.duplicates, 0),
        capped,
        reports,
    };
}
