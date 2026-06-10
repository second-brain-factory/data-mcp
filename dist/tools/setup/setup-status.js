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
import { makeToolResponse, makeErrorResponse } from '../shared.js';
const EXPECTED_COLLECTIONS = [
    'knowledge',
    'decisions',
    'sessions',
    'goals',
    'tasks',
    'contacts',
    'entity_aliases',
    'settings',
    'prospects',
    'blog_posts',
    'email_queue',
    'content_calendar',
    'newsletter_subscribers',
    'affiliates',
];
export function registerSetupStatus(server, adapter) {
    server.tool('setup_status', 'Check database connection status, list existing and missing collections, and report schema readiness.', {}, { readOnlyHint: true }, async () => {
        try {
            const present = [];
            const missing = [];
            for (const collection of EXPECTED_COLLECTIONS) {
                const exists = await adapter.collectionExists(collection);
                if (exists) {
                    present.push(collection);
                }
                else {
                    missing.push(collection);
                }
            }
            const existingSet = new Set(present);
            let schemaVersion = null;
            if (existingSet.has('settings')) {
                try {
                    const results = await adapter.list('settings', {
                        filter: [[{ field: 'key', op: 'eq', value: 'schema_version' }]],
                        page: { limit: 1, offset: 0 },
                    });
                    if (results.items.length > 0) {
                        schemaVersion = results.items[0].value;
                    }
                }
                catch {
                    // settings table might exist but not have schema_version
                }
            }
            const isReady = missing.length === 0;
            return makeToolResponse({
                connected: true,
                backend: adapter.backend,
                schema_version: schemaVersion,
                ready: isReady,
                collections: {
                    present,
                    missing,
                    total_expected: EXPECTED_COLLECTIONS.length,
                    total_present: present.length,
                },
                message: isReady
                    ? 'Database is fully set up and ready.'
                    : `Database is missing ${missing.length} collection(s). Run setup_migrate to create them.`,
            });
        }
        catch (error) {
            console.error('[setup_status] Connection error:', error);
            return makeErrorResponse('Cannot connect to the database. Check that your database is running and credentials are correct.');
        }
    });
}
//# sourceMappingURL=setup-status.js.map
