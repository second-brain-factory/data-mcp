#!/usr/bin/env node
/**
 * @iwo-szapar/data-mcp entry point
 *
 * Parses configuration, creates the appropriate adapter,
 * builds the MCP server, and connects via stdio transport.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseConfig } from './config.js';
import { createAdapter } from './adapter/factory.js';
import { createServer } from './server.js';
async function main() {
    try {
        const config = parseConfig();
        const adapter = createAdapter(config);
        const server = createServer(adapter);
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error(`[data-mcp] Started with ${config.backend} backend`);
    }
    catch (error) {
        console.error('[data-mcp] Fatal error:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map