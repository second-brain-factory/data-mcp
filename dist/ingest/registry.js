/**
 * Parser registry — single source of truth mapping format id -> parser.
 *
 * To add a format: write a pure parser in parsers/, add the extension to
 * detect.ts EXTENSION_MAP, and register it here. Mirrors the pattern of
 * src/tools/records/registry.ts.
 */
import { parseMarkdown } from './parsers/markdown.js';
import { parseText } from './parsers/text.js';
import { parseCsv } from './parsers/csv.js';
import { parseJson } from './parsers/json.js';
import { parseHtml } from './parsers/html.js';
import { parseChatGpt } from './parsers/chatgpt.js';
import { parseClaude } from './parsers/claude.js';
/** Extension-detected formats — drives the advertised extension list. */
const BASE_PARSERS = {
    markdown: parseMarkdown,
    text: parseText,
    csv: parseCsv,
    json: parseJson,
    html: parseHtml,
};
/**
 * Content-refined formats (issue #18): both vendors ship a
 * `conversations.json`, so detection is by shape (detect.ts
 * refineJsonFormat), not extension. Registered here so the runner's single
 * registry lookup covers them.
 */
const REFINED_PARSERS = {
    chatgpt: parseChatGpt,
    claude: parseClaude,
};
export const PARSER_REGISTRY = {
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
//# sourceMappingURL=registry.js.map