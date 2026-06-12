/**
 * Google Keep parser (issue #19) — one Takeout JSON file per note.
 *
 * Shape: { title, textContent | listContent[], labels[], isArchived,
 * isTrashed, userEditedTimestampUsec }. Archived/trashed notes return []
 * (surfaced as skipped_empty). Detection is content refinement in
 * detect.ts (object root + Keep-specific keys), so plain JSON objects
 * keep the generic parser.
 */
import type { Parser } from '../types.js';
export declare const parseKeep: Parser;
//# sourceMappingURL=keep.d.ts.map