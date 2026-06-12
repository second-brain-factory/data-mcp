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

import type { IngestItem, Parser } from '../types.js';
import { conversationItems, toIsoDate, type ChatMessage, type ConversationInput } from './conversation.js';

interface GptMessageContent {
    content_type?: string;
    parts?: unknown[];
    text?: string;
}

interface GptMessage {
    author?: { role?: string };
    content?: GptMessageContent;
    create_time?: number;
}

interface GptNode {
    id?: string;
    message?: GptMessage | null;
    parent?: string | null;
    children?: string[];
}

interface GptConversation {
    title?: string;
    create_time?: number;
    mapping?: Record<string, GptNode>;
    current_node?: string;
}

/** Extract display text from a message; '' when there is nothing to keep. */
function messageText(msg: GptMessage): string {
    const content = msg.content;
    if (!content) return '';
    if (content.content_type === 'text' && Array.isArray(content.parts)) {
        return content.parts.filter((p): p is string => typeof p === 'string').join('\n').trim();
    }
    // multimodal_text: keep the string parts (images etc. are dropped)
    if (content.content_type === 'multimodal_text' && Array.isArray(content.parts)) {
        return content.parts.filter((p): p is string => typeof p === 'string').join('\n').trim();
    }
    return ''; // code / execution_output / browser etc. — handled as tool use
}

/** Walk backward from current_node via parent pointers; returns oldest-first. */
function canonicalPath(mapping: Record<string, GptNode>, currentNode: string): GptNode[] {
    const path: GptNode[] = [];
    const visited = new Set<string>();
    let cursor: string | null | undefined = currentNode;
    while (cursor && !visited.has(cursor)) {
        visited.add(cursor);
        const node: GptNode | undefined = mapping[cursor];
        if (!node) return []; // dangling pointer — caller skips the conversation
        path.push(node);
        cursor = node.parent;
    }
    return path.reverse();
}

const TOOL_ROLES = new Set(['tool']);
const TOOL_CONTENT_TYPES = new Set(['code', 'execution_output', 'tether_quote', 'tether_browsing_display']);

export const parseChatGpt: Parser = (content: string): IngestItem[] => {
    const parsed = JSON.parse(content) as GptConversation[];
    if (!Array.isArray(parsed)) return [];

    const conversations: ConversationInput[] = [];
    const sorted = [...parsed].sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0));

    for (const convo of sorted) {
        if (!convo || typeof convo.mapping !== 'object' || !convo.mapping || typeof convo.current_node !== 'string') continue;
        const path = canonicalPath(convo.mapping, convo.current_node);
        if (path.length === 0) continue; // dangling current_node — skip, batch continues

        const messages: ChatMessage[] = [];
        for (const node of path) {
            const msg = node.message;
            if (!msg) continue;
            const role = msg.author?.role ?? '';
            if (role === 'system') continue;

            const isToolish = TOOL_ROLES.has(role) || TOOL_CONTENT_TYPES.has(msg.content?.content_type ?? '');
            if (isToolish) {
                // Collapse consecutive tool activity into one marker
                if (messages.length === 0 || messages[messages.length - 1].text !== '[tool use]') {
                    messages.push({ role: 'Assistant', text: '[tool use]' });
                }
                continue;
            }
            if (role !== 'user' && role !== 'assistant') continue;
            const text = messageText(msg);
            if (text.length === 0) continue;
            messages.push({ role: role === 'user' ? 'User' : 'Assistant', text });
        }

        // Skip conversations with no real user/assistant content
        if (!messages.some((m) => m.text !== '[tool use]')) continue;

        conversations.push({
            title: convo.title ?? '',
            messages,
            date: toIsoDate(convo.create_time),
        });
    }
    return conversationItems(conversations, ['chatgpt', 'conversation']);
};
