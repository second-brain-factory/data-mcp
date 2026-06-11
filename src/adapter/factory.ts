/**
 * Adapter factory — creates the correct DataAdapter based on configuration.
 *
 * Wraps adapters in SchemaMapProxy and optional OwnerScopeProxy.
 */

import type { Config } from '../config.js';
import type { DataAdapter } from './types.js';
import { PocketBaseAdapter } from './pocketbase.js';
import { SupabaseAdapter } from './supabase.js';
import { MarkdownAdapter } from './markdown.js';
import { SchemaMap, SchemaMapProxy } from './schema-map.js';
import { OwnerScopeProxy } from './owner-scope.js';

export function createAdapter(config: Config): DataAdapter {
    let adapter: DataAdapter;
    if (config.backend === 'pocketbase') {
        adapter = new PocketBaseAdapter(config.pocketbaseUrl, config.pocketbaseAdminEmail, config.pocketbaseAdminPassword);
    }
    else if (config.backend === 'markdown') {
        adapter = new MarkdownAdapter(config.markdownRoot);
    }
    else {
        adapter = new SupabaseAdapter(config.supabaseUrl, config.supabaseKey, config.supabaseMemberJwt);
    }
    const schemaMap = new SchemaMap(config.schemaMap);
    if (!schemaMap.isEmpty) {
        adapter = new SchemaMapProxy(adapter, schemaMap);
    }
    if (config.backend !== 'pocketbase' && config.ownerRouting) {
        adapter = new OwnerScopeProxy(adapter, config.ownerRouting);
    }
    return adapter;
}
