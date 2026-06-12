/**
 * Markdown parser — splits on H1/H2 sections, frontmatter keys -> tags.
 */

import type { IngestItem, IngestContext, Parser } from '../types.js';
import { chunkText, titleChunks } from '../chunk.js';

interface Frontmatter {
    tags: string[];
    title?: string;
    body: string;
}

function parseFrontmatter(content: string): Frontmatter {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match) return { tags: [], body: content };
    const body = content.slice(match[0].length);
    const tags: string[] = [];
    let title: string | undefined;
    for (const line of match[1].split('\n')) {
        const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
        if (!kv) continue;
        const [, key, raw] = kv;
        if (key === 'title') title = raw.replace(/^["']|["']$/g, '').trim() || undefined;
        if (key === 'tags') {
            // inline list: tags: [a, b] or tags: a, b
            const inner = raw.replace(/^\[|\]$/g, '');
            for (const t of inner.split(',')) {
                const tag = t.trim().replace(/^["'#]|["']$/g, '');
                if (tag) tags.push(tag);
            }
        }
    }
    // block list:  tags:\n  - a
    const blockTags = match[1].match(/^tags:\s*\n((?:\s+-\s+.*\n?)+)/m);
    if (blockTags) {
        for (const line of blockTags[1].split('\n')) {
            const tag = line.replace(/^\s+-\s+/, '').trim().replace(/^["'#]|["']$/g, '');
            if (tag) tags.push(tag);
        }
    }
    return { tags: [...new Set(tags)], title, body };
}

/** Split markdown body into sections at H1/H2 headings. */
function splitSections(body: string): Array<{ heading: string | null; text: string }> {
    const lines = body.split('\n');
    const sections: Array<{ heading: string | null; text: string }> = [];
    let heading: string | null = null;
    let buf: string[] = [];
    let inFence = false;

    const flush = () => {
        const text = buf.join('\n').trim();
        if (text.length > 0 || heading) sections.push({ heading, text });
        buf = [];
    };

    for (const line of lines) {
        if (/^(```|~~~)/.test(line)) inFence = !inFence;
        const h = !inFence ? line.match(/^(#{1,2})\s+(.*)$/) : null;
        if (h) {
            flush();
            heading = h[2].trim();
        } else {
            buf.push(line);
        }
    }
    flush();
    return sections.filter((s) => s.text.length > 0);
}

export const parseMarkdown: Parser = (content: string, ctx: IngestContext): IngestItem[] => {
    const { tags, title: fmTitle, body } = parseFrontmatter(content);
    const docTitle = fmTitle ?? ctx.baseName;
    const sections = splitSections(body);

    if (sections.length === 0) return [];

    // Small docs (single section or total under one chunk): one record
    const total = sections.reduce((n, s) => n + s.text.length, 0);
    if (sections.length === 1 || total <= 4000) {
        const full = sections
            .map((s) => (s.heading ? `## ${s.heading}\n\n${s.text}` : s.text))
            .join('\n\n');
        return titleChunks(docTitle, chunkText(full)).map(({ title, content: c }) => ({
            title, content: c, type: 'reference', tags,
        }));
    }

    // Large docs: one record per section
    const items: IngestItem[] = [];
    for (const section of sections) {
        const sectionTitle = section.heading ? `${docTitle} — ${section.heading}` : docTitle;
        for (const { title, content: c } of titleChunks(sectionTitle, chunkText(section.text))) {
            items.push({ title, content: c, type: 'reference', tags });
        }
    }
    return items;
};
