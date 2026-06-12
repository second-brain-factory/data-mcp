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
import { generateSummary } from '../shared.js';
const tags = z.array(z.string().max(100)).max(20);
const keyResult = z.object({
    description: z.string().max(500),
    target: z.union([z.number(), z.string()]).optional(),
    current: z.union([z.number(), z.string()]).optional(),
});
/** URL-safe slug from a title (same rules as the folded blog_create). */
function slugify(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 200);
}
const nullable = (v) => v ?? null;
export const RECORD_COLLECTIONS = {
    knowledge: {
        collection: 'knowledge',
        summary: 'knowledge items (use knowledge_store/knowledge_recall for create/search)',
        ownerScope: true,
        updateSchema: z.object({
            title: z.string().min(1).max(500).optional(),
            content: z.string().min(1).max(10000).optional(),
            tags: tags.optional(),
            source: z.string().max(500).optional(),
            confidence: z.number().min(0).max(1).optional(),
        }).strict(),
        buildUpdate: (u) => {
            const updates = { ...u };
            if (typeof updates.title === 'string')
                updates.title = updates.title.trim();
            if (typeof updates.content === 'string')
                updates.summary = generateSummary(updates.content);
            return updates;
        },
        filterFields: ['type'],
        tagFilter: true,
        deletable: true,
    },
    decisions: {
        collection: 'decisions',
        summary: 'decision records with options considered and rationale',
        ownerScope: true,
        createSchema: z.object({
            title: z.string().min(1).max(500),
            context: z.string().max(5000).optional(),
            options_considered: z.array(z.string().max(500)).min(1),
            chosen_option: z.string().min(1).max(500),
            rationale: z.string().max(5000).optional(),
            tags: tags.optional(),
        }).strict(),
        buildCreate: (d) => ({
            title: d.title.trim(),
            context: nullable(d.context),
            options_considered: d.options_considered,
            chosen_option: d.chosen_option,
            rationale: nullable(d.rationale),
            outcome: null,
            tags: d.tags ?? [],
        }),
        filterFields: [],
        searchFields: ['title', 'context', 'chosen_option'],
        deletable: true,
    },
    sessions: {
        collection: 'sessions',
        summary: 'work session logs (use session_log to create)',
        ownerScope: true,
        filterFields: [],
    },
    goals: {
        collection: 'goals',
        summary: 'goals with key results and timeframes',
        ownerScope: true,
        createSchema: z.object({
            title: z.string().min(1).max(500),
            description: z.string().max(5000).optional(),
            timeframe: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
            key_results: z.array(keyResult).optional(),
            tags: tags.optional(),
        }).strict(),
        buildCreate: (d) => ({
            title: d.title.trim(),
            description: nullable(d.description),
            timeframe: d.timeframe,
            status: 'active',
            key_results: d.key_results ?? [],
            tags: d.tags ?? [],
        }),
        updateSchema: z.object({
            title: z.string().min(1).max(500).optional(),
            description: z.string().max(5000).optional(),
            status: z.enum(['active', 'completed', 'paused', 'abandoned']).optional(),
            key_results: z.array(keyResult).optional(),
            tags: tags.optional(),
        }).strict(),
        filterFields: ['status', 'timeframe'],
    },
    tasks: {
        collection: 'tasks',
        summary: 'tasks with status, priority, and due dates',
        ownerScope: true,
        createSchema: z.object({
            title: z.string().min(1).max(500),
            description: z.string().max(5000).optional(),
            priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
            due_date: z.string().max(50).optional(),
            tags: tags.optional(),
            goal_id: z.string().min(1).optional(),
        }).strict(),
        buildCreate: (d) => ({
            title: d.title.trim(),
            description: nullable(d.description),
            status: 'todo',
            priority: d.priority ?? 'medium',
            due_date: nullable(d.due_date),
            tags: d.tags ?? [],
            goal_id: nullable(d.goal_id),
        }),
        updateSchema: z.object({
            title: z.string().min(1).max(500).optional(),
            description: z.string().max(5000).optional(),
            status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).optional(),
            priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
            due_date: z.string().max(50).optional(),
            tags: tags.optional(),
        }).strict(),
        filterFields: ['status', 'priority'],
    },
    contacts: {
        collection: 'contacts',
        summary: 'people: colleagues, clients, partners',
        ownerScope: true,
        createSchema: z.object({
            name: z.string().min(1).max(200),
            company: z.string().max(200).optional(),
            role: z.string().max(200).optional(),
            email: z.string().max(200).optional(),
            phone: z.string().max(50).optional(),
            relationship: z.enum(['colleague', 'client', 'prospect', 'partner', 'other']).optional(),
            notes: z.string().max(5000).optional(),
            tags: tags.optional(),
        }).strict(),
        buildCreate: (d) => ({
            name: d.name.trim(),
            company: nullable(d.company),
            role: nullable(d.role),
            email: nullable(d.email),
            phone: nullable(d.phone),
            relationship: nullable(d.relationship),
            notes: nullable(d.notes),
            tags: d.tags ?? [],
            last_contact_date: null,
        }),
        updateSchema: z.object({
            name: z.string().min(1).max(200).optional(),
            company: z.string().max(200).optional(),
            role: z.string().max(200).optional(),
            email: z.string().max(200).optional(),
            phone: z.string().max(50).optional(),
            relationship: z.enum(['colleague', 'client', 'prospect', 'partner', 'other']).optional(),
            notes: z.string().max(5000).optional(),
            tags: tags.optional(),
            last_contact_date: z.string().max(50).optional(),
        }).strict(),
        filterFields: ['relationship'],
        searchFields: ['name', 'company', 'notes', 'role'],
    },
    prospects: {
        collection: 'prospects',
        summary: 'CRM pipeline with stages from new to closed',
        ownerScope: false,
        createSchema: z.object({
            name: z.string().min(1).max(200),
            email: z.string().max(200).optional(),
            company: z.string().max(200).optional(),
            role: z.string().max(200).optional(),
            stage: z.enum(['new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing']).optional(),
            source: z.string().max(200).optional(),
            estimated_value: z.number().int().optional(),
            next_action_type: z.string().max(100).optional(),
            next_followup_date: z.string().max(50).optional(),
            notes: z.string().max(10000).optional(),
            tags: tags.optional(),
            linkedin_url: z.string().max(500).optional(),
        }).strict(),
        buildCreate: (d) => ({
            name: d.name.trim(),
            email: nullable(d.email),
            company: nullable(d.company),
            role: nullable(d.role),
            stage: d.stage ?? 'new',
            source: nullable(d.source),
            estimated_value: nullable(d.estimated_value),
            next_action_type: nullable(d.next_action_type),
            next_followup_date: nullable(d.next_followup_date),
            notes: nullable(d.notes),
            tags: d.tags ?? [],
            linkedin_url: nullable(d.linkedin_url),
            last_contact_date: null,
        }),
        updateSchema: z.object({
            name: z.string().min(1).max(200).optional(),
            email: z.string().max(200).optional(),
            company: z.string().max(200).optional(),
            role: z.string().max(200).optional(),
            stage: z.enum(['new', 'contacted', 'responded', 'interested', 'ready_to_buy', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost', 'nurturing']).optional(),
            source: z.string().max(200).optional(),
            estimated_value: z.number().int().optional(),
            next_action_type: z.string().max(100).optional(),
            next_followup_date: z.string().max(50).optional(),
            last_contact_date: z.string().max(50).optional(),
            notes: z.string().max(10000).optional(),
            tags: tags.optional(),
            linkedin_url: z.string().max(500).optional(),
        }).strict(),
        filterFields: ['stage'],
        searchFields: ['name', 'company', 'notes', 'email'],
    },
    blog_posts: {
        collection: 'blog_posts',
        summary: 'blog posts with draft/published lifecycle and SEO fields',
        ownerScope: false,
        createSchema: z.object({
            title: z.string().min(1).max(500),
            slug: z.string().max(200).optional(),
            content: z.string().min(1).max(100000),
            excerpt: z.string().max(500).optional(),
            status: z.enum(['draft', 'published', 'archived']).optional(),
            tags: tags.optional(),
            seo_title: z.string().max(200).optional(),
            seo_description: z.string().max(300).optional(),
            og_image_url: z.string().max(500).optional(),
        }).strict(),
        buildCreate: (d) => {
            const status = d.status ?? 'draft';
            return {
                title: d.title.trim(),
                slug: d.slug || slugify(d.title),
                content: d.content,
                excerpt: nullable(d.excerpt),
                status,
                published_at: status === 'published' ? new Date().toISOString() : null,
                tags: d.tags ?? [],
                seo_title: nullable(d.seo_title),
                seo_description: nullable(d.seo_description),
                og_image_url: nullable(d.og_image_url),
            };
        },
        updateSchema: z.object({
            title: z.string().min(1).max(500).optional(),
            slug: z.string().max(200).optional(),
            content: z.string().min(1).max(100000).optional(),
            excerpt: z.string().max(500).optional(),
            status: z.enum(['draft', 'published', 'archived']).optional(),
            tags: tags.optional(),
            seo_title: z.string().max(200).optional(),
            seo_description: z.string().max(300).optional(),
            og_image_url: z.string().max(500).optional(),
        }).strict(),
        buildUpdate: (u) => {
            const updates = { ...u };
            if (typeof updates.status === 'string') {
                updates.published_at = updates.status === 'published' ? new Date().toISOString() : null;
            }
            return updates;
        },
        filterFields: ['status'],
        deletable: true,
    },
    content_calendar: {
        collection: 'content_calendar',
        summary: 'content calendar across platforms (idea to published)',
        ownerScope: false,
        createSchema: z.object({
            title: z.string().min(1).max(500),
            content: z.string().optional(),
            platform: z.enum(['linkedin', 'newsletter', 'blog', 'twitter', 'other']),
            pillar: z.string().max(100).optional(),
            status: z.enum(['idea', 'drafting', 'ready', 'published']).optional(),
            scheduled_date: z.string().max(50).optional(),
            persona: z.string().max(100).optional(),
        }).strict(),
        buildCreate: (d) => ({
            title: d.title.trim(),
            content: nullable(d.content),
            platform: d.platform,
            pillar: nullable(d.pillar),
            status: d.status ?? 'idea',
            scheduled_date: nullable(d.scheduled_date),
            persona: nullable(d.persona),
            published_url: null,
        }),
        updateSchema: z.object({
            title: z.string().min(1).max(500).optional(),
            content: z.string().optional(),
            platform: z.enum(['linkedin', 'newsletter', 'blog', 'twitter', 'other']).optional(),
            pillar: z.string().max(100).optional(),
            status: z.enum(['idea', 'drafting', 'ready', 'published']).optional(),
            scheduled_date: z.string().max(50).optional(),
            persona: z.string().max(100).optional(),
            published_url: z.string().max(500).optional(),
        }).strict(),
        filterFields: ['platform', 'status'],
    },
    email_queue: {
        collection: 'email_queue',
        summary: 'outbound email queue (queue only, never sends)',
        ownerScope: false,
        createSchema: z.object({
            to_email: z.string().min(1).max(200),
            to_name: z.string().max(200).optional(),
            subject: z.string().min(1).max(500),
            body_html: z.string().min(1).max(50000),
            body_text: z.string().optional(),
            sequence_id: z.string().max(100).optional(),
            sequence_step: z.number().int().optional(),
            prospect_id: z.string().min(1).optional(),
            scheduled_at: z.string().optional(),
        }).strict(),
        buildCreate: (d) => ({
            to_email: d.to_email,
            to_name: nullable(d.to_name),
            subject: d.subject,
            body_html: d.body_html,
            body_text: nullable(d.body_text),
            status: 'queued',
            sequence_id: nullable(d.sequence_id),
            sequence_step: nullable(d.sequence_step),
            prospect_id: nullable(d.prospect_id),
            scheduled_at: nullable(d.scheduled_at),
            sent_at: null,
            error: null,
            resend_id: null,
        }),
        filterFields: ['status'],
    },
    knowledge_links: {
        collection: 'knowledge_links',
        summary: 'links between knowledge items (use link_create/link_related to manage)',
        ownerScope: false,
        filterFields: [],
        deletable: true,
    },
};
export const CREATABLE = Object.keys(RECORD_COLLECTIONS).filter((k) => RECORD_COLLECTIONS[k].createSchema);
export const UPDATABLE = Object.keys(RECORD_COLLECTIONS).filter((k) => RECORD_COLLECTIONS[k].updateSchema);
export const QUERYABLE = Object.keys(RECORD_COLLECTIONS).filter((k) => k !== 'knowledge_links');
export const DELETABLE = Object.keys(RECORD_COLLECTIONS).filter((k) => RECORD_COLLECTIONS[k].deletable);
/** Human-readable field spec for a zod object schema (for self-correcting errors). */
export function describeSchema(schema) {
    const out = {};
    const shape = schema.shape;
    for (const [key, value] of Object.entries(shape)) {
        let v = value;
        let optional = false;
        while (v instanceof z.ZodOptional) {
            optional = true;
            v = v.unwrap();
        }
        let type;
        if (v instanceof z.ZodEnum)
            type = `enum: ${v.options.join('|')}`;
        else if (v instanceof z.ZodArray)
            type = 'array';
        else if (v instanceof z.ZodNumber)
            type = 'number';
        else if (v instanceof z.ZodString)
            type = 'string';
        else
            type = 'object';
        out[key] = optional ? `${type} (optional)` : type;
    }
    return out;
}
//# sourceMappingURL=registry.js.map