/**
 * Tool: ingest
 *
 * Bulk-import local files into knowledge records. One tool for ALL formats
 * (issue #13 context-pollution lesson: never per-format tools). Parsers
 * live in src/ingest/parsers/, the registry maps format -> parser, and the
 * runner does all I/O + dedupe.
 *
 * dry_run defaults TRUE: callers preview what would be created before
 * committing. Re-running the same ingest creates zero duplicates.
 */
import { z } from 'zod';
import { makeToolResponse, makeErrorResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
import { runIngest, MAX_FILES } from '../../ingest/runner.js';
import { SUPPORTED_FORMATS } from '../../ingest/registry.js';
export function registerIngest(server, adapter) {
    server.registerTool('ingest', {
        description: `Bulk-import local files or directories into knowledge records. Supported formats: ${SUPPORTED_FORMATS.join(', ')} (.md, .txt, .csv, .json, .html). Recurses directories (skips dotfiles, binaries, node_modules; max ${MAX_FILES} files). Defaults to dry_run preview — pass dry_run: false to write. Idempotent: re-ingesting the same files creates no duplicates.`,
        inputSchema: {
            path: z.string().min(1).max(1000).describe('Absolute path to a file or directory to ingest'),
            dry_run: z.boolean().optional().describe('Preview without writing (default true). Set false to create records.'),
            owner_scope: z.enum(['private', 'shared']).optional().describe('Store records privately for this user or in shared team memory'),
        },
    }, withGracefulDegradation('knowledge', adapter, async (params) => {
        try {
            // Markdown backend: never ingest the brain's own storage directory
            const forbiddenRoots = [];
            if (adapter.backend === 'markdown' && process.env.SB_MARKDOWN_ROOT) {
                forbiddenRoots.push(process.env.SB_MARKDOWN_ROOT);
            }
            const summary = await runIngest(adapter, {
                path: params.path,
                dryRun: params.dry_run ?? true,
                ownerScope: params.owner_scope,
                forbiddenRoots,
            });
            const verb = summary.dry_run ? 'would create' : 'created';
            return makeToolResponse({
                ...summary,
                message: `${summary.dry_run ? '[DRY RUN] ' : ''}Scanned ${summary.files_scanned} file(s): ${verb} ${summary.records_created} record(s), ${summary.records_deduplicated} duplicate(s) skipped, ${summary.files_errored} error(s).${summary.capped ? ` Capped at ${MAX_FILES} files — ingest subdirectories separately.` : ''}${summary.dry_run ? ' Pass dry_run: false to write.' : ''}`,
            });
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith('Refusing to ingest')) {
                return makeErrorResponse(error.message);
            }
            if (error instanceof Error && error.code === 'ENOENT') {
                return makeErrorResponse(`Path not found: ${params.path}`);
            }
            return handleAdapterError(error, 'ingest');
        }
    }));
}
//# sourceMappingURL=ingest.js.map