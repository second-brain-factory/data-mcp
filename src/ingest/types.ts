/**
 * Ingestion pipeline types (issue #16).
 *
 * Parsers are PURE: (content, ctx) -> IngestItem[]. Only the runner touches
 * the adapter, so parsers work identically on all backends.
 */

export interface IngestContext {
    /** Absolute path of the file being parsed (for titles/provenance) */
    filePath: string;
    /** Basename without extension — default title stem */
    baseName: string;
}

export interface IngestItem {
    /** Record title (unique within type+owner_scope for dedupe) */
    title: string;
    content: string;
    /** knowledge.type — parsers default to 'reference' */
    type: 'fact' | 'pattern' | 'insight' | 'lesson' | 'reference';
    tags: string[];
    /** Extra provenance merged into metadata */
    source_meta?: Record<string, unknown>;
}

export type Parser = (content: string, ctx: IngestContext) => IngestItem[];

export type FileStatus = 'created' | 'skipped_duplicate' | 'skipped_unsupported' | 'skipped_too_large' | 'skipped_empty' | 'error' | 'dry_run';

export interface FileReport {
    path: string;
    format: string | null;
    status: FileStatus;
    /** Number of records this file produced (or would produce in dry-run) */
    records: number;
    /** Records skipped within the file as duplicates */
    duplicates: number;
    error?: string;
}

export interface IngestSummary {
    dry_run: boolean;
    files_scanned: number;
    files_ingested: number;
    files_skipped: number;
    files_errored: number;
    records_created: number;
    records_deduplicated: number;
    /** True when the directory walk hit the max-files cap */
    capped: boolean;
    reports: FileReport[];
}
