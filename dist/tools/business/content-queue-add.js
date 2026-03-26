/**
 * Tool: content_queue_add
 *
 * Add content to the content calendar.
 */
import { z } from 'zod';
import { makeToolResponse, handleAdapterError, withGracefulDegradation } from '../shared.js';
export function registerContentQueueAdd(server, adapter) {
    server.tool('content_queue_add', 'Add content to the content calendar. Track ideas, drafts, and published content across platforms.', {
        title: z.string().min(1).max(500).describe('Content title'),
        content: z.string().optional().describe('Content body or notes'),
        platform: z.enum(['linkedin', 'newsletter', 'blog', 'twitter', 'other']).describe('Target platform'),
        pillar: z.string().max(100).optional().describe('Content pillar category'),
        status: z.enum(['idea', 'drafting', 'ready', 'published']).optional().describe('Content status (default: idea)'),
        scheduled_date: z.string().max(50).optional().describe('Scheduled publish date (ISO format)'),
        persona: z.string().max(100).optional().describe('Target audience persona'),
    }, withGracefulDegradation('content_calendar', adapter, async (params) => {
        try {
            const record = await adapter.create('content_calendar', {
                title: params.title.trim(),
                content: params.content ?? null,
                platform: params.platform,
                pillar: params.pillar ?? null,
                status: params.status ?? 'idea',
                scheduled_date: params.scheduled_date ?? null,
                published_url: null,
                persona: params.persona ?? null,
            });
            return makeToolResponse({
                created: true,
                item: { id: record.id, title: record.title, platform: record.platform, status: record.status, created_at: record.created_at },
                message: `Content added to calendar: "${params.title}" (${params.platform})`,
            });
        }
        catch (error) {
            return handleAdapterError(error, 'content_queue_add');
        }
    }));
}
//# sourceMappingURL=content-queue-add.js.map