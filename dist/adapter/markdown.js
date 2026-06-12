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
export class MarkdownAdapter {
    root;
    backend = 'markdown';
    constructor(root) {
        if (!root) {
            throw new AdapterError('config', 'MarkdownAdapter requires a non-empty root path');
        }
        this.root = root;
    }
    collectionDir(collection) {
        validateName(collection, 'collection');
        return join(this.root, collection);
    }
    recordPath(collection, id) {
        validateName(id, 'id');
        return join(this.collectionDir(collection), `${id}.md`);
    }
    async ensureCollection(collection) {
        await fs.mkdir(this.collectionDir(collection), { recursive: true });
    }
    async readRecord(collection, id) {
        let raw;
        try {
            raw = await fs.readFile(this.recordPath(collection, id), 'utf8');
        }
        catch (err) {
            if (err && err.code === 'ENOENT') {
                throw new AdapterError('not_found', `record ${collection}/${id} not found`);
            }
            throw new AdapterError('io', `failed to read ${collection}/${id}: ${err?.message || err}`);
        }
        const { frontmatter, body } = parseFrontmatter(raw);
        return { ...frontmatter, id, body };
    }
    async writeRecord(collection, id, data) {
        await this.ensureCollection(collection);
        const { body = '', id: _ignored, ...frontmatter } = data;
        const payload = stringifyFrontmatter({ ...frontmatter, id }, String(body ?? ''));
        try {
            await fs.writeFile(this.recordPath(collection, id), payload, 'utf8');
        }
        catch (err) {
            throw new AdapterError('io', `failed to write ${collection}/${id}: ${err?.message || err}`);
        }
    }
    async create(collection, data) {
        const id = (data.id && String(data.id)) || randomUUID();
        validateName(id, 'id');
        const now = new Date().toISOString();
        const record = {
            ...data,
            id,
            created: data.created || now,
            updated: now,
        };
        await this.writeRecord(collection, id, record);
        return record;
    }
    async getOne(collection, id) {
        return this.readRecord(collection, id);
    }
    async list(collection, options = {}) {
        const dir = this.collectionDir(collection);
        const limit = options.page?.limit ?? 50;
        const offset = options.page?.offset ?? 0;
        let entries;
        try {
            entries = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
        }
        catch (err) {
            if (err && err.code === 'ENOENT') {
                return { items: [], totalItems: 0, page: 0, perPage: limit };
            }
            throw new AdapterError('io', `failed to list ${collection}: ${err?.message || err}`);
        }
        const all = [];
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
        const items = sorted.slice(offset, offset + limit);
        return {
            items,
            totalItems: sorted.length,
            page: Math.floor(offset / limit),
            perPage: limit,
        };
    }
    async textSearch(collection, query, options = {}) {
        const all = await this.list(collection, { filter: options.filter });
        const q = String(query).toLowerCase();
        if (q.length === 0)
            return [];
        const fields = options.fields;
        const ranked = all.items
            .map((item) => ({ item, score: scoreItem(item, q, fields) }))
            .filter((r) => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, options.limit ?? 50)
            .map((r) => r.item);
        return ranked;
    }
    async update(collection, id, data) {
        const existing = await this.readRecord(collection, id);
        const merged = { ...existing, ...data, id, updated: new Date().toISOString() };
        await this.writeRecord(collection, id, merged);
        return merged;
    }
    async delete(collection, id) {
        const src = this.recordPath(collection, id);
        const archiveDir = join(this.root, '_archive', collection);
        try {
            await fs.mkdir(archiveDir, { recursive: true });
            await fs.rename(src, join(archiveDir, `${id}.md`));
        }
        catch (err) {
            if (err && err.code === 'ENOENT') {
                throw new AdapterError('not_found', `record ${collection}/${id} not found`);
            }
            throw new AdapterError('io', `failed to delete ${collection}/${id}: ${err?.message || err}`);
        }
    }
    async upsert(collection, data, uniqueFields) {
        if (!uniqueFields || uniqueFields.length === 0) {
            throw new AdapterError('validation', 'upsert requires at least one uniqueField');
        }
        const filter = [
            uniqueFields.map((field) => ({ field, op: 'eq', value: data[field] ?? null })),
        ];
        const existing = await this.list(collection, { filter, page: { limit: 1 } });
        if (existing.items.length > 0) {
            return this.update(collection, existing.items[0].id, data);
        }
        return this.create(collection, data);
    }
    async count(collection, filter) {
        // Lightweight count — reuses list() so it respects the same filter semantics.
        const all = await this.list(collection, { filter });
        return all.totalItems;
    }
    async collectionExists(collection) {
        try {
            const s = await fs.stat(this.collectionDir(collection));
            return s.isDirectory();
        }
        catch {
            return false;
        }
    }
    async createCollection(collection) {
        // Markdown "schema" is just a directory per collection. Idempotent.
        try {
            await fs.mkdir(this.collectionDir(collection), { recursive: true });
        }
        catch (err) {
            throw new AdapterError('io', `failed to create collection ${collection}: ${err?.message || err}`);
        }
    }
    /**
     * Write a .gitignore containing `_archive/` into the markdown root so
     * soft-deleted records (which may include private data) are never pushed
     * to a shared team repo. Idempotent: appends the rule only if no existing
     * .gitignore line already covers `_archive`.
     */
    async ensureWorkspaceProtections() {
        const gitignorePath = join(this.root, '.gitignore');
        const RULE = '_archive/';
        try {
            let existing = '';
            try {
                existing = await fs.readFile(gitignorePath, 'utf8');
            }
            catch (err) {
                if (!err || err.code !== 'ENOENT')
                    throw err;
            }
            const covered = existing
                .split('\n')
                .map((line) => line.trim())
                .some((line) => line === '_archive/' || line === '_archive' || line === '/_archive/' || line === '/_archive');
            if (covered)
                return [];
            await fs.mkdir(this.root, { recursive: true });
            const header = '# Soft-deleted records (may contain private data) — never commit.\n';
            const block = `${header}${RULE}\n`;
            const next = existing.length === 0
                ? block
                : `${existing}${existing.endsWith('\n') ? '' : '\n'}${block}`;
            await fs.writeFile(gitignorePath, next, 'utf8');
            return ['.gitignore: _archive/'];
        }
        catch (err) {
            throw new AdapterError('io', `failed to write workspace .gitignore: ${err?.message || err}`);
        }
    }
    async listCollections() {
        try {
            const entries = await fs.readdir(this.root, { withFileTypes: true });
            return entries
                .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
                .map((e) => e.name);
        }
        catch (err) {
            if (err && err.code === 'ENOENT')
                return [];
            throw new AdapterError('io', `failed to list collections: ${err?.message || err}`);
        }
    }
}
// ─── helpers ────────────────────────────────────────────────────────────────
// Path-traversal guard: ids and collection names cannot contain separators,
// leading dots, or null bytes. Match PocketBase's record-id constraints
// loosely; we just need to refuse anything that could escape <root>.
function validateName(value, label) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new AdapterError('validation', `${label} must be a non-empty string`);
    }
    if (value.includes('/') || value.includes('\\') || value.includes('\0') || value.startsWith('.')) {
        throw new AdapterError('validation', `${label} contains forbidden characters: ${value}`);
    }
}
function scoreItem(item, q, fields) {
    // Default ranking: tag-match (3pts) > title-match (2pts) > body-match (1pt).
    // If `fields` is specified, only those are searched (with title>body>everything-else fallback).
    if (fields && fields.length > 0) {
        for (const f of fields) {
            const v = item[f];
            if (typeof v === 'string' && v.toLowerCase().includes(q))
                return f === 'tags' ? 3 : f === 'title' ? 2 : 1;
            if (Array.isArray(v) && v.some((x) => String(x).toLowerCase().includes(q)))
                return 3;
        }
        return 0;
    }
    const tags = Array.isArray(item.tags) ? item.tags.map((t) => String(t).toLowerCase()) : [];
    if (tags.some((t) => t.includes(q)))
        return 3;
    if (typeof item.title === 'string' && item.title.toLowerCase().includes(q))
        return 2;
    if (typeof item.body === 'string' && item.body.toLowerCase().includes(q))
        return 1;
    if (typeof item.content === 'string' && item.content.toLowerCase().includes(q))
        return 1;
    return 0;
}
function applyFilter(items, filter) {
    // Filter is OR-of-AND groups (matching the existing Filter type).
    return items.filter((item) => filter.some((andGroup) => andGroup.every((clause) => matchClause(item, clause))));
}
function matchClause(item, clause) {
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
            return Array.isArray(target) && target.includes(v);
        case 'contains':
            return Array.isArray(v) && v.includes(target);
        default: return false;
    }
}
function applySort(items, sort) {
    return [...items].sort((a, b) => {
        for (const s of sort) {
            const av = a[s.field];
            const bv = b[s.field];
            if (av === bv)
                continue;
            if (av == null)
                return s.direction === 'desc' ? 1 : -1;
            if (bv == null)
                return s.direction === 'desc' ? -1 : 1;
            const cmp = av < bv ? -1 : 1;
            return s.direction === 'desc' ? -cmp : cmp;
        }
        return 0;
    });
}
// ─── minimal YAML frontmatter parser/serializer ────────────────────────────
function parseFrontmatter(raw) {
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
    if (body.startsWith('\n'))
        body = body.slice(1);
    return { frontmatter: parseSimpleYaml(yamlBlock), body: body.trim() };
}
function parseSimpleYaml(block) {
    const out = {};
    const lines = block.split('\n');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.replace(/\s+$/, '');
        if (!trimmed || trimmed.startsWith('#')) {
            i++;
            continue;
        }
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx === -1) {
            i++;
            continue;
        }
        const key = trimmed.slice(0, colonIdx).trim();
        const rawValue = trimmed.slice(colonIdx + 1).trim();
        if (rawValue === '') {
            // List (next lines starting with `- `) or empty value
            const list = [];
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
function parseScalar(v) {
    if (v === '' || v === '~' || v === 'null')
        return null;
    if (v === 'true')
        return true;
    if (v === 'false')
        return false;
    // Quoted string
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        return v.slice(1, -1);
    }
    // Number
    if (/^-?\d+(\.\d+)?$/.test(v)) {
        const n = Number(v);
        if (!Number.isNaN(n))
            return n;
    }
    // JSON object/array (objects inside list items roundtrip as JSON —
    // e.g. handoffs.tried, sessions.decisions_made)
    if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
        try {
            return JSON.parse(v);
        }
        catch {
            // Not valid JSON — fall through to raw string.
        }
    }
    return v;
}
function stringifyFrontmatter(frontmatter, body) {
    const lines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
        if (value === undefined)
            continue;
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
function stringifyScalar(v) {
    if (v === null || v === undefined)
        return 'null';
    if (typeof v === 'boolean')
        return v ? 'true' : 'false';
    if (typeof v === 'number')
        return String(v);
    if (typeof v === 'object') {
        // Objects inside list items (e.g. handoffs.tried entries,
        // sessions.decisions_made) — serialize as JSON; parseScalar
        // JSON.parses it back. Previously this hit String(v) and
        // corrupted the value to "[object Object]".
        return JSON.stringify(v);
    }
    const s = String(v);
    // Quote if contains special chars
    if (/[:#\n\[\]{}"',&*!|>%@`]/.test(s) || s.trim() !== s || s === '') {
        return JSON.stringify(s);
    }
    return s;
}
//# sourceMappingURL=markdown.js.map