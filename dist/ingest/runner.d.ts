/**
 * Ingest runner — walks a path, detects formats, parses files via the
 * registry, dedupes against existing knowledge, and writes records through
 * the adapter. Parsers stay pure; ALL I/O lives here.
 *
 * Dedupe contract (matches knowledge_store): lookup by (type, title) exact,
 * plus owner_scope when the adapter supports it. A sha256 content_hash is
 * stored in metadata so re-ingests of changed files are detected and
 * reported (skipped with changed:true — updating is out of scope v1).
 */
import type { DataAdapter } from '../adapter/types.js';
import type { IngestSummary } from './types.js';
import { type Converter } from './convert.js';
export declare const MAX_FILES = 200;
export declare const MAX_FILE_BYTES: number;
/**
 * Recognized workspace exports (issue #19) routinely exceed 200 files
 * (Notion trees, Slack day files), so the cap rises inside a detected
 * export context. Plain directories keep MAX_FILES.
 */
export declare const EXPORT_MAX_FILES = 2000;
/**
 * Chat exports (issue #18): a heavy user's conversations.json easily
 * exceeds 10MB, so files with that exact name get a dedicated cap.
 */
export declare const CHAT_EXPORT_MAX_BYTES: number;
/**
 * mbox sanity cap (issue #20). Streamed — never loaded whole — so the cap
 * is a guard against pathological inputs, not a memory bound.
 */
export declare const MBOX_MAX_BYTES: number;
export interface IngestOptions {
    /** File or directory to ingest (absolute or cwd-relative) */
    path: string;
    /** Preview without writing (default true at the tool layer) */
    dryRun: boolean;
    /** Passed through to created records when the adapter supports scoping */
    ownerScope?: 'private' | 'shared';
    /** Paths the runner must refuse to ingest (e.g. markdown adapter root) */
    forbiddenRoots?: string[];
    /** Office-document converter (injectable for tests; default markitdown sidecar) */
    converter?: Converter;
    /** Ingest bulk mail (List-Unsubscribe / Precedence: bulk) — default false (issue #20) */
    includeBulk?: boolean;
}
/** sha256 of normalized (trimmed) content */
export declare function contentHash(content: string): string;
/** Execute an ingest run. Per-file errors never abort the batch. */
export declare function runIngest(adapter: DataAdapter, opts: IngestOptions): Promise<IngestSummary>;
//# sourceMappingURL=runner.d.ts.map