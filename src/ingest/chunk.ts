/**
 * Chunking — split long content into knowledge-record-sized pieces at
 * natural boundaries. Never blind fixed-size splits.
 */

export const MAX_CHUNK_CHARS = 4000;

/**
 * Split content into chunks of at most MAX_CHUNK_CHARS, breaking at
 * paragraph boundaries (blank lines) where possible, falling back to line
 * then hard breaks. Returns [content] unchanged when it fits.
 */
export function chunkText(content: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
    const trimmed = content.trim();
    if (trimmed.length <= maxChars) return trimmed.length > 0 ? [trimmed] : [];

    const paragraphs = trimmed.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';

    const flush = () => {
        const c = current.trim();
        if (c.length > 0) chunks.push(c);
        current = '';
    };

    for (const para of paragraphs) {
        if (para.length > maxChars) {
            // Oversized paragraph: flush what we have, split by lines/hard
            flush();
            let rest = para;
            while (rest.length > maxChars) {
                let cut = rest.lastIndexOf('\n', maxChars);
                if (cut < maxChars * 0.3) cut = rest.lastIndexOf(' ', maxChars);
                if (cut < maxChars * 0.3) cut = maxChars;
                chunks.push(rest.slice(0, cut).trim());
                rest = rest.slice(cut).trim();
            }
            current = rest;
            continue;
        }
        if (current.length + para.length + 2 > maxChars) flush();
        current = current.length > 0 ? `${current}\n\n${para}` : para;
    }
    flush();
    return chunks;
}

/**
 * Title a list of chunks: single chunk keeps the base title, multiple
 * chunks get a "(part n/m)" suffix.
 */
export function titleChunks(baseTitle: string, chunks: string[]): Array<{ title: string; content: string }> {
    if (chunks.length <= 1) return chunks.map((content) => ({ title: baseTitle, content }));
    return chunks.map((content, i) => ({ title: `${baseTitle} (part ${i + 1}/${chunks.length})`, content }));
}
