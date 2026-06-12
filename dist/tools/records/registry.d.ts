/**
 * Per-collection registry for the generic record_* tools (issue #13).
 *
 * Single source of truth for: create/update validation schemas, defaults,
 * computed fields, owner-scope support, allowed filter fields, and text
 * search fields. The four generic tools (record_create / record_update /
 * record_query / record_delete) consult this registry instead of having one
 * bespoke tool per collection — 27 thin CRUD tools folded into 4.
 *
 * Behavior preserved from the folded tools:
 * - knowledge update regenerates summary when content changes
 * - blog create slugifies the title; status 'published' stamps published_at
 *   (and any other status clears it) on both create and update
 * - decisions create seeds outcome: null and requires >=1 options_considered
 * - contacts/prospects seed last_contact_date: null
 * - status/priority/stage defaults (todo/medium/new/draft/idea/queued)
 * - owner_scope only on memory collections, and only when the adapter
 *   has owner scoping enabled (checked by the tools)
 */
import { z } from 'zod';
export interface CollectionSpec {
    /** Physical collection name (registry key is also the public name). */
    collection: string;
    /** One-line purpose, surfaced in tool enum descriptions. */
    summary: string;
    /** Whether records support owner_scope (team mode). */
    ownerScope: boolean;
    /** Create payload schema; absent = not creatable via record_create. */
    createSchema?: z.ZodTypeAny;
    /** Map validated create payload to the stored record (defaults, computed fields). */
    buildCreate?: (data: Record<string, unknown>) => Record<string, unknown>;
    /** Update payload schema (partial, no id); absent = not updatable. */
    updateSchema?: z.ZodTypeAny;
    /** Post-process validated updates (computed fields). */
    buildUpdate?: (updates: Record<string, unknown>) => Record<string, unknown>;
    /** Fields allowed as equality filters in record_query. */
    filterFields: string[];
    /** Fields used for text search in record_query; absent = not searchable. */
    searchFields?: string[];
    /** Whether tag AND-contains filtering applies (knowledge semantics). */
    tagFilter?: boolean;
    /** Whether record_delete may target this collection. */
    deletable?: boolean;
}
export declare const RECORD_COLLECTIONS: Record<string, CollectionSpec>;
export declare const CREATABLE: [string, ...string[]];
export declare const UPDATABLE: [string, ...string[]];
export declare const QUERYABLE: [string, ...string[]];
export declare const DELETABLE: [string, ...string[]];
/** Human-readable field spec for a zod object schema (for self-correcting errors). */
export declare function describeSchema(schema: z.ZodTypeAny): Record<string, string>;
//# sourceMappingURL=registry.d.ts.map