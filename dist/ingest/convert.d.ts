/**
 * Converter sidecar (issue #17) — shells out to markitdown to turn office
 * documents (PDF/DOCX/XLSX/PPTX) into markdown.
 *
 * Why a sidecar: data-mcp is Node with zero native deps by policy; all
 * serious office parsing is Python. The seam is just "binary that emits
 * markdown on stdout", so docling or any other converter can swap in later.
 *
 * Detection order (cached per converter instance = per ingest run):
 *   1. `markitdown --version` on PATH (user pip-installed)
 *   2. `uvx --from markitdown[all] markitdown --version` (uv users; may
 *      download packages on first run, hence the generous detect timeout)
 *
 * Conversion runs with a hard timeout and SIGKILL so a hung converter can
 * never wedge the MCP server. All errors surface as per-file ingest errors.
 */
export interface ConverterInfo {
    /** e.g. "markitdown@0.1.6" — stored in record metadata for provenance */
    id: string;
    command: string;
    prefixArgs: string[];
}
export interface Converter {
    /** Detect converter availability. Cached: subsequent calls are free. */
    available(): Promise<ConverterInfo | null>;
    /** Convert a file to markdown. Throws Error with a useful message. */
    convert(filePath: string): Promise<string>;
}
export declare const INSTALL_HINT = "install with: pip install 'markitdown[all]' (or install uv so the uvx fallback works)";
export declare const CONVERT_TIMEOUT_MS = 60000;
export interface ExecResult {
    stdout: string;
    stderr: string;
}
/** Injectable exec seam for tests. Rejects with stderr attached on failure. */
export type ExecImpl = (command: string, args: string[], options: {
    timeout: number;
    maxBuffer: number;
}) => Promise<ExecResult>;
export declare function createConverter(execImpl?: ExecImpl): Converter;
/**
 * Strip active content from converted markdown before storage. Office files
 * are untrusted input and markitdown passes embedded HTML through.
 */
export declare function sanitizeConverted(markdown: string): string;
//# sourceMappingURL=convert.d.ts.map