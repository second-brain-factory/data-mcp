/**
 * Evernote ENEX parser (issue #19) — zero-dep regex extraction.
 *
 * ENEX is XML with CDATA-wrapped ENML per note. The format is regular
 * enough (flat <note> blocks, single-level fields) that regex extraction
 * beats adding an XML dependency. ENML content is HTML-like, so the
 * Phase-1 htmlToText helper strips it. One record per note; malformed
 * notes are skipped individually so one bad note never drops the file.
 */

import type { IngestItem, IngestContext, Parser } from '../types.js';
import { chunkText, titleChunks } from '../chunk.js';
import { htmlToText } from './html.js';
import { toIsoDate } from './conversation.js';

/** Convert ENEX timestamp (yyyyMMddTHHmmssZ) to ISO, or undefined. */
function enexDate(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!m) return toIsoDate(value);
    return toIsoDate(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}

/** Extract the text of a simple single-level element within a note block. */
function field(block: string, tag: string): string | undefined {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : undefined;
}

export const parseEnex: Parser = (content: string, ctx: IngestContext): IngestItem[] => {
    const items: IngestItem[] = [];
    const noteBlocks = content.match(/<note>[\s\S]*?<\/note>/g) ?? [];
    let untitled = 0;

    for (const block of noteBlocks) {
        // <content> wraps an ENML document in CDATA; tolerate missing CDATA.
        const contentMatch = block.match(/<content>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/content>/);
        const enml = (contentMatch?.[1] ?? contentMatch?.[2] ?? '').trim();
        if (enml.length === 0) continue;
        const { text } = htmlToText(enml);
        if (text.length === 0) continue;

        let title = field(block, 'title') ?? '';
        if (title.length === 0) {
            untitled++;
            title = untitled === 1 ? `${ctx.baseName} — untitled note` : `${ctx.baseName} — untitled note (${untitled})`;
        }
        const noteTags = [...block.matchAll(/<tag>([\s\S]*?)<\/tag>/g)].map((m) => m[1].trim()).filter((t) => t.length > 0);
        const date = enexDate(field(block, 'created'));

        for (const { title: t, content: c } of titleChunks(title, chunkText(text))) {
            items.push({
                title: t,
                content: c,
                type: 'reference',
                tags: ['evernote', ...noteTags],
                source_meta: date ? { note_date: date } : undefined,
            });
        }
    }
    return items;
};
