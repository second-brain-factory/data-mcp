/**
 * Tool: knowledge_store
 *
 * Stores a knowledge item with dedup by (type, title).
 * Auto-generates summary from content.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerKnowledgeStore(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=knowledge-store.d.ts.map