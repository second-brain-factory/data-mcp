/**
 * Export-context detection (issue #19) — directory-level facts discovered
 * in a pure pre-pass over the walked file list. The runner does ALL I/O
 * (loading users.json); detection itself is a pure function over
 * root-relative paths, so plain directories provably keep today's behavior.
 */
export interface ExportContext {
    kind: 'slack' | 'notion';
    /** Slack user ID -> display name (loaded by the runner from users.json) */
    users?: Map<string, string>;
}
/** Root-level Slack metadata files — workspace structure, not knowledge. */
export declare const SLACK_METADATA_FILES: Set<string>;
/** `<channel>/<YYYY-MM-DD>.json` day file, relative to the export root. */
export declare const SLACK_DAY_FILE: RegExp;
/**
 * Classify the ingest root from its relative path list.
 * - slack: users.json AND channels.json at root, plus at least one day file
 * - notion: any `<name> <32-hex>.(md|csv)` anywhere in the tree
 */
export declare function detectExportKind(relPaths: string[]): 'slack' | 'notion' | null;
/**
 * Build the user ID -> display name map from a parsed users.json payload.
 * Tolerant of malformed input — resolution degrades to raw IDs, never throws.
 */
export declare function buildSlackUserMap(parsed: unknown): Map<string, string>;
//# sourceMappingURL=export-context.d.ts.map