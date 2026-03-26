/**
 * Tool: setup_migrate
 *
 * Apply migrations — additive only, skips existing collections.
 * Creates all expected collections in the database.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerSetupMigrate(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=setup-migrate.d.ts.map