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
import { execFile } from 'node:child_process';
export const INSTALL_HINT = "install with: pip install 'markitdown[all]' (or install uv so the uvx fallback works)";
export const CONVERT_TIMEOUT_MS = 60_000;
const DETECT_TIMEOUT_MS = 120_000; // uvx may download packages on first run
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const defaultExec = (command, args, options) => new Promise((resolvePromise, reject) => {
    execFile(command, args, { ...options, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
        if (error) {
            const err = error;
            err.stderr = stderr;
            reject(err);
            return;
        }
        resolvePromise({ stdout, stderr });
    });
});
const CANDIDATES = [
    { command: 'markitdown', prefixArgs: [] },
    { command: 'uvx', prefixArgs: ['--from', 'markitdown[all]', 'markitdown'] },
];
export function createConverter(execImpl = defaultExec) {
    let detection = null;
    async function detect() {
        for (const candidate of CANDIDATES) {
            try {
                const { stdout } = await execImpl(candidate.command, [...candidate.prefixArgs, '--version'], {
                    timeout: DETECT_TIMEOUT_MS,
                    maxBuffer: 1024 * 1024,
                });
                const version = stdout.match(/markitdown\s+([\d.]+)/i)?.[1] ?? 'unknown';
                return { id: `markitdown@${version}`, ...candidate };
            }
            catch {
                // try next candidate
            }
        }
        return null;
    }
    return {
        available() {
            if (!detection)
                detection = detect();
            return detection;
        },
        async convert(filePath) {
            const info = await this.available();
            if (!info)
                throw new Error(`converter unavailable — ${INSTALL_HINT}`);
            try {
                const { stdout } = await execImpl(info.command, [...info.prefixArgs, filePath], {
                    timeout: CONVERT_TIMEOUT_MS,
                    maxBuffer: MAX_OUTPUT_BYTES,
                });
                return stdout;
            }
            catch (error) {
                const err = error;
                if (err.killed || err.signal === 'SIGKILL') {
                    throw new Error(`conversion timed out after ${CONVERT_TIMEOUT_MS / 1000}s`);
                }
                const tail = (err.stderr ?? '').trim().split('\n').filter(Boolean).slice(-3).join(' | ');
                throw new Error(`conversion failed${tail ? `: ${tail.slice(0, 500)}` : ''}`);
            }
        },
    };
}
/**
 * Strip active content from converted markdown before storage. Office files
 * are untrusted input and markitdown passes embedded HTML through.
 */
export function sanitizeConverted(markdown) {
    return markdown
        .replace(/<(script|iframe|object|embed|style)\b[\s\S]*?<\/\1>/gi, '')
        .replace(/<(script|iframe|object|embed)\b[^>]*\/?>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(\]\(\s*)javascript:[^)]*(\))/gi, '$1#$2');
}
//# sourceMappingURL=convert.js.map