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
 * fails header parsing and is counted as a per-message error; the batch
 * continues (plan edge-case: degrade, never lose other messages).
 */
import { type ParsedEmail } from './mime.js';
/**
 * Max raw characters accumulated per message. A single message carrying a
 * giant base64 attachment must not blow the memory bound — beyond the cap
 * the remainder of the message is dropped (text parts precede attachments
 * in practice, attachments are skipped regardless, and splitMultipart
 * tolerates a missing closing boundary).
 */
export declare const MAX_RAW_MESSAGE_CHARS: number;
/** Reverse mbox From-escaping in a raw message body. */
export declare function unescapeFromLines(raw: string): string;
export interface MboxResult {
    emails: ParsedEmail[];
    messagesParsed: number;
    messageErrors: number;
}
/**
 * Stream an mbox file into ParsedEmails. Raw message text never exceeds
 * one (capped) message at a time in memory; parsed messages are capped by
 * mime.ts.
 */
export declare function readMbox(filePath: string): Promise<MboxResult>;
//# sourceMappingURL=mbox.d.ts.map