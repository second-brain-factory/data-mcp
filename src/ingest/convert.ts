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

export const INSTALL_HINT = "install with: pip install 'markitdown[all]' (or install uv so the uvx fallback works)";

export const CONVERT_TIMEOUT_MS = 60_000;
const DETECT_TIMEOUT_MS = 120_000; // uvx may download packages on first run
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export interface ExecResult {
    stdout: string;
    stderr: string;
}

/** Injectable exec seam for tests. Rejects with stderr attached on failure. */
export type ExecImpl = (command: string, args: string[], options: { timeout: number; maxBuffer: number }) => Promise<ExecResult>;

const defaultExec: ExecImpl = (command, args, options) =>
    new Promise((resolvePromise, reject) => {
        execFile(command, args, { ...options, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
            if (error) {
                const err = error as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };
                err.stderr = stderr;
                reject(err);
                return;
            }
            resolvePromise({ stdout, stderr });
        });
    });

const CANDIDATES: Array<{ command: string; prefixArgs: string[] }> = [
    { command: 'markitdown', prefixArgs: [] },
    { command: 'uvx', prefixArgs: ['--from', 'markitdown[all]', 'markitdown'] },
];

export function createConverter(execImpl: ExecImpl = defaultExec): Converter {
    let detection: Promise<ConverterInfo | null> | null = null;

    async function detect(): Promise<ConverterInfo | null> {
        for (const candidate of CANDIDATES) {
            try {
                const { stdout } = await execImpl(candidate.command, [...candidate.prefixArgs, '--version'], {
                    timeout: DETECT_TIMEOUT_MS,
                    maxBuffer: 1024 * 1024,
                });
                const version = stdout.match(/markitdown\s+([\d.]+)/i)?.[1] ?? 'unknown';
                return { id: `markitdown@${version}`, ...candidate };
            } catch {
                // try next candidate
            }
        }
        return null;
    }

    return {
        available(): Promise<ConverterInfo | null> {
            if (!detection) detection = detect();
            return detection;
        },
        async convert(filePath: string): Promise<string> {
            const info = await this.available();
            if (!info) throw new Error(`converter unavailable — ${INSTALL_HINT}`);
            try {
                const { stdout } = await execImpl(info.command, [...info.prefixArgs, filePath], {
                    timeout: CONVERT_TIMEOUT_MS,
                    maxBuffer: MAX_OUTPUT_BYTES,
                });
                return stdout;
            } catch (error) {
                const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string; stderr?: string };
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
export function sanitizeConverted(markdown: string): string {
    return markdown
        .replace(/<(script|iframe|object|embed|style)\b[\s\S]*?<\/\1>/gi, '')
        .replace(/<(script|iframe|object|embed)\b[^>]*\/?>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(\]\(\s*)javascript:[^)]*(\))/gi, '$1#$2');
}
