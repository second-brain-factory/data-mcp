/**
 * Notion export parsers (issue #19) — Markdown & CSV workspace export.
 *
 * Notion names every exported page/database `<name> <32-hex-id>.(md|csv)`
 * and embeds the same ID suffixes in folder names and inter-page links.
 * Detection is by filename pattern (detect.ts refinePathFormat), so a
 * lone Notion file outside its export directory still parses cleanly.
 *
 * - Pages: ID stripped from title, link text, and link targets; folder
 *   path segments (their own IDs stripped) become tags.
 * - Databases: one record per row with column-labeled content, titled
 *   `<db name> — <first column value>`.
 */
import type { Parser } from '../types.js';
/** Strip a trailing Notion page ID from a name. */
export declare function stripNotionId(name: string): string;
/** Strip ID suffixes from markdown link text and targets in a page body. */
export declare function stripNotionLinks(body: string): string;
export declare const parseNotionMd: Parser;
export declare const parseNotionDb: Parser;
//# sourceMappingURL=notion.d.ts.map