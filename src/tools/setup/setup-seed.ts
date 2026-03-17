/**
 * Tool: setup_seed
 *
 * Seed entity aliases and default settings into the database.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
import { makeToolResponse, makeErrorResponse } from '../shared.js';

/** Entity alias seed data — embedded to avoid fs reads in packaged version */
const ENTITY_ALIASES = [
  { canonical: 'stripe', alias: 'payment' },
  { canonical: 'stripe', alias: 'checkout' },
  { canonical: 'stripe', alias: 'pricing' },
  { canonical: 'stripe', alias: 'invoice' },
  { canonical: 'stripe', alias: 'billing' },
  { canonical: 'stripe', alias: 'subscription' },
  { canonical: 'anthropic', alias: 'claude' },
  { canonical: 'anthropic', alias: 'ai' },
  { canonical: 'anthropic', alias: 'llm' },
  { canonical: 'anthropic', alias: 'artificial intelligence' },
  { canonical: 'supabase', alias: 'database' },
  { canonical: 'supabase', alias: 'postgres' },
  { canonical: 'supabase', alias: 'postgresql' },
  { canonical: 'supabase', alias: 'db' },
  { canonical: 'supabase', alias: 'auth' },
  { canonical: 'github', alias: 'git' },
  { canonical: 'github', alias: 'repository' },
  { canonical: 'github', alias: 'repo' },
  { canonical: 'github', alias: 'version control' },
  { canonical: 'github', alias: 'source code' },
  { canonical: 'vercel', alias: 'deployment' },
  { canonical: 'vercel', alias: 'hosting' },
  { canonical: 'vercel', alias: 'serverless' },
  { canonical: 'vercel', alias: 'edge functions' },
  { canonical: 'react', alias: 'frontend' },
  { canonical: 'react', alias: 'ui' },
  { canonical: 'react', alias: 'component' },
  { canonical: 'react', alias: 'jsx' },
  { canonical: 'react', alias: 'tsx' },
  { canonical: 'typescript', alias: 'ts' },
  { canonical: 'typescript', alias: 'type' },
  { canonical: 'typescript', alias: 'typing' },
  { canonical: 'javascript', alias: 'js' },
  { canonical: 'javascript', alias: 'node' },
  { canonical: 'javascript', alias: 'nodejs' },
  { canonical: 'css', alias: 'styling' },
  { canonical: 'css', alias: 'tailwind' },
  { canonical: 'css', alias: 'design' },
  { canonical: 'testing', alias: 'test' },
  { canonical: 'testing', alias: 'vitest' },
  { canonical: 'testing', alias: 'unit test' },
  { canonical: 'testing', alias: 'integration test' },
  { canonical: 'api', alias: 'endpoint' },
  { canonical: 'api', alias: 'rest' },
  { canonical: 'api', alias: 'http' },
  { canonical: 'api', alias: 'route' },
  { canonical: 'mcp', alias: 'model context protocol' },
  { canonical: 'mcp', alias: 'tools' },
  { canonical: 'mcp', alias: 'server' },
  { canonical: 'email', alias: 'resend' },
  { canonical: 'email', alias: 'newsletter' },
  { canonical: 'email', alias: 'mail' },
  { canonical: 'pocketbase', alias: 'pb' },
  { canonical: 'pocketbase', alias: 'local database' },
  { canonical: 'pocketbase', alias: 'sqlite' },
];

const DEFAULT_SETTINGS = [
  { key: 'schema_version', value: '1' },
  { key: 'business_name', value: '' },
  { key: 'support_email', value: '' },
  { key: 'timezone', value: 'UTC' },
  { key: 'currency', value: 'USD' },
];

export function registerSetupSeed(server: McpServer, adapter: DataAdapter): void {
  server.tool(
    'setup_seed',
    'Seed the database with entity aliases (for search expansion) and default settings. Safe to run multiple times — uses upsert.',
    {},
    async () => {
      try {
        let aliasesSeeded = 0;
        let aliasesSkipped = 0;
        let settingsSeeded = 0;
        let settingsSkipped = 0;

        // Seed entity aliases
        const aliasesExist = await adapter.collectionExists('entity_aliases');
        if (aliasesExist) {
          for (const alias of ENTITY_ALIASES) {
            try {
              await adapter.upsert('entity_aliases', alias, ['canonical', 'alias']);
              aliasesSeeded++;
            } catch {
              aliasesSkipped++;
            }
          }
        } else {
          aliasesSkipped = ENTITY_ALIASES.length;
        }

        // Seed default settings
        const settingsExist = await adapter.collectionExists('settings');
        if (settingsExist) {
          for (const setting of DEFAULT_SETTINGS) {
            try {
              // Only seed if not already set (don't overwrite user settings)
              const existing = await adapter.list<Record<string, unknown>>('settings', {
                filter: [[{ field: 'key', op: 'eq', value: setting.key }]],
                page: { limit: 1, offset: 0 },
              });
              if (existing.items.length === 0) {
                await adapter.create('settings', setting);
                settingsSeeded++;
              } else {
                settingsSkipped++;
              }
            } catch {
              settingsSkipped++;
            }
          }
        } else {
          settingsSkipped = DEFAULT_SETTINGS.length;
        }

        return makeToolResponse({
          entity_aliases: { seeded: aliasesSeeded, skipped: aliasesSkipped, total: ENTITY_ALIASES.length },
          settings: { seeded: settingsSeeded, skipped: settingsSkipped, total: DEFAULT_SETTINGS.length },
          message: `Seeded ${aliasesSeeded} aliases and ${settingsSeeded} settings.`,
        });
      } catch (error) {
        console.error('[setup_seed] Error:', error);
        return makeErrorResponse(
          'Failed to seed database. Check that the database is running and collections exist.'
        );
      }
    }
  );
}
