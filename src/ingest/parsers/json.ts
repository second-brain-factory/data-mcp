/**
 * JSON parser — validates and stores pretty-printed as a reference record.
 * Specialized JSON shapes (ChatGPT/Claude exports etc.) get their own
 * parsers in later phases; this is the generic fallback.
 */

import type { IngestItem, IngestContext, Parser } from '../types.js';
import { chunkText, titleChunks } from '../chunk.js';

export const parseJson: Parser = (content: string, ctx: IngestContext): IngestItem[] => {
    const parsed = JSON.parse(content); // throws -> runner reports per-file error
    const pretty = JSON.stringify(parsed, null, 2);
    return titleChunks(ctx.baseName, chunkText(pretty)).map(({ title, content: c }) => ({
        title, content: c, type: 'reference', tags: [],
    }));
};
