/**
 * Adapter factory — creates the correct DataAdapter based on configuration.
 *
 * Wraps adapters in SchemaMapProxy and optional OwnerScopeProxy.
 */
import type { Config } from '../config.js';
import type { DataAdapter } from './types.js';
export declare function createAdapter(config: Config): DataAdapter;
//# sourceMappingURL=factory.d.ts.map
