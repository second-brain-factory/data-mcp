/**
 * Minimal RFC 2822/MIME message parser (issue #20) — PURE function over one
 * raw email message. Hand-rolled because no maintained zero-dep npm MIME
 * parser exists (mailparser pulls a large tree); the subset we need —
 * header unfolding, RFC 2047 encoded-words, multipart walk, base64 +
 * quoted-printable — is bounded and well-specified.
 *
 * Scope decisions:
 * - Body text capped at 16KB per message (records cap content at 10000
 *   chars; this is what bounds memory for the mbox streaming path).
 * - Prefer text/plain; fall back to tag-stripped text/html (htmlToText).
 * - Attachment parts are skipped; filenames recorded.
 * - Charsets: utf-8/iso-8859-1/us-ascii via Buffer; anything else is
 *   best-effort via TextDecoder, degrading to latin1. Never throws on a
 *   bad charset — per-message error isolation lives in the caller.
 */
import { htmlToText } from '../parsers/html.js';
/** Max decoded body characters kept per message. */
export const MAX_BODY_CHARS = 16 * 1024;
/**
 * Max raw HTML characters retained before tag-stripping. HTML markup
 * overhead means a 16KB text body can need far more raw HTML, but the
 * input to htmlToText must stay bounded — its lazy script/comment scans
 * are quadratic on adversarial unclosed tags (review finding issue-20 #4).
 */
export const MAX_HTML_CHARS = 4 * MAX_BODY_CHARS;
/** Split a raw message into unfolded headers + body at the first blank line. */
export function splitMessage(raw) {
    const norm = raw.replace(/\r\n/g, '\n');
    const sep = norm.indexOf('\n\n');
    const headerBlock = sep === -1 ? norm : norm.slice(0, sep);
    const body = sep === -1 ? '' : norm.slice(sep + 2);
    const headers = new Map();
    // Unfold: continuation lines start with SP/TAB (RFC 2822 §2.2.3)
    const unfolded = headerBlock.replace(/\n[ \t]+/g, ' ');
    for (const line of unfolded.split('\n')) {
        const colon = line.indexOf(':');
        if (colon <= 0)
            continue;
        const name = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        headers.set(name, headers.has(name) ? `${headers.get(name)} ${value}` : value);
    }
    return { headers, body };
}
function decodeCharset(bytes, charset) {
    const cs = charset.toLowerCase().replace(/['"]/g, '').trim();
    if (cs === 'utf-8' || cs === 'utf8' || cs === 'us-ascii' || cs === 'ascii' || cs === '') {
        return bytes.toString('utf8');
    }
    if (cs === 'iso-8859-1' || cs === 'latin1' || cs === 'windows-1252' || cs === 'cp1252') {
        return bytes.toString('latin1');
    }
    try {
        return new TextDecoder(cs).decode(bytes);
    }
    catch {
        return bytes.toString('latin1'); // best-effort, never throw
    }
}
/** Decode quoted-printable text to bytes (handles soft line breaks). */
function qpToBytes(text, qEncoding) {
    const src = text.replace(/=\n/g, ''); // soft breaks (input already LF-normalized)
    const bytes = [];
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
            bytes.push(parseInt(src.slice(i + 1, i + 3), 16));
            i += 2;
        }
        else if (qEncoding && ch === '_') {
            bytes.push(0x20); // RFC 2047 Q: underscore is space
        }
        else {
            bytes.push(src.charCodeAt(i) & 0xff);
        }
    }
    return Buffer.from(bytes);
}
/**
 * Decode RFC 2047 encoded-words: =?charset?B|Q?data?= (AC7). Adjacent
 * encoded-words separated only by whitespace are joined without the
 * whitespace (RFC 2047 §6.2).
 */
export function decodeEncodedWords(value) {
    return value
        .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1')
        .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset, enc, data) => {
        try {
            const bytes = enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64') : qpToBytes(data, true);
            return decodeCharset(bytes, charset);
        }
        catch {
            return _m; // leave undecodable words as-is
        }
    });
}
/** Parse a Content-Type-style header into its value + parameters. */
export function parseContentType(header) {
    if (!header)
        return { type: 'text/plain', params: {} };
    const [type, ...rest] = header.split(';');
    const params = {};
    for (const part of rest) {
        const eq = part.indexOf('=');
        if (eq <= 0)
            continue;
        params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1');
    }
    return { type: type.trim().toLowerCase(), params };
}
/** Decode a part body per its Content-Transfer-Encoding + charset. */
function decodePartBody(body, encoding, charset) {
    const enc = (encoding ?? '7bit').toLowerCase().trim();
    if (enc === 'base64') {
        return decodeCharset(Buffer.from(body.replace(/\s+/g, ''), 'base64'), charset);
    }
    if (enc === 'quoted-printable') {
        return decodeCharset(qpToBytes(body, false), charset);
    }
    // 7bit/8bit/binary: bytes already arrived as a JS string; re-decode
    // non-utf8 charsets from their latin1-equivalent code units.
    if (charset && !/^(utf-?8|us-ascii|ascii)?$/i.test(charset.replace(/['"]/g, '').trim())) {
        return decodeCharset(Buffer.from(body, 'latin1'), charset);
    }
    return body;
}
/** Recursive MIME part walk — fills text/html/attachments. */
function walkPart(headers, body, out, depth) {
    if (depth > 10)
        return; // pathological nesting guard
    const { type, params } = parseContentType(headers.get('content-type'));
    const disposition = parseContentType(headers.get('content-disposition'));
    const filename = disposition.params.filename ?? params.name;
    if (disposition.type === 'attachment' || (filename && !type.startsWith('text/') && !type.startsWith('multipart/'))) {
        if (filename)
            out.attachments.push(decodeEncodedWords(filename));
        return;
    }
    if (type.startsWith('multipart/')) {
        const boundary = params.boundary;
        if (!boundary)
            return;
        for (const part of splitMultipart(body, boundary)) {
            const sub = splitMessage(part);
            walkPart(sub.headers, sub.body, out, depth + 1);
        }
        return;
    }
    const decoded = decodePartBody(body, headers.get('content-transfer-encoding'), params.charset ?? '');
    // Slice each part to the remaining budget BEFORE appending: the old
    // check-then-append let one oversized part flow uncapped into
    // htmlToText (review finding issue-20 #4).
    if (type === 'text/plain' || type === 'text') {
        const budget = MAX_BODY_CHARS - out.text.length;
        if (budget > 0) {
            const piece = decoded.slice(0, budget);
            out.text = out.text ? `${out.text}\n\n${piece}` : piece;
        }
    }
    else if (type === 'text/html') {
        const budget = MAX_HTML_CHARS - out.html.length;
        if (budget > 0) {
            const piece = decoded.slice(0, budget);
            out.html = out.html ? `${out.html}\n` + piece : piece;
        }
    }
    else if (filename) {
        out.attachments.push(decodeEncodedWords(filename));
    }
}
/** Split a multipart body on its boundary lines into raw parts. */
export function splitMultipart(body, boundary) {
    const parts = [];
    const lines = body.split('\n');
    let current = null;
    const open = `--${boundary}`;
    const close = `--${boundary}--`;
    for (const line of lines) {
        const trimmed = line.trimEnd();
        if (trimmed === close) {
            if (current)
                parts.push(current.join('\n'));
            current = null;
            break;
        }
        if (trimmed === open) {
            if (current)
                parts.push(current.join('\n'));
            current = [];
            continue;
        }
        if (current)
            current.push(line);
    }
    // Tolerate a missing closing boundary (truncated messages)
    if (current && current.length > 0)
        parts.push(current.join('\n'));
    return parts;
}
/**
 * Max characters retained per display header (subject/from/to). Headers
 * unfold with no length limit, so a single 4MB message could otherwise
 * retain multi-MB strings per email across a whole batch and hand
 * pathological inputs to downstream string work (review issue-20 #3 note).
 */
export const MAX_HEADER_CHARS = 1024;
/** Max message-IDs retained from a References header. Deep threads rarely
 * exceed a few dozen; threading only needs SOME shared ID, and the most
 * recent ancestors are likeliest to be in the same archive. Caps retention
 * for pathological multi-MB References headers. */
export const MAX_REFERENCES = 50;
/** Extract `<id>` tokens from a References/In-Reply-To header value. */
function messageIds(value) {
    if (!value)
        return [];
    const ids = [...value.matchAll(/<([^<>]+)>/g)].map((m) => m[1]);
    return ids.length > MAX_REFERENCES ? ids.slice(-MAX_REFERENCES) : ids;
}
/** Normalize an RFC 2822 Date header to ISO, or undefined. */
function toIso(value) {
    if (!value)
        return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
/**
 * Parse one raw RFC 2822 message (headers + MIME body) into a ParsedEmail.
 * Pure; never does I/O. Throws only on truly unprocessable input — callers
 * isolate per-message errors.
 */
export function parseEmailMessage(raw) {
    const { headers, body } = splitMessage(raw);
    const out = { text: '', html: '', attachments: [] };
    walkPart(headers, body, out, 0);
    let text = out.text.trim();
    if (!text && out.html) {
        text = htmlToText(out.html).text; // html-only message — fall back
    }
    if (text.length > MAX_BODY_CHARS)
        text = text.slice(0, MAX_BODY_CHARS);
    const precedence = (headers.get('precedence') ?? '').toLowerCase();
    return {
        messageId: messageIds(headers.get('message-id'))[0] ?? null,
        inReplyTo: messageIds(headers.get('in-reply-to'))[0] ?? null,
        references: messageIds(headers.get('references')),
        subject: decodeEncodedWords((headers.get('subject') ?? '').slice(0, MAX_HEADER_CHARS)).trim(),
        from: decodeEncodedWords((headers.get('from') ?? '').slice(0, MAX_HEADER_CHARS)).trim(),
        to: decodeEncodedWords((headers.get('to') ?? '').slice(0, MAX_HEADER_CHARS)).trim(),
        date: toIso(headers.get('date')),
        body: text,
        attachments: out.attachments,
        isBulk: headers.has('list-unsubscribe') || precedence === 'bulk' || precedence === 'list' || precedence === 'junk',
    };
}
//# sourceMappingURL=mime.js.map