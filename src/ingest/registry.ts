/**
 * Parser registry — single source of truth mapping format id -> parser.
 *
 * To add a format: write a pure parser in parsers/, add the extension to
 * detect.ts EXTENSION_MAP, and register it here. Mirrors the pattern of
 * src/tools/records/registry.ts.
 */

import type { Parser } from './types.js';
import { parseMarkdown } from './parsers/markdown.js';
import { parseText } from './parsers/text.js';
import { parseCsv } from './parsers/csv.js';
import { parseJson } from './parsers/json.js';
import { parseHtml } from './parsers/html.js';

export const PARSER_REGISTRY: Record<string, Parser> = {
    markdown: parseMarkdown,
    text: parseText,
    csv: parseCsv,
    json: parseJson,
    html: parseHtml,
};

export const SUPPORTED_FORMATS = Object.keys(PARSER_REGISTRY);

/**
 * Office formats handled via the markitdown converter sidecar (issue #17).
 * Advertised in the tool description; requires markitdown at runtime.
 * Legacy variants (.doc/.xls/.ppt/.epub) are handled best-effort but not
 * advertised.
 */
export const CONVERTED_FORMATS = ['pdf', 'docx', 'xlsx', 'pptx'];
