/**
 * Adapter factory — creates the correct DataAdapter based on configuration.
 *
 * Always wraps the adapter in SchemaMapProxy (transparent if no mappings).
 */
import type { Config } from '../config.js';
import type { DataAdapter } from './types.js';
export declare function createAdapter(config: Config): DataAdapter;
//# sourceMappingURL=factory.d.ts.map