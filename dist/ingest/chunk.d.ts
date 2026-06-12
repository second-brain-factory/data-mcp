/**
 * Chunking — split long content into knowledge-record-sized pieces at
 * natural boundaries. Never blind fixed-size splits.
 */
export declare const MAX_CHUNK_CHARS = 4000;
/**
 * Split content into chunks of at most MAX_CHUNK_CHARS, breaking at
 * paragraph boundaries (blank lines) where possible, falling back to line
 * then hard breaks. Returns [content] unchanged when it fits.
 */
export declare function chunkText(content: string, maxChars?: number): string[];
/**
 * Title a list of chunks: single chunk keeps the base title, multiple
 * chunks get a "(part n/m)" suffix.
 */
export declare function titleChunks(baseTitle: string, chunks: string[]): Array<{
    title: string;
    content: string;
}>;
//# sourceMappingURL=chunk.d.ts.map