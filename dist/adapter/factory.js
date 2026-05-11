/**
 * Adapter factory — creates the correct DataAdapter based on configuration.
 *
 * Always wraps the adapter in SchemaMapProxy (transparent if no mappings).
 */
import { PocketBaseAdapter } from './pocketbase.js';
import { SupabaseAdapter } from './supabase.js';
import { MarkdownAdapter } from './markdown.js';
import { SchemaMap, SchemaMapProxy } from './schema-map.js';
export function createAdapter(config) {
    let adapter;
    if (config.backend === 'pocketbase') {
        adapter = new PocketBaseAdapter(config.pocketbaseUrl, config.pocketbaseAdminEmail, config.pocketbaseAdminPassword);
    }
    else if (config.backend === 'markdown') {
        adapter = new MarkdownAdapter(config.markdownRoot);
    }
    else {
        adapter = new SupabaseAdapter(config.supabaseUrl, config.supabaseKey);
    }
    const schemaMap = new SchemaMap(config.schemaMap);
    if (!schemaMap.isEmpty) {
        return new SchemaMapProxy(adapter, schemaMap);
    }
    return adapter;
}
//# sourceMappingURL=factory.js.map