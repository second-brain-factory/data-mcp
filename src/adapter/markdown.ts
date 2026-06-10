/**
 * Markdown adapter — stores records as YAML-frontmatter markdown files.
 *
 * Per-collection layout:
 *   <root>/<collection>/<id>.md
 *
 * Soft-deletes move files to <root>/_archive/<collection>/<id>.md.
 *
 * No external YAML library — we ship a minimal frontmatter parser inline
 * to avoid a new dependency. The frontmatter format we support is a strict
 * subset of YAML (scalar key:value, string arrays, simple lists). Anything
 * the brain writes via this adapter is round-trippable; arbitrary
 * hand-edited YAML is best-effort.
 *
 * Spec: docs/prds/active/PRD-SB3-DUAL-MODE-A3-DATA-MCP-MARKDOWN.md
 * (factory-dev repo)
 */

import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AdapterError } from '../errors/adapter-error.js';
import type { DataAdapter, ListResult, PageOptions, SortClause, Filter, FilterClause } from './types.js';

export class MarkdownAdapter implements DataAdapter {
    private root: string;
    readonly backend: 'markdown' = 'markdown';

    constructor(root: string) {
        if (!root) {
            throw new AdapterError('config' as never, 'MarkdownAdapter requires a non-empty root path');
        }
        this.root = root;
    }

    private collectionDir(collection: string): string {
        validateName(collection, 'collection');
        return join(this.root, collection);
    }

    private recordPath(collection: string, id: string): string {
        validateName(id, 'id');
        return join(this.collectionDir(collection), `${id}.md`);
    }

    private async ensureCollection(collection: string): Promise<void> {
        await fs.mkdir(this.collectionDir(collection), { recursive: true });
    }

    private async readRecord(collection: string, id: string): Promise<Record<string, unknown>> {
        let raw;
        try {
            raw = await fs.readFile(this.recordPath(collection, id), 'utf8');
        }
        catch (err: any) {
            if (err && err.code === 'ENOENT') {
                throw new AdapterError('not_found' as never, `record ${collection}/${id} not found`);
            }
            throw new AdapterError('io' as never, `failed to read ${collection}/${id}: ${err?.message || err}`);
        }
        const { frontmatter, body } = parseFrontmatter(raw);
        return { ...frontmatter, id, body };
    }

    private async writeRecord(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
        await this.ensureCollection(collection);
        const { body = '', id: _ignored, ...frontmatter } = data;
        const payload = stringifyFrontmatter({ ...frontmatter, id }, String(body ?? ''));
        try {
            await fs.writeFile(this.recordPath(collection, id), payload, 'utf8');
        }
        catch (err: any) {
            throw new AdapterError('io' as never, `failed to write ${collection}/${id}: ${err?.message || err}`);
        }
    }

    async create<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>): Promise<T> {
        const id = ((data.id as string | undefined) && String(data.id)) || randomUUID();
        validateName(id, 'id');
        const now = new Date().toISOString();
        const record = {
            ...data,
            id,
            created: (data.created as string | undefined) || now,
            updated: now,
        };
        await this.writeRecord(collection, id, record);
        return record as unknown as T;
    }

    async getOne<T extends Record<string, unknown>>(collection: string, id: string): Promise<T> {
        return this.readRecord(collection, id) as Promise<T>;
    }

    async list<T extends Record<string, unknown>>(collection: string, options: {
        filter?: Filter;
        sort?: SortClause[];
        page?: PageOptions;
    } = {}): Promise<ListResult<T>> {
        const dir = this.collectionDir(collection);
        const limit = options.page?.limit ?? 50;
        const offset = options.page?.offset ?? 0;
        let entries;
        try {
            entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
        }
        catch (err: any) {
            if (err && err.code === 'ENOENT') {
                return { items: [], totalItems: 0, page: 0, perPage: limit };
            }
            throw new AdapterError('io' as never, `failed to list ${collection}: ${err?.message || err}`);
        }
        const all: Record<string, unknown>[] = [];
        for (const f of entries) {
            const id = basename(f, '.md');
            try {
                all.push(await this.readRecord(collection, id));
            }
            catch {
                // Skip malformed file, continue
            }
        }
        const filtered = options.filter ? applyFilter(all, options.filter) : all;
        const sorted = options.sort ? applySort(filtered, options.sort) : filtered;
        const items = sorted.slice(offset, offset + limit) as T[];
        return {
            items,
            totalItems: sorted.length,
            page: Math.floor(offset / limit),
            perPage: limit,
        };
    }

    async textSearch<T extends Record<string, unknown>>(collection: string, query: string, options: {
        fields?: string[];
        filter?: Filter;
        limit?: number;
    } = {}): Promise<T[]> {
        const all = await this.list(collection, { filter: options.filter });
        const q = String(query).toLowerCase();
        if (q.length === 0) return [];
        const fields = options.fields;
        const ranked = all.items
            .map((item) => ({ item, score: scoreItem(item, q, fields) }))
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, options.limit ?? 50)
            .map((r) => r.item);
        return ranked as T[];
    }

    async update<T extends Record<string, unknown>>(collection: string, id: string, data: Record<string, unknown>): Promise<T> {
        const existing = await this.readRecord(collection, id);
        const merged = { ...existing, ...data, id, updated: new Date().toISOString() };
        await this.writeRecord(collection, id, merged);
        return merged as unknown as T;
    }

    async delete(collection: string, id: string): Promise<void> {
        const src = this.recordPath(collection, id);
        const archiveDir = join(this.root, '_archive', collection);
        try {
            await fs.mkdir(archiveDir, { recursive: true });
            await fs.rename(src, join(archiveDir, `${id}.md`));
        }
        catch (err: any) {
            if (err && err.code === 'ENOENT') {
                throw new AdapterError('not_found' as never, `record ${collection}/${id} not found`);
            }
            throw new AdapterError('io' as never, `failed to delete ${collection}/${id}: ${err?.message || err}`);
        }
    }

    async upsert<T extends Record<string, unknown>>(collection: string, data: Record<string, unknown>, uniqueFields: string[]): Promise<T> {
        if (!uniqueFields || uniqueFields.length === 0) {
            throw new AdapterError('validation' as never, 'upsert requires at least one uniqueField');
        }
        const filter: Filter = [
            uniqueFields.map((field) => ({ field, op: 'eq' as const, value: data[field] as FilterClause['value'] ?? null })),
        ];
        const existing = await this.list(collection, { filter, page: { limit: 1 } });
        if (existing.items.length > 0) {
            return this.update(collection, existing.items[0].id as string, data);
        }
        return this.create(collection, data);
    }

    async count(collection: string, filter?: Filter): Promise<number> {
        // Lightweight count — reuses list() so it respects the same filter semantics.
        const all = await this.list(collection, { filter });
        return all.totalItems;
    }

    async collectionExists(collection: string): Promise<boolean> {
        try {
            const s = await fs.stat(this.collectionDir(collection));
            return s.isDirectory();
        }
        catch {
            return false;
        }
    }

    async listCollections(): Promise<string[]> {
        try {
            const entries = await fs.readdir(this.root, { withFileTypes: true });
            return entries
                .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
                .map((e) => e.name);
        }
        catch (err: any) {
            if (err && err.code === 'ENOENT') return [];
            throw new AdapterError('io' as never, `failed to list collections: ${err?.message || err}`);
        }
    }
}

// ─── helpers ────────────────────────────────────────────────────────────────

// Path-traversal guard: ids and collection names cannot contain separators,
// leading dots, or null bytes. Match PocketBase's record-id constraints
// loosely; we just need to refuse anything that could escape <root>.
function validateName(value: string, label: string): void {
    if (typeof value !== 'string' || value.length === 0) {
        throw new AdapterError('validation' as never, `${label} must be a non-empty string`);
    }
    if (value.includes('/') || value.includes('\\') || value.includes('\0') || value.startsWith('.')) {
        throw new AdapterError('validation' as never, `${label} contains forbidden characters: ${value}`);
    }
}

function scoreItem(item: Record<string, unknown>, q: string, fields?: string[]): number {
    // Default ranking: tag-match (3pts) > title-match (2pts) > body-match (1pt).
    // If `fields` is specified, only those are searched (with title>body>everything-else fallback).
    if (fields && fields.length > 0) {
        for (const f of fields) {
            const v = item[f];
            if (typeof v === 'string' && v.toLowerCase().includes(q)) return f === 'tags' ? 3 : f === 'title' ? 2 : 1;
            if (Array.isArray(v) && v.some((x) => String(x).toLowerCase().includes(q))) return 3;
        }
        return 0;
    }
    const tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [];
    if (tags.some((t) => t.includes(q))) return 3;
    if (typeof item.title === 'string' && item.title.toLowerCase().includes(q)) return 2;
    if (typeof item.body === 'string' && item.body.toLowerCase().includes(q)) return 1;
    if (typeof item.content === 'string' && item.content.toLowerCase().includes(q)) return 1;
    return 0;
}

function applyFilter(items: Record<string, unknown>[], filter: Filter): Record<string, unknown>[] {
    // Filter is OR-of-AND groups (matching the existing Filter type).
    return items.filter((item) =>
        filter.some((andGroup) => andGroup.every((clause) => matchClause(item, clause))),
    );
}

function matchClause(item: Record<string, unknown>, clause: FilterClause): boolean {
    const v = item[clause.field];
    const target = clause.value;
    switch (clause.op) {
        case 'eq': return v === target;
        case 'neq': return v !== target;
        case 'gt': return typeof v === 'number' && typeof target === 'number' && v > target;
        case 'gte': return typeof v === 'number' && typeof target === 'number' && v >= target;
        case 'lt': return typeof v === 'number' && typeof target === 'number' && v < target;
        case 'lte': return typeof v === 'number' && typeof target === 'number' && v <= target;
        case 'like':
            return typeof v === 'string' && typeof target === 'string'
                && v.toLowerCase().includes(target.toLowerCase());
        case 'in':
            return Array.isArray(target) && target.includes(v as string);
        case 'contains':
            return Array.isArray(v) && v.includes(target);
        default: return false;
    }
}

function applySort(items: Record<string, unknown>[], sort: SortClause[]): Record<string, unknown>[] {
    return [...items].sort((a, b) => {
        for (const s of sort) {
            const av = a[s.field] as string | number;
            const bv = b[s.field] as string | number;
            if (av === bv) continue;
            if (av == null) return s.direction === 'desc' ? 1 : -1;
            if (bv == null) return s.direction === 'desc' ? -1 : 1;
            const cmp = av < bv ? -1 : 1;
            return s.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
    });
}

// ─── minimal YAML frontmatter parser/serializer ────────────────────────────

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
    // Format: `---\n<yaml>\n---\n<body>` (LF or CRLF tolerated).
    // If no opening `---`, treat entire content as body with no frontmatter.
    const normalized = raw.replace(/\r\n/g, '\n');
    if (!normalized.startsWith('---\n') && normalized !== '---' && !normalized.startsWith('---\r')) {
        return { frontmatter: {}, body: normalized.trim() };
    }
    const rest = normalized.slice(4);
    const endIdx = rest.indexOf('\n---');
    if (endIdx === -1) {
        return { frontmatter: {}, body: normalized.trim() };
    }
    const yamlBlock = rest.slice(0, endIdx);
    let body = rest.slice(endIdx + 4);
    if (body.startsWith('\n')) body = body.slice(1);
    return { frontmatter: parseSimpleYaml(yamlBlock), body: body.trim() };
}

function parseSimpleYaml(block: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const lines = block.split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.replace(/\s+$/, '');
        if (!trimmed || trimmed.startsWith('#')) { i++; continue; }
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) { i++; continue; }
        const key = trimmed.slice(0, colonIdx).trim();
        const rawValue = trimmed.slice(colonIdx + 1).trim();
        if (rawValue === '') {
            // List (next lines starting with `- `) or empty value
            const list: unknown[] = [];
            let j = i + 1;
            while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
                list.push(parseScalar(lines[j].replace(/^\s*-\s+/, '').trim()));
                j++;
            }
            if (list.length > 0) {
                out[key] = list;
                i = j;
                continue;
            }
            out[key] = null;
            i++;
            continue;
        }
        if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
            // Inline array: [a, b, c]
            const inner = rawValue.slice(1, -1).trim();
            out[key] = inner === '' ? [] : inner.split(',').map((s) => parseScalar(s.trim()));
        }
        else {
            out[key] = parseScalar(rawValue);
        }
        i++;
    }
    return out;
}

function parseScalar(v: string): string | number | boolean | null {
    if (v === '' || v === '~' || v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    // Quoted string
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        return v.slice(1, -1);
    }
    // Number
    if (/^-?\d+(\.\d+)?$/.test(v)) {
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
    }
    return v;
}

function stringifyFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
    const lines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
        if (value === undefined) continue;
        if (value === null) {
            lines.push(`${key}: null`);
        }
        else if (Array.isArray(value)) {
            if (value.length === 0) {
                lines.push(`${key}: []`);
            }
            else {
                lines.push(`${key}:`);
                for (const item of value) {
                    lines.push(`  - ${stringifyScalar(item)}`);
                }
            }
        }
        else if (typeof value === 'object') {
            // Nested object — serialize as JSON to preserve roundtrip.
            // The brain's frontmatter rarely uses nested objects; this is a
            // pragmatic fallback that the parser will read back as a string.
            lines.push(`${key}: ${JSON.stringify(value)}`);
        }
        else {
            lines.push(`${key}: ${stringifyScalar(value)}`);
        }
    }
    lines.push('---');
    lines.push('');
    return lines.join('\n') + body + (body.endsWith('\n') ? '' : '\n');
}

function stringifyScalar(v: unknown): string {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    const s = String(v);
    // Quote if contains special chars
    if (/[:#\n\[\]{}"',&*!|>%@`]/.test(s) || s.trim() !== s || s === '') {
        return JSON.stringify(s);
    }
    return s;
}
