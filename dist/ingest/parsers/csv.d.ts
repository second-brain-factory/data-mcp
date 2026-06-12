/**
 * CSV parser — minimal RFC 4180 (quoted fields, embedded commas/newlines).
 * Small files become one labeled record; large files batch rows.
 */
import type { Parser } from '../types.js';
/** Parse CSV text into rows of fields (RFC 4180 subset). */
export declare function parseCsvRows(content: string): string[][];
export declare const parseCsv: Parser;
//# sourceMappingURL=csv.d.ts.map