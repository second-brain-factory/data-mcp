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
import { parseChatGpt } from './parsers/chatgpt.js';
import { parseClaude } from './parsers/claude.js';
import { parseEnex } from './parsers/enex.js';
import { parseKeep } from './parsers/keep.js';

/** Extension-detected formats — drives the advertised extension list. */
const BASE_PARSERS: Record<string, Parser> = {
    markdown: parseMarkdown,
    text: parseText,
    csv: parseCsv,
    json: parseJson,
    html: parseHtml,
    enex: parseEnex,
};

/**
 * Content-refined formats (issues #18/#19): chat exports and Keep notes are
 * all `.json` files — shape, not extension, picks the parser (detect.ts
 * refineJsonFormat). Registered here so the runner's single registry lookup
 * covers them.
 */
const REFINED_PARSERS: Record<string, Parser> = {
    chatgpt: parseChatGpt,
    claude: parseClaude,
    keep: parseKeep,
};

export const PARSER_REGISTRY: Record<string, Parser> = {
    ...BASE_PARSERS,
    ...REFINED_PARSERS,
};

export const SUPPORTED_FORMATS = Object.keys(BASE_PARSERS);

/**
 * Office formats handled via the markitdown converter sidecar (issue #17).
 * Advertised in the tool description; requires markitdown at runtime.
 * Legacy variants (.doc/.xls/.ppt/.epub) are handled best-effort but not
 * advertised.
 */
export const CONVERTED_FORMATS = ['pdf', 'docx', 'xlsx', 'pptx'];
