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
/** Max decoded body characters kept per message. */
export declare const MAX_BODY_CHARS: number;
/**
 * Max raw HTML characters retained before tag-stripping. HTML markup
 * overhead means a 16KB text body can need far more raw HTML, but the
 * input to htmlToText must stay bounded — its lazy script/comment scans
 * are quadratic on adversarial unclosed tags (review finding issue-20 #4).
 */
export declare const MAX_HTML_CHARS: number;
export interface ParsedEmail {
    messageId: string | null;
    inReplyTo: string | null;
    /** Message-IDs from the References header, in order */
    references: string[];
    subject: string;
    from: string;
    to: string;
    /** ISO date string, or undefined when unparseable */
    date?: string;
    body: string;
    /** Attachment filenames (content skipped) */
    attachments: string[];
    /** List-Unsubscribe present or Precedence: bulk/list/junk */
    isBulk: boolean;
}
/** Case-insensitive header map; repeated headers joined (References-style). */
export type HeaderMap = Map<string, string>;
/** Split a raw message into unfolded headers + body at the first blank line. */
export declare function splitMessage(raw: string): {
    headers: HeaderMap;
    body: string;
};
/**
 * Decode RFC 2047 encoded-words: =?charset?B|Q?data?= (AC7). Adjacent
 * encoded-words separated only by whitespace are joined without the
 * whitespace (RFC 2047 §6.2).
 */
export declare function decodeEncodedWords(value: string): string;
/** Parse a Content-Type-style header into its value + parameters. */
export declare function parseContentType(header: string | undefined): {
    type: string;
    params: Record<string, string>;
};
/** Split a multipart body on its boundary lines into raw parts. */
export declare function splitMultipart(body: string, boundary: string): string[];
/**
 * Max characters retained per display header (subject/from/to). Headers
 * unfold with no length limit, so a single 4MB message could otherwise
 * retain multi-MB strings per email across a whole batch and hand
 * pathological inputs to downstream string work (review issue-20 #3 note).
 */
export declare const MAX_HEADER_CHARS = 1024;
/** Max message-IDs retained from a References header. Deep threads rarely
 * exceed a few dozen; threading only needs SOME shared ID, and the most
 * recent ancestors are likeliest to be in the same archive. Caps retention
 * for pathological multi-MB References headers. */
export declare const MAX_REFERENCES = 50;
/**
 * Parse one raw RFC 2822 message (headers + MIME body) into a ParsedEmail.
 * Pure; never does I/O. Throws only on truly unprocessable input — callers
 * isolate per-message errors.
 */
export declare function parseEmailMessage(raw: string): ParsedEmail;
//# sourceMappingURL=mime.d.ts.map