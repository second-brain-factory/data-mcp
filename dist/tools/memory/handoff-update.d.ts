/**
 * Tool: handoff_update
 *
 * Accept, complete, cancel, or amend a handoff packet.
 * Status transitions stamp accepted_at / completed_at automatically.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerHandoffUpdate(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=handoff-update.d.ts.map