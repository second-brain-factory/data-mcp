/**
 * Tool: setup_status
 *
 * Check backend connection, list existing/missing collections, report status.
 *
 * RC-1 fix (incident 2026-05-11): Previously called adapter.listCollections()
 * which uses rpc('get_public_tables') — a custom Postgres function absent from
 * fresh Supabase projects. Fallback to information_schema also failed because
 * PostgREST only exposes the public schema. Now uses the same code path as
 * setup_migrate (adapter.collectionExists per expected collection) so the
 * diagnostic agrees with the data tools.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerSetupStatus(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=setup-status.d.ts.map