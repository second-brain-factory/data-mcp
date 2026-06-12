/**
 * Claude data-export parser (issue #18) — PURE function over the
 * conversations.json found in Claude's official data export (Settings →
 * Export). Shape (verified against real exports, 2026-06):
 *
 *   [{ uuid, name, created_at, chat_messages: [{ sender, text | content[], created_at }] }]
 *
 * Older exports put message text in `text`; newer ones use
 * `content: [{type:'text', text}]` blocks. Both are handled.
 * One knowledge record per conversation; long ones split at message
 * boundaries with "(part n/m)".
 */
import type { Parser } from '../types.js';
export declare const parseClaude: Parser;
//# sourceMappingURL=claude.d.ts.map