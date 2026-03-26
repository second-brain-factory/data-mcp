/**
 * Tool: knowledge_validate
 *
 * Batch update last_validated_at for knowledge items by IDs.
 * Resets the decay clock — marks items as still relevant.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../../adapter/types.js';
export declare function registerKnowledgeValidate(server: McpServer, adapter: DataAdapter): void;
//# sourceMappingURL=knowledge-validate.d.ts.map