/**
 * Office parser (issue #17) — PURE function over markdown emitted by the
 * converter sidecar. Never touches the filesystem or the converter; the
 * runner converts first and passes the markdown in via OfficeContext.
 *
 * Format-aware splitting (markitdown output shapes, verified live v0.1.6):
 *   xlsx — `## SheetName` per sheet  -> one record per sheet (AC6)
 *   pptx — `<!-- Slide number: N -->` markers -> one record per slide
 *   pdf/docx and everything else    -> H1/H2 section split (markdown parser logic)
 */
import type { IngestItem, IngestContext } from '../types.js';
export interface OfficeContext extends IngestContext {
    /** Detected source format: pdf | docx | xlsx | pptx | epub | doc | xls | ppt */
    format: string;
}
/** Parse converter-emitted markdown into ingest items. */
export declare function parseOffice(markdown: string, ctx: OfficeContext): IngestItem[];
//# sourceMappingURL=office.d.ts.map