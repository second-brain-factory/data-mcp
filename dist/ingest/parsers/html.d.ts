/**
 * HTML parser — tag-strip to text. No DOM dependency (v1): script/style
 * removal, tag strip, entity decode, whitespace normalization.
 */
import type { Parser } from '../types.js';
export declare function htmlToText(html: string): {
    title: string | null;
    text: string;
};
export declare const parseHtml: Parser;
//# sourceMappingURL=html.d.ts.map