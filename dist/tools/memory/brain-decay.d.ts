/**
 * Tool: brain_decay
 *
 * List knowledge items where decay exceeds a threshold.
 * Decay formula: 1.0 - (days_since_validated / 180), clamped to [0, 1].
 * Computed on-read — not stored in DB.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerBrainDecay(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=brain-decay.d.ts.map