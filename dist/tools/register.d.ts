/**
 * Tool registration — imports and calls all 21 register functions.
 *
 * Issue #13 consolidated 27 thin CRUD tools into the 4 generic record_*
 * tools (see src/tools/records/registry.ts). Behavior-rich tools keep
 * dedicated registrations.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../adapter/types.js';
export declare function registerAllTools(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=register.d.ts.map