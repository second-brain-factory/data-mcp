/**
 * Format detection — extension first, content sniff to reject binaries.
 */
/** Map a file path to a format id, or null when unsupported. */
export declare function detectFormat(filePath: string): string | null;
/** Map a file path to a converted (office) format id, or null. */
export declare function detectConvertedFormat(filePath: string): string | null;
/**
 * Reject binary content: NUL bytes or a high ratio of control characters in
 * the first 8KB. UTF-16 files contain NULs and are treated as binary in v1.
 */
export declare function looksBinary(head: Buffer): boolean;
/** Strip a UTF-8 BOM if present. */
export declare function stripBom(content: string): string;
//# sourceMappingURL=detect.d.ts.map