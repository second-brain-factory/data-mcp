/**
 * Format detection — extension first, content sniff to reject binaries.
 */
/** Map a file path to a format id, or null when unsupported. */
export declare function detectFormat(filePath: string): string | null;
/** Map a file path to a converted (office) format id, or null. */
export declare function detectConvertedFormat(filePath: string): string | null;
/**
 * Refine a generic `json` detection into a chat-export format (issue #18).
 * Pure string heuristic on a bounded prefix — exports can be 100MB+, so we
 * never JSON.parse here; the vendor parsers do strict validation and any
 * mismatch surfaces as a per-file parse error.
 *
 * ChatGPT conversations.json: array elements carry `"mapping"` (node graph)
 * and `"current_node"`. Claude conversations.json: elements carry
 * `"chat_messages"`. Both keys are vendor-specific enough that a prefix
 * scan is unambiguous; generic JSON stays `json`.
 */
export declare function refineJsonFormat(content: string): 'chatgpt' | 'claude' | 'keep' | 'json';
/**
 * Refine by filename pattern (issue #19): Notion exports name every page
 * and database `<name> <32-hex-id>.(md|csv)`. Pattern-only, so a single
 * Notion file ingested outside its export directory still gets clean
 * titles. `<name> <32-hex>_all.csv` is the unfiltered duplicate Notion
 * emits next to view CSVs — flagged so the runner can skip it.
 */
export declare function refinePathFormat(fileName: string): 'notion' | 'notion-db' | 'notion-db-all' | null;
/**
 * Reject binary content: NUL bytes or a high ratio of control characters in
 * the first 8KB. UTF-16 files contain NULs and are treated as binary in v1.
 */
export declare function looksBinary(head: Buffer): boolean;
/** Strip a UTF-8 BOM if present. */
export declare function stripBom(content: string): string;
//# sourceMappingURL=detect.d.ts.map