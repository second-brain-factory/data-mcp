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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeToolResponse, makeErrorResponse } from '../shared.js';
const PACKAGE_MIGRATIONS_SUPABASE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations', 'supabase');
const PACKAGE_MIGRATIONS_POCKETBASE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations', 'pocketbase');
/** Collection schemas for PocketBase creation */
const COLLECTION_SCHEMAS = [
    { name: 'knowledge', description: 'Knowledge items (facts, patterns, insights, lessons, references)' },
    { name: 'decisions', description: 'Recorded decisions with context and rationale' },
    { name: 'sessions', description: 'Work session logs' },
    { name: 'goals', description: 'Goals with key results' },
    { name: 'tasks', description: 'Tasks with status and priority' },
    { name: 'contacts', description: 'Contact information' },
    { name: 'knowledge_links', description: 'Typed links between knowledge items' },
    { name: 'handoffs', description: 'Evidence-backed handoff packets between team members' },
    { name: 'entity_aliases', description: 'Search alias mappings' },
    { name: 'settings', description: 'Key-value settings store' },
    { name: 'prospects', description: 'Sales prospects (CRM)' },
    { name: 'blog_posts', description: 'Blog post content' },
    { name: 'email_queue', description: 'Email queue for sending' },
    { name: 'content_calendar', description: 'Content calendar entries' },
    { name: 'newsletter_subscribers', description: 'Newsletter subscriber list' },
    { name: 'affiliates', description: 'Affiliate partners and commissions' },
];
export function registerSetupMigrate(server, adapter) {
    server.tool('setup_migrate', 'Create missing database collections/tables. Additive only — existing collections are skipped. For markdown, creates collection directories directly. For PocketBase, reports migration files to apply. For Supabase, reports SQL migrations and recommends running setup_bootstrap for paste-ready SQL.', {}, async () => {
        try {
            const skipped = [];
            const created = [];
            const needsMigration = [];
            const migrationsPath = adapter.backend === 'supabase' ? PACKAGE_MIGRATIONS_SUPABASE : PACKAGE_MIGRATIONS_POCKETBASE;
            for (const schema of COLLECTION_SCHEMAS) {
                try {
                    const exists = await adapter.collectionExists(schema.name);
                    if (exists) {
                        skipped.push(schema.name);
                        continue;
                    }
                    if (adapter.createCollection) {
                        // Backend can provision storage directly (markdown: mkdir).
                        await adapter.createCollection(schema.name);
                        created.push(schema.name);
                        continue;
                    }
                    needsMigration.push({
                        name: schema.name,
                        instruction: adapter.backend === 'supabase'
                            ? `Apply SQL from ${migrationsPath}/. Easiest path: call setup_bootstrap for a paste-ready SQL block.`
                            : `Apply migration from ${migrationsPath}/.`,
                    });
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    console.error(`[setup_migrate] Error checking ${schema.name}:`, msg);
                    needsMigration.push({ name: schema.name, instruction: 'Failed to check — may need migration' });
                }
            }
            // Workspace protections (markdown only): .gitignore with _archive/
            // so soft-deleted records — which may include private data — are
            // never committed to a shared team repo.
            let protections = [];
            if (adapter.ensureWorkspaceProtections) {
                try {
                    protections = await adapter.ensureWorkspaceProtections();
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    console.error('[setup_migrate] Error writing workspace protections:', msg);
                }
            }
            return makeToolResponse({
                backend: adapter.backend,
                migrations_path: migrationsPath,
                existing: skipped.length,
                created: created.length,
                needs_migration: needsMigration.length,
                details: {
                    existing: skipped,
                    created: created.length > 0 ? created : undefined,
                    needs_migration: needsMigration.length > 0 ? needsMigration : undefined,
                    protections_created: protections.length > 0 ? protections : undefined,
                },
                message: adapter.createCollection
                    ? `Migration complete. ${skipped.length} existing, ${created.length} created. Your Second Brain is ready to use.`
                    : adapter.backend === 'pocketbase'
                        ? `Schema check complete. ${skipped.length} existing, ${needsMigration.length} need migration files. Apply from ${migrationsPath}/.`
                        : `Schema check complete. ${skipped.length} existing, ${needsMigration.length} need SQL. Run setup_bootstrap for a paste-ready block, or apply from ${migrationsPath}/ manually.`,
            });
        }
        catch (error) {
            console.error('[setup_migrate] Error:', error);
            return makeErrorResponse('Cannot connect to the database. Check that your database is running and credentials are correct.');
        }
    });
}
//# sourceMappingURL=setup-migrate.js.map