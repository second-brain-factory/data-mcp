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
import { chunkConversation } from '../parsers/conversation.js';
import { titleChunks } from '../chunk.js';
/**
 * Reply/forward prefix. The optional counter group is `(\s*\[\d+\])?` —
 * keeping the leading \s* INSIDE the optional group avoids the adjacent
 * `\s*(...)?\s*` ambiguity that made the previous pattern O(n^2) on
 * space-padded subjects (ReDoS, review finding issue-20 #1).
 */
const SUBJECT_PREFIX = /^(re|fwd?|fw|aw|sv|odp)(\s*\[\d+\])?\s*:\s*/i;
/** Strip reply/forward prefixes for subject-based grouping (AC3). */
export function normalizeSubject(subject) {
    let s = subject.trim();
    for (;;) {
        const next = s.replace(SUBJECT_PREFIX, '');
        if (next === s)
            break;
        s = next;
    }
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
/**
 * Trim quoted-reply blocks from a body (AC4): drop contiguous runs of >= 2
 * `>`-prefixed lines plus the attribution line ("On ... wrote:" or
 * "----- Original Message -----" style) directly above them.
 */
export function trimQuotedReplies(body) {
    const lines = body.split('\n');
    const keep = [];
    let i = 0;
    const isQuoted = (l) => /^\s*>/.test(l);
    const isAttribution = (l) => /^\s*(On .{0,200}wrote:?\s*$|-{2,}\s*(Original Message|Forwarded message)\s*-{2,})/i.test(l);
    while (i < lines.length) {
        if (isQuoted(lines[i])) {
            let j = i;
            while (j < lines.length && (isQuoted(lines[j]) || lines[j].trim() === ''))
                j++;
            const quotedCount = lines.slice(i, j).filter(isQuoted).length;
            if (quotedCount >= 2) {
                // drop the block, plus a preceding attribution line
                while (keep.length > 0 && (isAttribution(keep[keep.length - 1]) || keep[keep.length - 1].trim() === ''))
                    keep.pop();
                i = j;
                continue;
            }
        }
        if (isAttribution(lines[i]) && i + 1 < lines.length && isQuoted(lines[i + 1])) {
            i++; // attribution directly before a quoted block — drop with it
            continue;
        }
        keep.push(lines[i]);
        i++;
    }
    return keep.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/**
 * Display name portion of a From header ("Ana <a@x>" -> "Ana").
 * Index-based (no regex over the name span) — the previous
 * /^\s*"?([^"<]+?)"?\s*</ pattern was O(n^2) on space-padded headers
 * (ReDoS, review finding issue-20 #2).
 */
function displayName(from) {
    const lt = from.indexOf('<');
    if (lt > 0) {
        let name = from.slice(0, lt).trim();
        if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
            name = name.slice(1, -1).trim();
        }
        if (name.length > 0)
            return name;
    }
    return from.replace(/[<>]/g, '').trim() || 'Unknown sender';
}
/** Extract bare email addresses from From/To headers for participants. */
function addresses(...headers) {
    const out = new Set();
    for (const h of headers) {
        for (const m of h.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g))
            out.add(m[0].toLowerCase());
    }
    return [...out];
}
/**
 * Group messages into threads via References/In-Reply-To chains with a
 * normalized-subject fallback, then render one IngestItem per thread.
 * Pure: stable output for a given input order. `origins` lets the runner
 * attribute each record to a source file in .eml directory mode.
 */
export function groupEmailThreads(emails, opts = {}) {
    const bulkIndices = [];
    const candidates = [];
    const seenIds = new Set();
    for (let i = 0; i < emails.length; i++) {
        const e = emails[i];
        if (!opts.includeBulk && e.isBulk) {
            bulkIndices.push(i);
            continue;
        }
        if (e.messageId && seenIds.has(e.messageId))
            continue; // duplicate within batch
        if (e.messageId)
            seenIds.add(e.messageId);
        if (e.body.trim().length === 0 && e.subject.trim().length === 0)
            continue;
        candidates.push({ email: e, index: i });
    }
    // Union by shared message-ID chains: every ID a message knows about
    // (its own + references + in-reply-to) points at one thread bucket.
    const idToThread = new Map();
    const subjectToThread = new Map();
    const threads = [];
    for (const { email: e, index } of candidates) {
        const ids = [e.messageId, e.inReplyTo, ...e.references].filter((x) => !!x);
        let thread = ids.map((id) => idToThread.get(id)).find((t) => t !== undefined);
        if (!thread) {
            const subj = normalizeSubject(e.subject);
            if (subj && ids.length === 0)
                thread = subjectToThread.get(subj);
            // Subject fallback also catches replies whose References point
            // outside the archive: same normalized subject + Re: prefix.
            if (!thread && subj && SUBJECT_PREFIX.test(e.subject.trim())) {
                thread = subjectToThread.get(subj);
            }
        }
        if (!thread) {
            thread = { emails: [], indices: [] };
            threads.push(thread);
        }
        thread.emails.push(e);
        thread.indices.push(index);
        for (const id of ids)
            idToThread.set(id, thread);
        const subj = normalizeSubject(e.subject);
        if (subj && !subjectToThread.has(subj))
            subjectToThread.set(subj, thread);
    }
    const items = [];
    const origins = [];
    const titleCounts = new Map();
    for (const thread of threads) {
        const order = thread.emails
            .map((e, k) => ({ e, k }))
            .sort((a, b) => (a.e.date ?? '').localeCompare(b.e.date ?? ''));
        const sorted = order.map(({ e }) => e);
        const origin = thread.indices[order[0].k];
        const multi = sorted.length > 1;
        const messages = [];
        for (const e of sorted) {
            const body = multi ? trimQuotedReplies(e.body) : e.body.trim();
            const text = body.trim().length > 0 ? body : e.body.trim(); // never emit empty from over-trimming
            if (text.length === 0)
                continue;
            const when = e.date ? ` (${e.date.slice(0, 10)})` : '';
            messages.push({ role: `From ${displayName(e.from)}${when}`, text });
        }
        if (messages.length === 0)
            continue;
        const first = sorted[0];
        const baseTitle = (normalizeSubject(first.subject) ? first.subject.replace(SUBJECT_PREFIX, '').trim() : '') || 'Untitled email thread';
        const seen = titleCounts.get(baseTitle) ?? 0;
        titleCounts.set(baseTitle, seen + 1);
        const title = seen === 0 ? baseTitle : `${baseTitle} (${seen + 1})`;
        const participants = addresses(...sorted.flatMap((e) => [e.from, e.to]));
        const dates = sorted.map((e) => e.date).filter((d) => !!d);
        const attachments = sorted.flatMap((e) => e.attachments);
        const meta = {
            participants,
            message_count: sorted.length,
            ...(dates.length > 0 ? { date_range: { from: dates[0], to: dates[dates.length - 1] } } : {}),
            ...(attachments.length > 0 ? { attachments } : {}),
        };
        for (const { title: t, content } of titleChunks(title, chunkConversation(messages))) {
            items.push({ title: t, content, type: 'reference', tags: ['email'], source_meta: meta });
            origins.push(origin);
        }
    }
    return { items, origins, bulkIndices };
}
//# sourceMappingURL=threads.js.map