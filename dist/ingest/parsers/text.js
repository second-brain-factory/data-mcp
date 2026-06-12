/**
 * Plain text parser — whole file (chunked when long).
 */
import { chunkText, titleChunks } from '../chunk.js';
export const parseText = (content, ctx) => {
    return titleChunks(ctx.baseName, chunkText(content)).map(({ title, content: c }) => ({
        title, content: c, type: 'reference', tags: [],
    }));
};
//# sourceMappingURL=text.js.map