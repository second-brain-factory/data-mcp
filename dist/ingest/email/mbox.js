/**
 * mbox streaming reader (issue #20) — the ONLY impure module in the email
 * pipeline. RFC 4155: messages are delimited by `From ` envelope lines at
 * column 0. Gmail Takeout mboxes are routinely multi-GB, so the file is
 * read as a stream and split incrementally; each raw message is handed to
 * the pure parseEmailMessage and its raw buffer is released immediately.
 * Combined with the 16KB/message body cap in mime.ts, memory stays bounded
 * regardless of file size (AC2).
 *
 * `>From ` unescaping: mbox writers escape body lines starting with
 * "From " by prefixing '>' (and stack '>' for already-escaped lines);
 * reversed here per RFC 4155.
 *
 * Split heuristic: a new message starts at a line matching
 * /^From \S+ /  (envelope sender + date follow). Plain "From " inside an
 * unescaped body (broken producers) can misfire — the resulting fragment
 * parses as a header-less message and degrades to (at worst) a junk
 * record; the batch continues (plan edge-case: degrade, never lose
 * other messages).
 */
import { createReadStream } from 'node:fs';
import { parseEmailMessage } from './mime.js';
/** A line that begins a new mbox message. */
const ENVELOPE_LINE = /^From \S+ +\S/;
/**
 * Max raw characters accumulated per message. A single message carrying a
 * giant base64 attachment must not blow the memory bound — beyond the cap
 * the remainder of the message is dropped (text parts precede attachments
 * in practice, attachments are skipped regardless, and splitMultipart
 * tolerates a missing closing boundary).
 */
export const MAX_RAW_MESSAGE_CHARS = 4 * 1024 * 1024;
/** Reverse mbox From-escaping in a raw message body. */
export function unescapeFromLines(raw) {
    return raw.replace(/^>(>*From )/gm, '$1');
}
/**
 * Stream an mbox file into ParsedEmails. Raw message text never exceeds
 * one (capped) message at a time in memory; parsed messages are capped by
 * mime.ts.
 */
export async function readMbox(filePath) {
    const emails = [];
    let messagesParsed = 0;
    let messageErrors = 0;
    let current = [];
    let currentChars = 0;
    let carry = '';
    const flush = () => {
        if (current.length === 0)
            return;
        const raw = unescapeFromLines(current.join('\n'));
        current = [];
        currentChars = 0;
        if (raw.trim().length === 0)
            return;
        try {
            emails.push(parseEmailMessage(raw));
            messagesParsed++;
        }
        catch {
            messageErrors++; // malformed message — batch continues
        }
    };
    const push = (l) => {
        if (currentChars >= MAX_RAW_MESSAGE_CHARS)
            return; // oversized message truncated
        current.push(l);
        currentChars += l.length + 1;
    };
    const stream = createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });
    for await (const chunk of stream) {
        const text = carry + chunk;
        const lines = text.split('\n');
        carry = lines.pop() ?? ''; // last element may be a partial line
        // A single newline-free run (e.g. unwrapped base64) must not
        // accumulate unbounded in `carry` and defeat MAX_RAW_MESSAGE_CHARS
        // (review finding issue-20 #3). Past the cap the message is being
        // truncated anyway, so keep only a tail long enough to detect the
        // next envelope line.
        if (carry.length > MAX_RAW_MESSAGE_CHARS) {
            carry = carry.slice(-1024);
        }
        for (const line of lines) {
            const l = line.endsWith('\r') ? line.slice(0, -1) : line;
            if (ENVELOPE_LINE.test(l)) {
                flush();
                continue; // envelope line itself is not part of the message
            }
            if (current.length === 0 && l.trim() === '')
                continue; // inter-message blank
            push(l);
        }
    }
    if (carry.length > 0) {
        const l = carry.endsWith('\r') ? carry.slice(0, -1) : carry;
        if (!ENVELOPE_LINE.test(l))
            push(l);
        else
            flush();
    }
    flush();
    return { emails, messagesParsed, messageErrors };
}
//# sourceMappingURL=mbox.js.map