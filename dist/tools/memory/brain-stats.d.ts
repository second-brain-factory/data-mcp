/**
 * Tool: brain_stats
 *
 * Aggregate counts and health metrics across all collections.
 * Knowledge breakdown by type. Stale item count.
 * Uses Promise.all to parallelize queries.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerBrainStats(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=brain-stats.d.ts.map