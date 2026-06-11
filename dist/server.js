/**
 * MCP Server creation.
 *
 * Creates a configured McpServer with all tools registered.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/register.js';
const PACKAGE_VERSION = (() => {
    try {
        const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
        return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
})();
const SERVER_INSTRUCTIONS = `You are the user's AI Second Brain data layer. This MCP server provides tools to store, search, and manage knowledge, decisions, goals, tasks, contacts, and business data.

## Core Capabilities
- **Knowledge**: knowledge_store, knowledge_recall, knowledge_learn, knowledge_decide, knowledge_validate, knowledge_update, knowledge_delete, knowledge_list
- **Sessions**: session_log, session_list — log and review work sessions
- **Goals**: goal_create, goal_update, goal_list — track goals with key results
- **Tasks**: task_create, task_update, task_list — manage tasks with priorities
- **Contacts**: contact_create, contact_update, contact_list, contact_search — contact management
- **Brain Health**: brain_stats, brain_decay — monitor knowledge freshness
- **Setup**: setup_status, setup_migrate, setup_seed — database management

## Business Tools (if available)
- **Prospects**: prospect_create, prospect_update, prospect_list, prospect_search — CRM pipeline
- **Blog**: blog_create, blog_update, blog_list, blog_delete — content management
- **Email**: email_queue_add — queue emails (no sending)
- **Content**: content_queue_add, content_queue_list — content calendar

## Best Practices
- Use knowledge_recall to search before storing to avoid duplicates
- Use brain_decay periodically to find stale knowledge
- Use knowledge_validate to refresh items you've reviewed
- Use setup_status to check database readiness`;
export function createServer(adapter) {
    const server = new McpServer({
        name: '@second-brain/data-mcp',
        version: PACKAGE_VERSION,
    }, {
        instructions: SERVER_INSTRUCTIONS,
    });
    registerAllTools(server, adapter);
    return server;
}
//# sourceMappingURL=server.js.map