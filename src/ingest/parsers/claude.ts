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

import type { IngestItem, Parser } from '../types.js';
import { conversationItems, toIsoDate, type ChatMessage, type ConversationInput } from './conversation.js';

interface ClaudeContentBlock {
    type?: string;
    text?: string;
}

interface ClaudeMessage {
    sender?: string;
    text?: string;
    content?: ClaudeContentBlock[];
    created_at?: string;
}

interface ClaudeConversation {
    uuid?: string;
    name?: string;
    created_at?: string;
    chat_messages?: ClaudeMessage[];
}

function messageText(msg: ClaudeMessage): string {
    if (typeof msg.text === 'string' && msg.text.trim().length > 0) return msg.text;
    if (Array.isArray(msg.content)) {
        return msg.content
            .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text as string)
            .join('\n')
            .trim();
    }
    return '';
}

export const parseClaude: Parser = (content: string): IngestItem[] => {
    const parsed = JSON.parse(content) as ClaudeConversation[];
    if (!Array.isArray(parsed)) return [];

    const conversations: ConversationInput[] = [];
    const sorted = [...parsed].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));

    for (const convo of sorted) {
        if (!convo || !Array.isArray(convo.chat_messages)) continue;
        const messages: ChatMessage[] = [];
        for (const msg of convo.chat_messages) {
            const text = messageText(msg);
            if (text.length === 0) continue;
            messages.push({ role: msg.sender === 'human' ? 'User' : 'Assistant', text });
        }
        if (messages.length === 0) continue;
        conversations.push({
            title: convo.name ?? '',
            messages,
            date: toIsoDate(convo.created_at),
        });
    }
    return conversationItems(conversations, ['claude', 'conversation']);
};
