/**
 * Shared chat-conversation helpers (issue #18) — transcript building,
 * message-boundary chunking, and within-export title dedupe used by both
 * the ChatGPT and Claude export parsers.
 *
 * Why message-boundary chunking instead of chunkText: a conversation's
 * natural unit is the message. Splitting mid-message destroys Q/A pairing;
 * packing whole messages into chunks keeps each part readable on recall.
 */
import type { IngestItem } from '../types.js';
/** Max characters per conversation record before (part n/m) splitting. */
export declare const MAX_CONVERSATION_CHARS = 8000;
export interface ChatMessage {
    /** Normalized role label, e.g. "User" | "Assistant" */
    role: string;
    text: string;
}
/**
 * Pack whole messages into chunks of at most MAX_CONVERSATION_CHARS.
 * A single message longer than the limit falls back to chunkText for that
 * message alone — never splits across two messages otherwise (AC3).
 */
export declare function chunkConversation(messages: ChatMessage[], maxChars?: number): string[];
export interface ConversationInput {
    title: string;
    messages: ChatMessage[];
    /** ISO date string for metadata.conversation_date (optional) */
    date?: string;
}
/**
 * Map parsed conversations to ingest items: one record per conversation
 * (split into parts when long), with deterministic " (2)", " (3)" suffixes
 * for duplicate titles within the export — dedupe is (type,title), so
 * same-title conversations would silently drop without this.
 * Callers must pass conversations in a stable order (sorted by date).
 */
export declare function conversationItems(conversations: ConversationInput[], tags: string[]): IngestItem[];
/** Normalize an epoch-seconds or ISO timestamp to an ISO string, or undefined. */
export declare function toIsoDate(value: unknown): string | undefined;
//# sourceMappingURL=conversation.d.ts.map