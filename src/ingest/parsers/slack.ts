/**
 * Slack export parser (issue #19) — one record per channel per day file.
 *
 * Day files live at `<channel>/<YYYY-MM-DD>.json` inside a workspace
 * export. Routing happens ONLY inside a detected slack export context
 * (runner pre-pass) so a random date-named JSON elsewhere stays generic.
 *
 * Rendering: `<display_name>: text` with <@U…> mentions resolved via the
 * ctx users map; thread replies grouped under their parent (`  ↳` prefix);
 * join/leave noise and empty bot messages skipped. Title `#<channel>
 * <date>` gives natural re-export dedupe (new days only).
 */

import type { IngestItem, IngestContext, Parser } from '../types.js';
import { titleChunks } from '../chunk.js';
import { chunkConversation, type ChatMessage } from './conversation.js';

interface SlackMessage {
    type?: unknown;
    subtype?: unknown;
    user?: unknown;
    text?: unknown;
    ts?: unknown;
    thread_ts?: unknown;
}

const SKIP_SUBTYPES = new Set(['channel_join', 'channel_leave', 'group_join', 'group_leave', 'channel_topic', 'channel_purpose', 'channel_name']);

/** Resolve <@U123> mentions and unescape Slack's &amp;/&lt;/&gt;. */
export function renderSlackText(text: string, users?: Map<string, string>): string {
    return text
        .replace(/<@([A-Z0-9]+)(?:\|[^>]*)?>/g, (_m, id: string) => `@${users?.get(id) ?? id}`)
        .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
        .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2 ($1)')
        .replace(/<(https?:\/\/[^>]+)>/g, '$1')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

export const parseSlackDay: Parser = (content: string, ctx: IngestContext): IngestItem[] => {
    const parsed = JSON.parse(content); // throws -> per-file error
    if (!Array.isArray(parsed)) return [];
    const users = ctx.export?.users;

    // relPath is `<channel>/<date>.json` (routing guarantees the shape)
    const parts = (ctx.relPath ?? '').split('/');
    const channel = parts.length >= 2 ? parts[parts.length - 2] : 'unknown';
    const date = ctx.baseName;

    const keep = (parsed as SlackMessage[]).filter((m) => {
        if (m?.type !== 'message') return false;
        if (typeof m.subtype === 'string' && SKIP_SUBTYPES.has(m.subtype)) return false;
        const text = typeof m.text === 'string' ? m.text.trim() : '';
        return text.length > 0;
    });
    if (keep.length === 0) return [];

    // Group thread replies under their parent (within this file). A message
    // is a reply when thread_ts is set and differs from its own ts.
    const topLevel: SlackMessage[] = [];
    const replies = new Map<string, SlackMessage[]>();
    for (const m of keep) {
        const ts = typeof m.ts === 'string' ? m.ts : '';
        const threadTs = typeof m.thread_ts === 'string' ? m.thread_ts : '';
        if (threadTs && threadTs !== ts) {
            const list = replies.get(threadTs) ?? [];
            list.push(m);
            replies.set(threadTs, list);
        } else {
            topLevel.push(m);
        }
    }

    const name = (m: SlackMessage) => (typeof m.user === 'string' ? users?.get(m.user) ?? m.user : 'unknown');
    const messages: ChatMessage[] = [];
    const renderInto = (m: SlackMessage, prefix: string) => {
        messages.push({ role: `${prefix}${name(m)}`, text: renderSlackText((m.text as string).trim(), users) });
        const ts = typeof m.ts === 'string' ? m.ts : '';
        for (const reply of replies.get(ts) ?? []) renderInto(reply, '  ↳ ');
    };
    for (const m of topLevel) renderInto(m, '');
    // Orphan replies (parent in another day file): standalone, accepted v1.
    for (const [threadTs, list] of replies) {
        if (!keep.some((m) => m.ts === threadTs && (!m.thread_ts || m.thread_ts === m.ts))) {
            for (const reply of list) messages.push({ role: name(reply), text: renderSlackText((reply.text as string).trim(), users) });
        }
    }
    if (messages.length === 0) return [];

    const title = `#${channel} ${date}`;
    return titleChunks(title, chunkConversation(messages)).map(({ title: t, content: c }) => ({
        title: t,
        content: c,
        type: 'reference',
        tags: ['slack', `#${channel}`],
        source_meta: { date, channel },
    }));
};
