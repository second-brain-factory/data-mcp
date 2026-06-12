/**
 * Plain text parser — whole file (chunked when long).
 */

import type { IngestItem, IngestContext, Parser } from '../types.js';
import { chunkText, titleChunks } from '../chunk.js';

export const parseText: Parser = (content: string, ctx: IngestContext): IngestItem[] => {
    return titleChunks(ctx.baseName, chunkText(content)).map(({ title, content: c }) => ({
        title, content: c, type: 'reference', tags: [],
    }));
};
