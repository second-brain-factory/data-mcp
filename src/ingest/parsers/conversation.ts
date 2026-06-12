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
import { chunkText, titleChunks } from '../chunk.js';

/** Max characters per conversation record before (part n/m) splitting. */
export const MAX_CONVERSATION_CHARS = 8000;

export interface ChatMessage {
    /** Normalized role label, e.g. "User" | "Assistant" */
    role: string;
    text: string;
}

/** Render one message as a transcript block. */
function renderMessage(msg: ChatMessage): string {
    return `${msg.role}: ${msg.text.trim()}`;
}

/**
 * Pack whole messages into chunks of at most MAX_CONVERSATION_CHARS.
 * A single message longer than the limit falls back to chunkText for that
 * message alone — never splits across two messages otherwise (AC3).
 */
export function chunkConversation(messages: ChatMessage[], maxChars: number = MAX_CONVERSATION_CHARS): string[] {
    const chunks: string[] = [];
    let current = '';

    const flush = () => {
        if (current.trim().length > 0) chunks.push(current.trim());
        current = '';
    };

    for (const msg of messages) {
        const block = renderMessage(msg);
        if (block.length > maxChars) {
            flush();
            chunks.push(...chunkText(block, maxChars));
            continue;
        }
        if (current.length + block.length + 2 > maxChars) flush();
        current = current.length > 0 ? `${current}\n\n${block}` : block;
    }
    flush();
    return chunks;
}

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
export function conversationItems(conversations: ConversationInput[], tags: string[]): IngestItem[] {
    const titleCounts = new Map<string, number>();
    const items: IngestItem[] = [];

    for (const convo of conversations) {
        const chunks = chunkConversation(convo.messages);
        if (chunks.length === 0) continue;

        const baseTitle = convo.title.trim() || 'Untitled conversation';
        const seen = titleCounts.get(baseTitle) ?? 0;
        titleCounts.set(baseTitle, seen + 1);
        const title = seen === 0 ? baseTitle : `${baseTitle} (${seen + 1})`;

        for (const { title: t, content } of titleChunks(title, chunks)) {
            items.push({
                title: t,
                content,
                type: 'reference',
                tags,
                source_meta: convo.date ? { conversation_date: convo.date } : undefined,
            });
        }
    }
    return items;
}

/** Normalize an epoch-seconds or ISO timestamp to an ISO string, or undefined. */
export function toIsoDate(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return new Date(value * 1000).toISOString();
    }
    if (typeof value === 'string' && value.length > 0) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return undefined;
}
