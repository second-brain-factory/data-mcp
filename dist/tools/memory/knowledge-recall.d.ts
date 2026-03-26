/**
 * Tool: knowledge_recall
 *
 * Full-text search across knowledge and decisions.
 * Uses alias expansion to broaden queries.
 * Empty query returns most recent items.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerKnowledgeRecall(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=knowledge-recall.d.ts.map