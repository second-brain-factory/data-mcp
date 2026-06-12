/**
 * Email thread grouping + rendering (issue #20) — PURE functions over
 * ParsedEmail arrays. One knowledge record per thread.
 *
 * Grouping: References/In-Reply-To chains first (union-find over message
 * IDs), normalized subject (Re:/Fwd: stripped, case-insensitive) as the
 * fallback key for messages with no ID linkage (AC3).
 *
 * Quoted-reply trimming (AC4): inside a multi-message thread, contiguous
 * `>`-quoted blocks of >= 2 lines and their "On ... wrote:" attribution
 * lines duplicate earlier messages, so they are dropped. Single-line inline
 * quotes survive (people quote one line to reply to it). Single-message
 * threads keep their body untrimmed — there is nothing to duplicate.
 *
 * Bulk mail (AC5): messages flagged isBulk are excluded by default
 * (List-Unsubscribe / Precedence: bulk|list|junk); includeBulk keeps them.
 */
import type { IngestItem } from '../types.js';
import type { ParsedEmail } from './mime.js';
/** Strip reply/forward prefixes for subject-based grouping (AC3). */
export declare function normalizeSubject(subject: string): string;
/**
 * Trim quoted-reply blocks from a body (AC4): drop contiguous runs of >= 2
 * `>`-prefixed lines plus the attribution line ("On ... wrote:" or
 * "----- Original Message -----" style) directly above them.
 */
export declare function trimQuotedReplies(body: string): string;
export interface ThreadGroupOptions {
    includeBulk?: boolean;
}
export interface ThreadGroupResult {
    items: IngestItem[];
    /** Parallel to items: input index of the thread's first (oldest) message */
    origins: number[];
    /** Input indices of messages excluded by the bulk heuristic */
    bulkIndices: number[];
}
/**
 * Group messages into threads via References/In-Reply-To chains with a
 * normalized-subject fallback, then render one IngestItem per thread.
 * Pure: stable output for a given input order. `origins` lets the runner
 * attribute each record to a source file in .eml directory mode.
 */
export declare function groupEmailThreads(emails: ParsedEmail[], opts?: ThreadGroupOptions): ThreadGroupResult;
//# sourceMappingURL=threads.d.ts.map