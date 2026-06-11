/**
 * Tool: setup_bootstrap
 *
 * RC-2 fix (incident 2026-05-11): Generates a single SQL block containing
 * every bundled Supabase migration concatenated in numeric order, followed
 * by NOTIFY pgrst, 'reload schema'. Customer pastes the block into the
 * Supabase SQL Editor and runs it once. Stops short of running the SQL
 * itself because Supabase service-role over PostgREST does not expose
 * arbitrary SQL execution — that needs either a custom exec_sql function
 * (Approach B, opt-in by customer) or the Management API with a personal
 * access token (Approach C, adds auth surface). This is Approach A: lowest
 * friction, no new auth, works on Cloud + self-hosted.
 *
 * After the customer runs the block, setup_migrate will report all
 * collections present.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerSetupBootstrap(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=setup-bootstrap.d.ts.map