/**
 * HTML parser — tag-strip to text. No DOM dependency (v1): script/style
 * removal, tag strip, entity decode, whitespace normalization.
 */

import type { IngestItem, IngestContext, Parser } from '../types.js';
import { chunkText, titleChunks } from '../chunk.js';

const ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
    ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
};

function decodeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&(\w+);/g, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function htmlToText(html: string): { title: string | null; text: string } {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let text = html
        .replace(/<(script|style|noscript|iframe|svg|head)\b[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section|article)>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ');
    text = decodeEntities(text);
    text = text
        .split('\n')
        .map((l) => l.replace(/[ \t]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() || null : null;
    return { title, text };
}

export const parseHtml: Parser = (content: string, ctx: IngestContext): IngestItem[] => {
    const { title, text } = htmlToText(content);
    if (text.length === 0) return [];
    return titleChunks(title ?? ctx.baseName, chunkText(text)).map(({ title: t, content: c }) => ({
        title: t, content: c, type: 'reference', tags: [],
    }));
};
