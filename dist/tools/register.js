/**
 * Tool registration — imports and calls all 39 register functions.
 */
// Memory tools (26)
import { registerKnowledgeStore } from './memory/knowledge-store.js';
import { registerKnowledgeRecall } from './memory/knowledge-recall.js';
import { registerKnowledgeLearn } from './memory/knowledge-learn.js';
import { registerKnowledgeDecide } from './memory/knowledge-decide.js';
import { registerKnowledgeValidate } from './memory/knowledge-validate.js';
import { registerKnowledgeUpdate } from './memory/knowledge-update.js';
import { registerKnowledgeDelete } from './memory/knowledge-delete.js';
import { registerKnowledgeList } from './memory/knowledge-list.js';
import { registerSessionLog } from './memory/session-log.js';
import { registerSessionList } from './memory/session-list.js';
import { registerGoalCreate } from './memory/goal-create.js';
import { registerGoalUpdate } from './memory/goal-update.js';
import { registerGoalList } from './memory/goal-list.js';
import { registerTaskCreate } from './memory/task-create.js';
import { registerTaskUpdate } from './memory/task-update.js';
import { registerTaskList } from './memory/task-list.js';
import { registerContactCreate } from './memory/contact-create.js';
import { registerContactUpdate } from './memory/contact-update.js';
import { registerContactList } from './memory/contact-list.js';
import { registerContactSearch } from './memory/contact-search.js';
import { registerBrainStats } from './memory/brain-stats.js';
import { registerBrainDecay } from './memory/brain-decay.js';
import { registerLinkCreate } from './memory/link-create.js';
import { registerLinkDelete } from './memory/link-delete.js';
import { registerLinkRelated } from './memory/link-related.js';
import { registerLinkSuggest } from './memory/link-suggest.js';
// Setup tools (3)
import { registerSetupStatus } from './setup/setup-status.js';
import { registerSetupMigrate } from './setup/setup-migrate.js';
import { registerSetupSeed } from './setup/setup-seed.js';
// Business tools (11)
import { registerProspectCreate } from './business/prospect-create.js';
import { registerProspectUpdate } from './business/prospect-update.js';
import { registerProspectList } from './business/prospect-list.js';
import { registerProspectSearch } from './business/prospect-search.js';
import { registerBlogCreate } from './business/blog-create.js';
import { registerBlogUpdate } from './business/blog-update.js';
import { registerBlogList } from './business/blog-list.js';
import { registerBlogDelete } from './business/blog-delete.js';
import { registerEmailQueueAdd } from './business/email-queue-add.js';
import { registerContentQueueAdd } from './business/content-queue-add.js';
import { registerContentQueueList } from './business/content-queue-list.js';
export function registerAllTools(server, adapter) {
    // Memory tools
    registerKnowledgeStore(server, adapter);
    registerKnowledgeRecall(server, adapter);
    registerKnowledgeLearn(server, adapter);
    registerKnowledgeDecide(server, adapter);
    registerKnowledgeValidate(server, adapter);
    registerKnowledgeUpdate(server, adapter);
    registerKnowledgeDelete(server, adapter);
    registerKnowledgeList(server, adapter);
    registerSessionLog(server, adapter);
    registerSessionList(server, adapter);
    registerGoalCreate(server, adapter);
    registerGoalUpdate(server, adapter);
    registerGoalList(server, adapter);
    registerTaskCreate(server, adapter);
    registerTaskUpdate(server, adapter);
    registerTaskList(server, adapter);
    registerContactCreate(server, adapter);
    registerContactUpdate(server, adapter);
    registerContactList(server, adapter);
    registerContactSearch(server, adapter);
    registerBrainStats(server, adapter);
    registerBrainDecay(server, adapter);
    registerLinkCreate(server, adapter);
    registerLinkDelete(server, adapter);
    registerLinkRelated(server, adapter);
    registerLinkSuggest(server, adapter);
    // Setup tools
    registerSetupStatus(server, adapter);
    registerSetupMigrate(server, adapter);
    registerSetupSeed(server, adapter);
    // Business tools
    registerProspectCreate(server, adapter);
    registerProspectUpdate(server, adapter);
    registerProspectList(server, adapter);
    registerProspectSearch(server, adapter);
    registerBlogCreate(server, adapter);
    registerBlogUpdate(server, adapter);
    registerBlogList(server, adapter);
    registerBlogDelete(server, adapter);
    registerEmailQueueAdd(server, adapter);
    registerContentQueueAdd(server, adapter);
    registerContentQueueList(server, adapter);
}
//# sourceMappingURL=register.js.map