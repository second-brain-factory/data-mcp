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
export const SLACK_METADATA_FILES = new Set(['users.json', 'channels.json', 'groups.json', 'mpims.json', 'dms.json', 'integration_logs.json', 'canvases.json']);

/** `<channel>/<YYYY-MM-DD>.json` day file, relative to the export root. */
export const SLACK_DAY_FILE = /^[^/]+\/\d{4}-\d{2}-\d{2}\.json$/;

const NOTION_FILE = / [0-9a-f]{32}\.(md|csv)$/i;

/**
 * Classify the ingest root from its relative path list.
 * - slack: users.json AND channels.json at root, plus at least one day file
 * - notion: any `<name> <32-hex>.(md|csv)` anywhere in the tree
 */
export function detectExportKind(relPaths: string[]): 'slack' | 'notion' | null {
    const hasUsers = relPaths.includes('users.json');
    const hasChannels = relPaths.includes('channels.json');
    if (hasUsers && hasChannels && relPaths.some((p) => SLACK_DAY_FILE.test(p))) return 'slack';
    if (relPaths.some((p) => NOTION_FILE.test(p))) return 'notion';
    return null;
}

/**
 * Build the user ID -> display name map from a parsed users.json payload.
 * Tolerant of malformed input — resolution degrades to raw IDs, never throws.
 */
export function buildSlackUserMap(parsed: unknown): Map<string, string> {
    const map = new Map<string, string>();
    if (!Array.isArray(parsed)) return map;
    for (const u of parsed as Array<Record<string, unknown>>) {
        if (typeof u?.id !== 'string') continue;
        const profile = (u.profile ?? {}) as Record<string, unknown>;
        const name = [profile.display_name, profile.real_name, u.name]
            .find((n) => typeof n === 'string' && n.trim().length > 0) as string | undefined;
        if (name) map.set(u.id, name.trim());
    }
    return map;
}
