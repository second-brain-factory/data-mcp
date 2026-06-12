/**
 * Tool registration — imports and calls all 22 register functions.
 *
 * Issue #13 consolidated 27 thin CRUD tools into the 4 generic record_*
 * tools (see src/tools/records/registry.ts). Behavior-rich tools keep
 * dedicated registrations.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DataAdapter } from '../adapter/types.js';
// Memory tools (13)
import { registerKnowledgeStore } from './memory/knowledge-store.js';
import { registerKnowledgeRecall } from './memory/knowledge-recall.js';
import { registerKnowledgeLearn } from './memory/knowledge-learn.js';
import { registerKnowledgeValidate } from './memory/knowledge-validate.js';
import { registerSessionLog } from './memory/session-log.js';
import { registerHandoffCreate } from './memory/handoff-create.js';
import { registerHandoffUpdate } from './memory/handoff-update.js';
import { registerHandoffList } from './memory/handoff-list.js';
import { registerBrainStats } from './memory/brain-stats.js';
import { registerBrainDecay } from './memory/brain-decay.js';
import { registerLinkCreate } from './memory/link-create.js';
import { registerLinkRelated } from './memory/link-related.js';
import { registerLinkSuggest } from './memory/link-suggest.js';
// Generic record tools (4)
import { registerRecordCreate } from './records/record-create.js';
import { registerRecordUpdate } from './records/record-update.js';
import { registerRecordQuery } from './records/record-query.js';
import { registerRecordDelete } from './records/record-delete.js';
// Ingest tool (1)
import { registerIngest } from './ingest/ingest.js';
// Setup tools (4)
import { registerSetupStatus } from './setup/setup-status.js';
import { registerSetupMigrate } from './setup/setup-migrate.js';
import { registerSetupBootstrap } from './setup/setup-bootstrap.js';
import { registerSetupSeed } from './setup/setup-seed.js';
export function registerAllTools(server: McpServer, adapter: DataAdapter): void {
    // Memory tools
    registerKnowledgeStore(server, adapter);
    registerKnowledgeRecall(server, adapter);
    registerKnowledgeLearn(server, adapter);
    registerKnowledgeValidate(server, adapter);
    registerSessionLog(server, adapter);
    registerHandoffCreate(server, adapter);
    registerHandoffUpdate(server, adapter);
    registerHandoffList(server, adapter);
    registerBrainStats(server, adapter);
    registerBrainDecay(server, adapter);
    registerLinkCreate(server, adapter);
    registerLinkRelated(server, adapter);
    registerLinkSuggest(server, adapter);
    // Generic record tools
    registerRecordCreate(server, adapter);
    registerRecordUpdate(server, adapter);
    registerRecordQuery(server, adapter);
    registerRecordDelete(server, adapter);
    // Ingest tool
    registerIngest(server, adapter);
    // Setup tools
    registerSetupStatus(server, adapter);
    registerSetupMigrate(server, adapter);
    registerSetupBootstrap(server, adapter);
    registerSetupSeed(server, adapter);
}
