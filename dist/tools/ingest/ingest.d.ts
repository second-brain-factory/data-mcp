/**
 * Tool: ingest
 *
 * Bulk-import local files into knowledge records. One tool for ALL formats
 * (issue #13 context-pollution lesson: never per-format tools). Parsers
 * live in src/ingest/parsers/, the registry maps format -> parser, and the
 * runner does all I/O + dedupe.
 *
 * dry_run defaults TRUE: callers preview what would be created before
 * committing. Re-running the same ingest creates zero duplicates.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerIngest(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=ingest.d.ts.map