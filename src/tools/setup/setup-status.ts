/**
 * Tool: setup_status
 *
 * Check backend connection, list existing/missing collections, report status.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import type { SettingsRecord } from '../../types/records.js';
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
];

export function registerSetupStatus(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'setup_status',
    'Check database connection status, list existing and missing collections, and report schema readiness.',
    {},
    { readOnlyHint: true },
    async () => {
      try {
        // Test connection by listing collections
        const existing = await adapter.listCollections();
        const existingSet = new Set(existing);

        const present: string[] = [];
        const missing: string[] = [];

        for (const collection of EXPECTED_COLLECTIONS) {
          if (existingSet.has(collection)) {
            present.push(collection);
          } else {
            missing.push(collection);
          }
        }

        // Check for settings table and schema version
        let schemaVersion: string | null = null;
        if (existingSet.has('settings')) {
          try {
            const results = await adapter.list<SettingsRecord>('settings', {
              filter: [[{ field: 'key', op: 'eq', value: 'schema_version' }]],
              page: { limit: 1, offset: 0 },
            });
            if (results.items.length > 0) {
              schemaVersion = results.items[0].value as string;
            }
          } catch {
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
      } catch (error) {
        console.error('[setup_status] Connection error:', error);
        return makeErrorResponse(
          'Cannot connect to the database. Check that your database is running and credentials are correct.'
        );
      }
    }
  );
}
