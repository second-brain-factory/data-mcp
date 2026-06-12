/**
 * ChatGPT data-export parser (issue #18) — PURE function over the
 * conversations.json in ChatGPT's official export (Settings → Data
 * controls → Export). Shape (verified against real exports + the
 * sanand0/chatgpt-to-markdown reference, 2026-06):
 *
 *   [{ title, create_time, mapping: { id -> node }, current_node }]
 *
 * `mapping` is a node GRAPH: edits and regenerations create branches. The
 * conversation the user last saw is the linked-list walk BACKWARD from
 * `current_node` via `parent` pointers, reversed — branches off that path
 * are intentionally excluded (AC2).
 *
 * Tool/code-interpreter activity is collapsed to a single "[tool use]"
 * marker per run; system and empty messages are skipped.
 */
import type { Parser } from '../types.js';
export declare const parseChatGpt: Parser;
//# sourceMappingURL=chatgpt.d.ts.map