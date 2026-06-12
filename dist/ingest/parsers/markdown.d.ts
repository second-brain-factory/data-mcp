/**
 * Markdown parser — splits on H1/H2 sections, frontmatter keys -> tags.
 */
import type { Parser } from '../types.js';
/** Split markdown body into sections at H1/H2 headings. */
export declare function splitSections(body: string): Array<{
    heading: string | null;
    text: string;
}>;
export declare const parseMarkdown: Parser;
//# sourceMappingURL=markdown.d.ts.map