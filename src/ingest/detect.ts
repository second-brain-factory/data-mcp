/**
 * Format detection — extension first, content sniff to reject binaries.
 */

import { extname } from 'node:path';

const EXTENSION_MAP: Record<string, string> = {
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.txt': 'text',
    '.text': 'text',
    '.csv': 'csv',
    '.json': 'json',
    '.html': 'html',
    '.htm': 'html',
};

/**
 * Office/document formats requiring conversion (issue #17). Values are the
 * format id passed to the office parser. Advertised: pdf/docx/xlsx/pptx.
 * Legacy/extra (epub/doc/xls/ppt) are best-effort pass-through — handled,
 * never advertised.
 */
const CONVERTED_EXTENSION_MAP: Record<string, string> = {
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.xlsx': 'xlsx',
    '.pptx': 'pptx',
    '.epub': 'epub',
    '.doc': 'doc',
    '.xls': 'xls',
    '.ppt': 'ppt',
};

/** Map a file path to a format id, or null when unsupported. */
export function detectFormat(filePath: string): string | null {
    return EXTENSION_MAP[extname(filePath).toLowerCase()] ?? null;
}

/** Map a file path to a converted (office) format id, or null. */
export function detectConvertedFormat(filePath: string): string | null {
    return CONVERTED_EXTENSION_MAP[extname(filePath).toLowerCase()] ?? null;
}

/**
 * Refine a generic `json` detection into a chat-export format (issue #18).
 * Pure string heuristic on a bounded prefix — exports can be 100MB+, so we
 * never JSON.parse here; the vendor parsers do strict validation and any
 * mismatch surfaces as a per-file parse error.
 *
 * ChatGPT conversations.json: array elements carry `"mapping"` (node graph)
 * and `"current_node"`. Claude conversations.json: elements carry
 * `"chat_messages"`. Both keys are vendor-specific enough that a prefix
 * scan is unambiguous; generic JSON stays `json`.
 */
export function refineJsonFormat(content: string): 'chatgpt' | 'claude' | 'json' {
    const head = content.slice(0, 65536);
    if (!/^\s*\[\s*\{/.test(head)) return 'json'; // chat exports are arrays of objects
    // ChatGPT: "mapping" appears early in each element; "current_node" comes
    // AFTER the (potentially huge) mapping, so confirm it on the full string
    // (native includes scan — cheap even at 100MB).
    if (head.includes('"mapping"') && content.includes('"current_node"')) return 'chatgpt';
    if (head.includes('"chat_messages"')) return 'claude';
    return 'json';
}

/**
 * Reject binary content: NUL bytes or a high ratio of control characters in
 * the first 8KB. UTF-16 files contain NULs and are treated as binary in v1.
 */
export function looksBinary(head: Buffer): boolean {
    const len = Math.min(head.length, 8192);
    if (len === 0) return false;
    let control = 0;
    for (let i = 0; i < len; i++) {
        const b = head[i];
        if (b === 0) return true;
        // allow tab(9), LF(10), CR(13); count other C0 controls
        if (b < 32 && b !== 9 && b !== 10 && b !== 13) control++;
    }
    return control / len > 0.05;
}

/** Strip a UTF-8 BOM if present. */
export function stripBom(content: string): string {
    return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}
