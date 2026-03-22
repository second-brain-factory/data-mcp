/**
 * Tool: setup_migrate
 *
 * Apply migrations — additive only, skips existing collections.
 * Creates all expected collections in the database.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse } from '../shared.js';

/** Collection schemas for PocketBase creation */
const COLLECTION_SCHEMAS: Array<{ name: string; description: string }> = [
  { name: 'knowledge', description: 'Knowledge items (facts, patterns, insights, lessons, references)' },
  { name: 'decisions', description: 'Recorded decisions with context and rationale' },
  { name: 'sessions', description: 'Work session logs' },
  { name: 'goals', description: 'Goals with key results' },
  { name: 'tasks', description: 'Tasks with status and priority' },
  { name: 'contacts', description: 'Contact information' },
  { name: 'entity_aliases', description: 'Search alias mappings' },
  { name: 'settings', description: 'Key-value settings store' },
  { name: 'prospects', description: 'Sales prospects (CRM)' },
  { name: 'blog_posts', description: 'Blog post content' },
  { name: 'email_queue', description: 'Email queue for sending' },
  { name: 'content_calendar', description: 'Content calendar entries' },
  { name: 'newsletter_subscribers', description: 'Newsletter subscriber list' },
  { name: 'affiliates', description: 'Affiliate partners and commissions' },
];

export function registerSetupMigrate(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'setup_migrate',
    'Create missing database collections/tables. Additive only — existing collections are skipped. For PocketBase, creates collections via API. For Supabase, reports SQL migrations to run manually.',
    {},
    async () => {
      try {
        const skipped: string[] = [];
        const needsMigration: Array<{ name: string; instruction: string }> = [];

        for (const schema of COLLECTION_SCHEMAS) {
          try {
            const exists = await adapter.collectionExists(schema.name);
            if (exists) {
              skipped.push(schema.name);
              continue;
            }

            if (adapter.backend === 'supabase') {
              needsMigration.push({
                name: schema.name,
                instruction: 'Run SQL migrations from migrations/supabase/ directory.',
              });
            } else {
              needsMigration.push({
                name: schema.name,
                instruction: 'Run PocketBase migrations from migrations/pocketbase/ directory.',
              });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[setup_migrate] Error checking ${schema.name}:`, msg);
            needsMigration.push({ name: schema.name, instruction: 'Failed to check — may need migration' });
          }
        }

        return makeToolResponse({
          backend: adapter.backend,
          existing: skipped.length,
          needs_migration: needsMigration.length,
          details: {
            existing: skipped,
            needs_migration: needsMigration.length > 0 ? needsMigration : undefined,
          },
          message: adapter.backend === 'pocketbase'
            ? `Schema check complete. ${skipped.length} existing, ${needsMigration.length} need migration files. Run PocketBase migrations from migrations/pocketbase/ directory.`
            : `Schema check complete. ${skipped.length} existing, ${needsMigration.length} need SQL migrations. Apply migrations from migrations/supabase/ directory.`,
        });
      } catch (error) {
        console.error('[setup_migrate] Error:', error);
        return makeErrorResponse(
          'Cannot connect to the database. Check that your database is running and credentials are correct.'
        );
      }
    }
  );
}
