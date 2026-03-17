/**
 * Adapter factory — creates the correct DataAdapter based on configuration.
 *
 * Always wraps the adapter in SchemaMapProxy (transparent if no mappings).
 */

import type { Config } from '../config.js';
import type { DataAdapter } from './types.js';
import { PocketBaseAdapter } from './pocketbase.js';
import { SupabaseAdapter } from './supabase.js';
import { SchemaMap, SchemaMapProxy } from './schema-map.js';

export function createAdapter(config: Config): DataAdapter {
  let adapter: DataAdapter;

  if (config.backend === 'pocketbase') {
    adapter = new PocketBaseAdapter(
      config.pocketbaseUrl,
      config.pocketbaseAdminEmail,
      config.pocketbaseAdminPassword
    );
  } else {
    adapter = new SupabaseAdapter(
      config.supabaseUrl,
      config.supabaseKey
    );
  }

  const schemaMap = new SchemaMap(config.schemaMap);
  if (!schemaMap.isEmpty) {
    return new SchemaMapProxy(adapter, schemaMap);
  }

  return adapter;
}
