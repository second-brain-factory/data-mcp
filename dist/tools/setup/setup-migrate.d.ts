/**
 * Tool: setup_migrate
 *
 * Apply migrations — additive only, skips existing collections.
 * Creates all expected collections in the database.
 *
 * RC-3 fix (incident 2026-05-11): Replaced hardcoded project-relative
 * "migrations/supabase/" string with runtime-resolved absolute path to
 * the bundled SQL files inside this package.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerSetupMigrate(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=setup-migrate.d.ts.map