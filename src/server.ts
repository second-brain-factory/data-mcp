/**
 * MCP Server creation.
 *
 * Creates a configured McpServer with all tools registered.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from './adapter/types.js';
import { registerAllTools } from './tools/register.js';
const PACKAGE_VERSION: string = (() => {
    try {
        const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
        return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
})();
/**
 * Server instructions — load-bearing under client-side tool search (Claude
 * Code MCP Tool Search, API defer_loading): when tool definitions are
 * deferred, THIS text is how the model decides whether to search this
 * server for a tool. Rules: key terms first, capability categories with
 * activation phrases, tool-name PREFIXES not exhaustive inventories (lists
 * go stale — this one listed 41 tools after we shipped 44), under 2KB
 * (Claude Code truncates beyond that).
 */
const SERVER_INSTRUCTIONS = `Second Brain memory and data layer: persistent knowledge, decisions, work sessions, team handoffs, goals, tasks, contacts, and CRM/content pipelines. Search here whenever the user wants to remember, recall, save, learn, decide, log work, hand off work, or manage their pipeline.

Capabilities by tool prefix:
- knowledge_* / link_* — store, recall (search), learn insights, record decisions, validate freshness, link related items into a graph. Use BEFORE answering questions about past work or stored context, and to save anything worth remembering.
- session_* — log a work session's summary, decisions, and next steps; review past sessions. Use at the end of significant work.
- handoff_* — pass work between team members with full investigation context (what was tried, assumptions, what to re-verify). Use handoff_list with to_member "me" to see work waiting for you.
- goal_* / task_* — goals with key results; tasks with status and priority.
- contact_* / prospect_* — people and CRM pipeline (create, update, search).
- blog_* / email_queue_* / content_queue_* — content drafts, outbound email queue (no sending), content calendar.
- brain_* — stats and staleness decay reports for the whole brain.
- setup_* — database status, migration report, seeding. Use setup_status when data tools fail.

Conventions: search with knowledge_recall before storing to avoid duplicates. In team mode, writes default to private; pass owner_scope "shared" for the team. Handoffs default to shared.`;
export function createServer(adapter: DataAdapter): McpServer {
    const server = new McpServer({
        name: '@second-brain/data-mcp',
        version: PACKAGE_VERSION,
    }, {
        instructions: SERVER_INSTRUCTIONS,
    });
    registerAllTools(server, adapter);
    return server;
}
