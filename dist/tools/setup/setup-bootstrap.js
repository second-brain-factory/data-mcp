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
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeToolResponse, makeErrorResponse } from '../shared.js';
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations', 'supabase');
export function registerSetupBootstrap(server, adapter) {
    server.tool('setup_bootstrap', 'Generate a paste-ready SQL block (all bundled Supabase migrations + PostgREST reload). Open the returned sql_editor_url, paste sql, run. Idempotent. Supabase backend only — PocketBase customers use setup_migrate.', {}, async () => {
        if (adapter.backend !== 'supabase') {
            return makeErrorResponse('setup_bootstrap is Supabase-only. PocketBase customers use setup_migrate.');
        }
        try {
            const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
            if (files.length === 0) {
                return makeErrorResponse(`No bundled migration files found at ${MIGRATIONS_DIR}. Package install may be corrupted.`);
            }
            const blocks = files.map((f) => `-- ===== ${f} =====\n${readFileSync(join(MIGRATIONS_DIR, f), 'utf-8').trimEnd()}\n`);
            const sql = [
                ...blocks,
                '-- ===== Reload PostgREST schema cache =====',
                "-- Without this, PostgREST keeps serving stale cache and knowledge_* calls fail.",
                "NOTIFY pgrst, 'reload schema';",
                '',
            ].join('\n');
            // Supabase URL format: https://<ref>.supabase.co. The SQL Editor URL is
            // https://supabase.com/dashboard/project/<ref>/sql/new. We try to extract
            // the ref; if the URL doesn't match the expected format (self-hosted,
            // etc.), we fall back to the generic dashboard.
            const supabaseUrl = adapter.supabaseUrl || '';
            const refMatch = supabaseUrl.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/);
            const sqlEditorUrl = refMatch
                ? `https://supabase.com/dashboard/project/${refMatch[1]}/sql/new`
                : 'https://supabase.com/dashboard/project/_/sql/new';
            return makeToolResponse({
                backend: 'supabase',
                migrations_path: MIGRATIONS_DIR,
                files_count: files.length,
                files,
                sql,
                sql_editor_url: sqlEditorUrl,
                instructions: [
                    `1. Open ${sqlEditorUrl}`,
                    '2. Paste the contents of the `sql` field above into the editor.',
                    '3. Run.',
                    '4. Verify with setup_migrate (it should report 0 missing collections).',
                ],
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'unknown';
            console.error('[setup_bootstrap] Error:', err);
            return makeErrorResponse(`Failed to assemble bootstrap SQL from ${MIGRATIONS_DIR}: ${msg}`);
        }
    });
}
//# sourceMappingURL=setup-bootstrap.js.map
