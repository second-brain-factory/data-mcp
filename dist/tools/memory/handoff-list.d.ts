/**
 * Tool: handoff_list
 *
 * List handoff packets. The "what's waiting for me?" query:
 * handoff_list({ to_member: 'me', status: 'open' }).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerHandoffList(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=handoff-list.d.ts.map