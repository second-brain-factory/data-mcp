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

/** Map a file path to a format id, or null when unsupported. */
export function detectFormat(filePath: string): string | null {
    return EXTENSION_MAP[extname(filePath).toLowerCase()] ?? null;
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
