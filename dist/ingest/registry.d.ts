/**
 * Parser registry — single source of truth mapping format id -> parser.
 *
 * To add a format: write a pure parser in parsers/, add the extension to
 * detect.ts EXTENSION_MAP, and register it here. Mirrors the pattern of
 * src/tools/records/registry.ts.
 */
import type { Parser } from './types.js';
export declare const PARSER_REGISTRY: Record<string, Parser>;
export declare const SUPPORTED_FORMATS: string[];
//# sourceMappingURL=registry.d.ts.map