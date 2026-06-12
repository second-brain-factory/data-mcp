/**
 * Notion export parsers (issue #19) — Markdown & CSV workspace export.
 *
 * Notion names every exported page/database `<name> <32-hex-id>.(md|csv)`
 * and embeds the same ID suffixes in folder names and inter-page links.
 * Detection is by filename pattern (detect.ts refinePathFormat), so a
 * lone Notion file outside its export directory still parses cleanly.
 *
 * - Pages: ID stripped from title, link text, and link targets; folder
 *   path segments (their own IDs stripped) become tags.
 * - Databases: one record per row with column-labeled content, titled
 *   `<db name> — <first column value>`.
 */
import { chunkText, titleChunks } from '../chunk.js';
import { parseCsvRows } from './csv.js';
const ID_SUFFIX = / [0-9a-f]{32}$/i;
/** %20-encoded variant used inside link targets. */
const ID_SUFFIX_ENCODED = /(?:%20| )[0-9a-f]{32}(?=\.(?:md|csv)|\)|\/|$)/gi;
/** Strip a trailing Notion page ID from a name. */
export function stripNotionId(name) {
    const stripped = name.replace(ID_SUFFIX, '').trim();
    return stripped.length > 0 ? stripped : name.trim();
}
/** Strip ID suffixes from markdown link text and targets in a page body. */
export function stripNotionLinks(body) {
    return body.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, text, target) => {
        const cleanText = text.replace(ID_SUFFIX, '').trimEnd();
        const cleanTarget = target.replace(ID_SUFFIX_ENCODED, '');
        return `[${cleanText}](${cleanTarget})`;
    });
}
/** Folder path → tags: each segment lowercased with its own ID stripped. */
function folderTags(relPath) {
    if (!relPath)
        return [];
    const segments = relPath.split('/').slice(0, -1); // drop the filename
    return segments
        .map((s) => stripNotionId(s).toLowerCase())
        .filter((s) => s.length > 0);
}
export const parseNotionMd = (content, ctx) => {
    const title = stripNotionId(ctx.baseName);
    const body = stripNotionLinks(content).trim();
    if (body.length === 0)
        return [];
    const tags = ['notion', ...folderTags(ctx.relPath)];
    return titleChunks(title, chunkText(body)).map(({ title: t, content: c }) => ({
        title: t, content: c, type: 'reference', tags,
    }));
};
export const parseNotionDb = (content, ctx) => {
    const rows = parseCsvRows(content);
    if (rows.length === 0)
        return [];
    const [header, ...data] = rows;
    if (data.length === 0)
        return [];
    const dbName = stripNotionId(ctx.baseName);
    const tags = ['notion', 'database', dbName.toLowerCase()];
    const items = [];
    for (let r = 0; r < data.length; r++) {
        const row = data[r];
        const lines = header
            .map((h, idx) => ({ h, v: stripNotionLinks(row[idx] ?? '').trim() }))
            .filter(({ v }) => v.length > 0)
            .map(({ h, v }) => `${h}: ${v}`);
        if (lines.length === 0)
            continue;
        const first = row[0]?.trim();
        const title = `${dbName} — ${first && first.length > 0 ? stripNotionId(first) : `Row ${r + 1}`}`;
        items.push({
            title,
            content: lines.join('\n'),
            type: 'reference',
            tags,
            source_meta: { database: dbName, row: r + 1 },
        });
    }
    return items;
};
//# sourceMappingURL=notion.js.map