/**
 * Google Keep parser (issue #19) — one Takeout JSON file per note.
 *
 * Shape: { title, textContent | listContent[], labels[], isArchived,
 * isTrashed, userEditedTimestampUsec }. Archived/trashed notes return []
 * (surfaced as skipped_empty). Detection is content refinement in
 * detect.ts (object root + Keep-specific keys), so plain JSON objects
 * keep the generic parser.
 */

import type { IngestItem, IngestContext, Parser } from '../types.js';
import { chunkText, titleChunks } from '../chunk.js';

interface KeepListItem {
    text?: unknown;
    isChecked?: unknown;
}

export const parseKeep: Parser = (content: string, ctx: IngestContext): IngestItem[] => {
    const note = JSON.parse(content) as Record<string, unknown>; // throws -> per-file error
    if (typeof note !== 'object' || note === null || Array.isArray(note)) return [];
    if (note.isArchived === true || note.isTrashed === true) return [];

    const parts: string[] = [];
    if (typeof note.textContent === 'string' && note.textContent.trim().length > 0) {
        parts.push(note.textContent.trim());
    }
    if (Array.isArray(note.listContent)) {
        const lines = (note.listContent as KeepListItem[])
            .filter((i) => typeof i?.text === 'string' && (i.text as string).trim().length > 0)
            .map((i) => `- [${i.isChecked === true ? 'x' : ' '}] ${(i.text as string).trim()}`);
        if (lines.length > 0) parts.push(lines.join('\n'));
    }
    const text = parts.join('\n\n');
    if (text.length === 0) return [];

    const title = typeof note.title === 'string' && note.title.trim().length > 0 ? note.title.trim() : ctx.baseName;
    const labels = Array.isArray(note.labels)
        ? (note.labels as Array<Record<string, unknown>>)
            .map((l) => (typeof l?.name === 'string' ? l.name.trim() : ''))
            .filter((n) => n.length > 0)
        : [];
    const usec = note.userEditedTimestampUsec;
    const date = typeof usec === 'number' && Number.isFinite(usec) && usec > 0
        ? new Date(usec / 1000).toISOString()
        : undefined;

    return titleChunks(title, chunkText(text)).map(({ title: t, content: c }) => ({
        title: t,
        content: c,
        type: 'reference',
        tags: ['keep', ...labels],
        source_meta: date ? { note_date: date } : undefined,
    }));
};
