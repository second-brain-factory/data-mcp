/**
 * Evernote ENEX parser (issue #19) — zero-dep regex extraction.
 *
 * ENEX is XML with CDATA-wrapped ENML per note. The format is regular
 * enough (flat <note> blocks, single-level fields) that regex extraction
 * beats adding an XML dependency. ENML content is HTML-like, so the
 * Phase-1 htmlToText helper strips it. One record per note; malformed
 * notes are skipped individually so one bad note never drops the file.
 */
import type { Parser } from '../types.js';
export declare const parseEnex: Parser;
//# sourceMappingURL=enex.d.ts.map