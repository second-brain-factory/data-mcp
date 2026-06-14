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
- knowledge_* / link_* — store, recall (search), learn insights, validate freshness, link related items into a graph. Use BEFORE answering questions about past work or stored context, and to save anything worth remembering.
- record_* — generic create/update/query/delete for every other collection: decisions, goals, tasks, contacts, prospects (CRM stages), blog_posts, content_calendar, email_queue (queue only, no sending). Pass the collection name plus a data payload; invalid fields return the expected schema.
- session_* — log a work session's summary, decisions, and next steps. Use at the end of significant work; list past sessions via record_query.
- handoff_* — pass work between team members with full investigation context (what was tried, assumptions, what to re-verify). Use handoff_list with to_member "me" to see work waiting for you.
- brain_* — stats and staleness decay reports for the whole brain.
- ingest — bulk-import local files/directories (markdown, text, csv, json, html, enex; eml/mbox email archives; pdf/docx/xlsx/pptx with markitdown; ChatGPT/Claude/Notion/Slack/Keep exports auto-detected) into knowledge records. Use when the user wants to import, load, or migrate existing notes, documents, workspaces, email, or conversation history. Dry-run preview by default.
- setup_* — database status, migration report, seeding. Use setup_status when data tools fail.

Conventions: search with knowledge_recall before storing to avoid duplicates. In team mode, writes default to private; pass owner_scope "shared" for the team. Handoffs default to shared.`;
export function createServer(adapter) {
    const server = new McpServer({
        name: '@iwo-szapar/data-mcp',
        version: PACKAGE_VERSION,
    }, {
        instructions: SERVER_INSTRUCTIONS,
    });
    registerAllTools(server, adapter);
    return server;
}
//# sourceMappingURL=server.js.map