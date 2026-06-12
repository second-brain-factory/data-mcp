/**
 * Tool: handoff_create
 *
 * Create an evidence-backed handoff packet for another team member.
 * Shared scope by default — a handoff the recipient cannot read is useless.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerHandoffCreate(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=handoff-create.d.ts.map