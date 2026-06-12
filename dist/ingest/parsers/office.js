/**
 * Office parser (issue #17) — PURE function over markdown emitted by the
 * converter sidecar. Never touches the filesystem or the converter; the
 * runner converts first and passes the markdown in via OfficeContext.
 *
 * Format-aware splitting (markitdown output shapes, verified live v0.1.6):
 *   xlsx — `## SheetName` per sheet  -> one record per sheet (AC6)
 *   pptx — `<!-- Slide number: N -->` markers -> one record per slide
 *   pdf/docx and everything else    -> H1/H2 section split (markdown parser logic)
 */
import { chunkText, titleChunks } from '../chunk.js';
import { splitSections } from './markdown.js';
const SLIDE_MARKER = /<!--\s*Slide number:\s*(\d+)\s*-->/gi;
function sectionItems(markdown, docTitle) {
    const sections = splitSections(markdown);
    if (sections.length === 0)
        return [];
    const total = sections.reduce((n, s) => n + s.text.length, 0);
    if (sections.length === 1 || total <= 4000) {
        const full = sections
            .map((s) => (s.heading ? `## ${s.heading}\n\n${s.text}` : s.text))
            .join('\n\n');
        return titleChunks(docTitle, chunkText(full)).map(({ title, content }) => ({
            title, content, type: 'reference', tags: [],
        }));
    }
    const items = [];
    for (const section of sections) {
        const sectionTitle = section.heading ? `${docTitle} — ${section.heading}` : docTitle;
        for (const { title, content } of titleChunks(sectionTitle, chunkText(section.text))) {
            items.push({ title, content, type: 'reference', tags: [] });
        }
    }
    return items;
}
/** XLSX: every H2 is a sheet — one record per sheet regardless of size. */
function sheetItems(markdown, docTitle) {
    const sections = splitSections(markdown);
    if (sections.length === 0)
        return [];
    const items = [];
    for (const section of sections) {
        const title = section.heading ? `${docTitle} — ${section.heading}` : docTitle;
        for (const { title: t, content } of titleChunks(title, chunkText(section.text))) {
            items.push({ title: t, content, type: 'reference', tags: [], source_meta: section.heading ? { sheet: section.heading } : undefined });
        }
    }
    return items;
}
/** PPTX: split on slide-number comments; title from the slide's heading. */
function slideItems(markdown, docTitle) {
    const parts = [];
    let lastIndex = 0;
    let lastSlide = null;
    for (const match of markdown.matchAll(SLIDE_MARKER)) {
        if (lastSlide !== null) {
            parts.push({ slide: lastSlide, text: markdown.slice(lastIndex, match.index).trim() });
        }
        lastSlide = parseInt(match[1], 10);
        lastIndex = (match.index ?? 0) + match[0].length;
    }
    if (lastSlide !== null)
        parts.push({ slide: lastSlide, text: markdown.slice(lastIndex).trim() });
    if (parts.length === 0)
        return sectionItems(markdown, docTitle);
    const items = [];
    for (const part of parts) {
        if (part.text.length === 0)
            continue;
        const heading = part.text.match(/^#{1,3}\s+(.*)$/m)?.[1]?.trim();
        const body = part.text.replace(/^#{1,3}\s+.*$\n?/m, '').trim() || part.text;
        const title = heading
            ? `${docTitle} — Slide ${part.slide} (${heading})`
            : `${docTitle} — Slide ${part.slide}`;
        for (const { title: t, content } of titleChunks(title, chunkText(body))) {
            items.push({ title: t, content, type: 'reference', tags: [], source_meta: { slide: part.slide } });
        }
    }
    return items;
}
/** Parse converter-emitted markdown into ingest items. */
export function parseOffice(markdown, ctx) {
    const docTitle = ctx.baseName;
    if (ctx.format === 'xlsx' || ctx.format === 'xls')
        return sheetItems(markdown, docTitle);
    if (ctx.format === 'pptx' || ctx.format === 'ppt')
        return slideItems(markdown, docTitle);
    return sectionItems(markdown, docTitle);
}
//# sourceMappingURL=office.js.map